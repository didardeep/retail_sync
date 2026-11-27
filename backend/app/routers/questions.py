import datetime as dt
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import distinct, func
from sqlalchemy.orm import Session

from ..auth import get_staff_user, require_roles
from ..annexure_table import clean_template
from ..db import get_db
from ..models import (CRITICALITIES, ROLE_ADMIN, ROLE_AUDIT_MANAGER, ROLE_AUDITOR,
                      Audit, AuditResponse, ChecklistItem, Question, User)
from ..schemas import QuestionApprove, QuestionCreate, QuestionEdit, QuestionRestore
from ..services import log_action
from ..services.alerts import notify

QUESTION_DECISIONS = ("APPROVED", "REJECTED")

# What makes up a version's content. Two versions with the same content are the
# same question; the history shows the differences between them field by field.
VERSIONED_FIELDS = (
    "text", "process", "sub_process", "audit_type", "criticality", "active",
    "photo_video_enablement", "data_analyst_enabled", "data_analyst_reference", "annex",
)
VERSIONED_META = ("tags", "annexure")

router = APIRouter(prefix="/api/questions", tags=["questions"])
manager_only = require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)


def _criticality(level, weight=None, is_critical=None, fallback="Low"):
    """The criticality to save. An explicit level must be High, Medium or Low; a
    client that still sends only weight / is_critical gets the level they imply."""
    if level is not None:
        if level not in CRITICALITIES:
            raise HTTPException(status_code=422, detail={
                "error": f"criticality must be one of {', '.join(CRITICALITIES)}"})
        return level
    if is_critical:
        return "High"
    if weight is not None:
        return "High" if weight >= 5 else "Medium" if weight >= 3 else "Low"
    if is_critical is False and fallback == "High":
        return "Medium"
    return fallback


def _meta_with_clean_annexure(meta):
    """meta with its annexure layout checked and tidied (dropped when empty)."""
    meta = dict(meta or {})
    try:
        template = clean_template(meta.get("annexure"))
    except ValueError as e:
        raise HTTPException(status_code=422, detail={"error": str(e)})
    if template:
        meta["annexure"] = template
    else:
        meta.pop("annexure", None)
    return meta


def _content(q):
    """The parts of a question version that the history compares."""
    out = {f: getattr(q, f) for f in VERSIONED_FIELDS}
    out["criticality"] = out["criticality"] or "Low"
    meta = q.meta or {}
    out["tags"] = meta.get("tags") or []
    out["annexure"] = meta.get("annexure")
    return out


def _changes(before, after):
    """{field: [old, new]} for each field that differs, like a diff of two commits."""
    a, b = _content(before), _content(after)
    return {f: [a[f], b[f]] for f in a if a[f] != b[f]}


def _untouched_planned_audits(db):
    """Ids of Planned audits with no answer yet (a subquery)."""
    answered = (db.query(AuditResponse.audit_id)
                .filter(func.coalesce(AuditResponse.answer, "") != ""))
    return (db.query(Audit.id)
            .filter(Audit.status == "Planned", ~Audit.id.in_(answered))
            .scalar_subquery())


def _save_version(db, current, user, fields, meta, note, action, log_extra=None):
    """Save a new current version on top of `current` (a commit). Returns
    (new_version, changes); nothing is saved when nothing would change.
    Checklists and Planned audits with nothing answered move to the new version;
    audits with answers keep the version they were made with."""
    new = Question(
        code=current.code, version=current.version + 1, is_current=True,
        approval_status="APPROVED", approved_by_id=user.id,
        proposed_by_id=current.proposed_by_id,
        edited_by_id=user.id, change_note=(note or "").strip() or None,
        meta=meta,
        **{f: fields.get(f, getattr(current, f)) for f in VERSIONED_FIELDS if f != "criticality"},
    )
    new.set_criticality(fields.get("criticality") or current.criticality or "Low")
    changes = _changes(current, new)
    if not changes:
        return current, {}
    current.is_current = False
    db.add(new)
    db.flush()
    db.query(ChecklistItem).filter(ChecklistItem.question_id == current.id).update(
        {ChecklistItem.question_id: new.id}, synchronize_session=False)
    # Scheduled audits nobody has started yet follow too. Once an audit has an
    # answer (Ongoing and later) it keeps its wording, so nothing changes under
    # an auditor mid-audit or on a phone holding an offline copy.
    db.query(AuditResponse).filter(
        AuditResponse.question_id == current.id,
        AuditResponse.audit_id.in_(_untouched_planned_audits(db)),
    ).update({AuditResponse.question_id: new.id}, synchronize_session=False)
    log_action(db, user.id, action, "question", new.id, {
        "code": new.code, "version": new.version, "note": new.change_note,
        "changes": changes, **(log_extra or {})})
    return new, changes


def _audit_counts(db, ids):
    """How many audits used each question version."""
    rows = (db.query(AuditResponse.question_id, func.count(distinct(AuditResponse.audit_id)))
            .filter(AuditResponse.question_id.in_(ids)).group_by(AuditResponse.question_id).all())
    return dict(rows)


def _history_entries(db, versions):
    """Versions of one code, oldest first, each with its changes from the one before."""
    counts = _audit_counts(db, [v.id for v in versions])
    out, prev = [], None
    for v in versions:
        out.append({
            **v.to_dict(),
            "changes": _changes(prev, v) if prev else {},
            "audit_count": counts.get(v.id, 0),
        })
        prev = v
    return out


@router.get("")
def list_questions(
    process: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_staff_user),
):
    q = db.query(Question).filter(Question.is_current.is_(True))
    if process:
        q = q.filter(Question.process == process)
    if status:
        q = q.filter(Question.approval_status == status)
    elif user.role == ROLE_AUDITOR:
        q = q.filter(Question.approval_status == "APPROVED")
    return [x.to_dict() for x in q.order_by(Question.code).all()]


@router.post("", status_code=201)
def create_question(
    body: QuestionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN, ROLE_AUDITOR)),
):
    """AM creates approved questions directly; an auditor's goes to PENDING."""
    is_am = user.role in (ROLE_AUDIT_MANAGER, ROLE_ADMIN)
    # The next number after the existing Q### codes; other codes are ignored.
    numbers = [int(c[1:]) for (c,) in db.query(Question.code) if c and re.fullmatch(r"Q\d+", c)]
    code = body.code or f"Q{max(numbers, default=0) + 1:03d}"
    q = Question(
        code=code, text=body.text, process=body.process,
        sub_process=body.sub_process, audit_type=body.audit_type,
        approval_status="APPROVED" if is_am else "PENDING",
        proposed_by_id=user.id,
        approved_by_id=user.id if is_am else None,
        edited_by_id=user.id,
        meta=_meta_with_clean_annexure(body.meta),
    )
    q.set_criticality(_criticality(
        body.criticality, body.weight, body.is_critical))
    db.add(q)
    db.commit()
    return q.to_dict()


@router.post("/{qid}/approve")
def approve_question(
    qid: str,
    body: QuestionApprove,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    """Approve or reject a proposed question. Rejecting needs a reason, which is
    kept on the question and sent to whoever proposed it."""
    q = db.get(Question, qid)
    if not q:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    if body.decision not in QUESTION_DECISIONS:
        raise HTTPException(status_code=400, detail={
            "error": f"decision must be one of {', '.join(QUESTION_DECISIONS)}"})
    reason = body.reason.strip()
    if body.decision == "REJECTED" and not reason:
        raise HTTPException(status_code=400, detail={"error": "say why the question is rejected"})
    q.approval_status = body.decision
    q.approved_by_id = user.id
    q.meta = {**(q.meta or {}), "review": {
        "decision": body.decision, "reason": reason, "by": user.name,
        "at": dt.datetime.utcnow().isoformat()}}
    if q.proposed_by_id and q.proposed_by_id != user.id:
        word = "approved" if body.decision == "APPROVED" else "rejected"
        notify(db, db.get(User, q.proposed_by_id), "question_review",
               f"Your question {q.code} was {word}" + (f": {reason}" if reason else ""),
               "/questions", f"question:{q.id}:{body.decision}")
    log_action(db, user.id, "approve_question", "question", q.id,
               {"decision": body.decision, "code": q.code, "reason": reason})
    db.commit()
    return q.to_dict()


@router.put("/{qid}")
def edit_question(
    qid: str,
    body: QuestionEdit,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    """Edits create a new version so completed audits keep their wording.
    Saving with nothing changed creates no version. Editing a version that is no
    longer current is refused, so two managers cannot silently overwrite each other."""
    old = db.get(Question, qid)
    if not old:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    if not old.is_current:
        current = db.query(Question).filter(
            Question.code == old.code, Question.is_current.is_(True)).first()
        who = current.edited_by.name if current and current.edited_by else "someone else"
        raise HTTPException(status_code=409, detail={
            "error": f"{old.code} was changed by {who} since you opened it. "
                     "Reload the page to see the latest version, then make your change again.",
            "current_id": current.id if current else None})
    d = body.model_dump(exclude_unset=True)
    fields = {f: d[f] for f in VERSIONED_FIELDS if f in d}
    fields["criticality"] = _criticality(
        d.get("criticality"), d.get("weight"), d.get("is_critical"),
        fallback=old.criticality or "Low")
    new, _ = _save_version(db, old, user, fields,
                           _meta_with_clean_annexure(d.get("meta", old.meta)),
                           d.get("change_note"), "edit_question")
    db.commit()
    return new.to_dict()


@router.post("/{qid}/restore")
def restore_question(
    qid: str,
    body: QuestionRestore,
    db: Session = Depends(get_db),
    user: User = Depends(manager_only),
):
    """Make an old version current again by saving its content as a new version
    (like git revert: history is never rewritten)."""
    old = db.get(Question, qid)
    if not old:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    current = db.query(Question).filter(
        Question.code == old.code, Question.is_current.is_(True)).first()
    if not current:
        raise HTTPException(status_code=404, detail={"error": "this question has no current version"})
    note = (body.change_note or "").strip() or f"Restored from v{old.version}"
    meta = {**(current.meta or {})}
    for key in VERSIONED_META:
        meta.pop(key, None)
        if (old.meta or {}).get(key) is not None:
            meta[key] = old.meta[key]
    new, changes = _save_version(db, current, user, {f: getattr(old, f) for f in VERSIONED_FIELDS},
                                 meta, note, "restore_question", {"restored_from": old.version})
    if not changes:
        raise HTTPException(status_code=400, detail={
            "error": f"v{old.version} is the same as the current version, so there is nothing to restore"})
    db.commit()
    return new.to_dict()


@router.get("/changes")
def list_changes(
    code: str | None = None,
    user_id: str | None = None,
    days: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(manager_only),
):
    """Every saved version across the question bank, newest first, each with
    what changed from the version before (the Change history tab)."""
    q = db.query(Question)
    if code:
        q = q.filter(Question.code == code)
    by_code = {}
    for v in q.order_by(Question.code, Question.version).all():
        by_code.setdefault(v.code, []).append(v)
    since = dt.datetime.utcnow() - dt.timedelta(days=days) if days else None
    out = []
    for versions in by_code.values():
        prev = None
        for v in versions:
            keep = ((not user_id or v.edited_by_id == user_id)
                    and (not since or (v.created_at and v.created_at >= since)))
            if keep:
                out.append({
                    "id": v.id, "code": v.code, "version": v.version, "text": v.text,
                    "is_current": v.is_current,
                    "edited_by": v.edited_by.name if v.edited_by else None,
                    "edited_by_id": v.edited_by_id,
                    "change_note": v.change_note,
                    "created_at": v.created_at.isoformat() if v.created_at else None,
                    "changes": _changes(prev, v) if prev else {},
                })
            prev = v
    out.sort(key=lambda e: e["created_at"] or "", reverse=True)
    return out[:300]


@router.get("/{code}/versions")
def question_versions(
    code: str,
    db: Session = Depends(get_db),
    user: User = Depends(manager_only),
):
    """One question's history, newest first: who saved each version, when, why,
    what changed, and how many audits used it."""
    versions = db.query(Question).filter(Question.code == code).order_by(Question.version).all()
    if not versions:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    return list(reversed(_history_entries(db, versions)))


@router.get("/{qid}/audits")
def version_audits(
    qid: str,
    db: Session = Depends(get_db),
    user: User = Depends(manager_only),
):
    """The audits that used this exact question version."""
    audits = (db.query(Audit).join(AuditResponse, AuditResponse.audit_id == Audit.id)
              .filter(AuditResponse.question_id == qid).distinct()
              .order_by(Audit.created_at.desc()).all())
    return [{
        "id": a.id, "store_id": a.store_id, "store": a.store.name if a.store else None,
        "status": a.status,
        "scheduled_at": a.scheduled_at.isoformat() if a.scheduled_at else None,
        "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
    } for a in audits]


@router.delete("/{qid}")
def deactivate_question(
    qid: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    """Soft delete: the question is switched off, never removed, so old audits keep it."""
    q = db.get(Question, qid)
    if not q:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    q.active = False
    log_action(db, user.id, "deactivate_question", "question", q.id, {"code": q.code})
    db.commit()
    return q.to_dict()
