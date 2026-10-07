"""SOP audits: fixed audit tools (Cash, FMCG) scored with marks + rubric.

Designed for offline-first clients: audit and attachment ids are client
UUIDs, the draft save is an idempotent PUT upsert, and submit / attachment
upload are safe to replay. See docs/SOP_Audit_Decisions.md (D10, D11)."""
import datetime as dt
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_roles
from ..db import get_db
from ..models import (
    ROLE_ADMIN, ROLE_AUDIT_MANAGER, ROLE_AUDITOR, ROLE_STORE_MANAGER, SopAttachment,
    SopAudit, SopAuditScore, SopCriterion, SopTemplate, Store, User,
)
from ..schemas import SopAuditUpsert, SopSubmitIn
from ..services import (
    SOP_AUDITOR_EDITABLE, SOP_DRAFT, SOP_FINAL_STATUSES, SOP_PLANNED,
    SOP_SUBMITTED,
    compute_sop_score, log_action, validate_sop_submit,
)

router = APIRouter(prefix="/api/sop-audits", tags=["sop-audits"])

ATTACHMENT_FOLDER = Path(__file__).parent.parent.parent / "uploads" / "sop"
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
_EXT_BY_MIME = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


def _not_found():
    return HTTPException(status_code=404, detail={"error": "not found"})


def _forbidden():
    return HTTPException(status_code=403, detail={"error": "forbidden"})


def _valid_uuid(value: str, label: str) -> str:
    try:
        return str(uuid.UUID(value))
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(status_code=422, detail={"error": f"{label} must be a UUID"})


def _parse_dt(text):
    if not text:
        return None
    try:
        parsed = dt.datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(dt.timezone.utc).replace(tzinfo=None)
    return parsed


def _can_view(user: User, audit: SopAudit) -> bool:
    if user.role in (ROLE_ADMIN, ROLE_AUDIT_MANAGER):
        return True
    if user.role == ROLE_AUDITOR:
        return audit.auditor_id == user.id
    if user.role == ROLE_STORE_MANAGER:
        # store managers only see finished audits of their own stores
        return (audit.status in SOP_FINAL_STATUSES and audit.store is not None
                and audit.store.manager_id == user.id)
    return False


def _load_for_view(db: Session, aid: str, user: User) -> SopAudit:
    audit = db.get(SopAudit, aid)
    if not audit or not _can_view(user, audit):
        raise _not_found()
    return audit


def _resolve_criterion(db, audit, criterion_id, by_id):
    """The audit's own question for `criterion_id`, or None.

    `criterion_id` may belong to an older version of the same tool (the audit
    was moved to a newer version after the phone downloaded it). The question
    is then found through its stable key, which is the same in every version.
    """
    crit = by_id.get(criterion_id)
    if crit is not None:
        return crit
    other = db.get(SopCriterion, criterion_id)
    if other is None or other.section.template.code != audit.template.code:
        return None
    return next((c for c in by_id.values() if c.stable_key == other.stable_key), None)


def _audit_detail(audit: SopAudit) -> dict:
    d = audit.to_dict(detail=True)
    d["summary"] = compute_sop_score(audit)
    return d


# --------------------------------------------------------------------------
# Templates
# --------------------------------------------------------------------------
@router.get("/templates")
def list_templates(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = (db.query(SopTemplate).filter_by(is_active=True, is_current=True)
            .order_by(SopTemplate.name).all())
    return [t.to_dict() for t in rows]


@router.get("/templates/{tid}")
def get_template(
    tid: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tpl = db.get(SopTemplate, tid)
    if not tpl:
        raise _not_found()
    return tpl.to_dict(with_sections=True)



# --------------------------------------------------------------------------
# Attachments (declared before /{aid} so the path is not captured by it)
# --------------------------------------------------------------------------
@router.get("/attachments/{att_id}")
def get_attachment(
    att_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    att = db.get(SopAttachment, att_id)
    if not att or not _can_view(user, att.audit):
        raise _not_found()
    path = ATTACHMENT_FOLDER / att.file_path
    if not path.is_file():
        raise _not_found()
    return FileResponse(path, media_type=att.mime or "application/octet-stream")


# --------------------------------------------------------------------------
# Audits
# --------------------------------------------------------------------------
@router.get("")
def list_sop_audits(
    store_id: str | None = None,
    status: str | None = None,
    template_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(SopAudit)
    if user.role == ROLE_AUDITOR:
        q = q.filter(SopAudit.auditor_id == user.id)
    elif user.role == ROLE_STORE_MANAGER:
        q = q.join(Store, Store.id == SopAudit.store_id).filter(
            Store.manager_id == user.id, SopAudit.status.in_(SOP_FINAL_STATUSES))
    if store_id:
        q = q.filter(SopAudit.store_id == store_id)
    if status:
        q = q.filter(SopAudit.status == status)
    if template_id:
        q = q.filter(SopAudit.template_id == template_id)
    out = []
    for a in q.order_by(SopAudit.updated_at.desc()).all():
        d = a.to_dict()
        summary = compute_sop_score(a)
        d["progress"] = {"answered": summary["answered"], "total": summary["applicable"]}
        out.append(d)
    return out


@router.get("/{aid}")
def get_sop_audit(
    aid: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return _audit_detail(_load_for_view(db, aid, user))


@router.put("/{aid}")
def upsert_sop_audit(
    aid: str,
    body: SopAuditUpsert,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDITOR)),
):
    """Create or update a draft. Only the criteria present in the payload are
    touched, so clients can send one answer at a time or the whole audit."""
    aid = _valid_uuid(aid, "audit id")
    audit = db.get(SopAudit, aid)
    created = audit is None
    if created:
        # Any active version is accepted: an audit started offline on a version
        # that was replaced since must still sync. The app only offers the
        # current version for new audits.
        template = db.get(SopTemplate, body.template_id)
        if not template or not template.is_active:
            raise HTTPException(status_code=422, detail={"error": "unknown template"})
        if not db.get(Store, body.store_id):
            raise HTTPException(status_code=422, detail={"error": "unknown store"})
        audit = SopAudit(
            id=aid, template_id=body.template_id, store_id=body.store_id,
            auditor_id=user.id, status=SOP_DRAFT,
            client_created_at=_parse_dt(body.client_created_at),
        )
        db.add(audit)
        db.flush()
    else:
        if audit.auditor_id != user.id:
            raise _forbidden()
        if audit.status not in SOP_AUDITOR_EDITABLE:
            raise HTTPException(status_code=409, detail={
                "error": f"audit is {audit.status.lower()} and can no longer be changed",
                "status": audit.status})
        sent = db.get(SopTemplate, body.template_id)
        same_tool = sent is not None and sent.code == audit.template.code
        # The phone may still name an older version of the same tool (the audit was
        # moved to a newer one after it downloaded it); the server's version wins.
        template_ok = audit.template_id == body.template_id or same_tool
        if audit.store_id != body.store_id or not template_ok:
            raise HTTPException(status_code=422, detail={
                "error": "store and template cannot change on an existing audit"})
        if audit.status == SOP_PLANNED:
            audit.status = SOP_DRAFT          # the auditor has started it

    criteria = {c.id: c for s in audit.template.sections for c in s.criteria}
    existing = {r.criterion_id: r for r in audit.scores}
    for item in body.scores:
        crit = _resolve_criterion(db, audit, item.criterion_id, criteria)
        if crit is None:
            raise HTTPException(status_code=422, detail={
                "error": f"criterion {item.criterion_id} is not part of this audit tool"})
        if item.score is not None and not item.is_na:
            if item.score > crit.marks:
                raise HTTPException(status_code=422, detail={
                    "error": f"score for '{crit.title[:40]}' exceeds {crit.marks:g} marks"})
            if (item.score * 2) % 1 != 0:
                raise HTTPException(status_code=422, detail={
                    "error": "scores move in steps of 0.5"})
        row = existing.get(crit.id)
        if row is None:
            row = SopAuditScore(audit_id=audit.id, criterion_id=crit.id)
            db.add(row)
            existing[crit.id] = row
            audit.scores.append(row)
        row.is_na = item.is_na
        row.score = None if item.is_na else item.score
        row.comment = item.comment
        row.answered_at = _parse_dt(item.answered_at) or dt.datetime.utcnow()

    if body.overall_remarks is not None:
        audit.overall_remarks = body.overall_remarks
    summary = compute_sop_score(audit)
    audit.score, audit.max_score, audit.percent = (
        summary["score"], summary["max_score"], summary["percent"])
    if created:
        log_action(db, user.id, "create_sop_audit", "sop_audit", audit.id,
                   {"store_id": audit.store_id, "template_id": audit.template_id})
    db.commit()
    return _audit_detail(audit)


@router.post("/{aid}/submit")
def submit_sop_audit(
    aid: str,
    body: SopSubmitIn | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDITOR)),
):
    audit = db.get(SopAudit, aid)
    if not audit:
        raise _not_found()
    if audit.auditor_id != user.id:
        raise _forbidden()
    if audit.status in SOP_FINAL_STATUSES:
        return _audit_detail(audit)          # idempotent replay
    if audit.status not in SOP_AUDITOR_EDITABLE:
        raise HTTPException(status_code=409, detail={
            "error": f"audit is {audit.status.lower()} and cannot be submitted",
            "status": audit.status})

    if body and body.overall_remarks is not None:
        audit.overall_remarks = body.overall_remarks
    problems = validate_sop_submit(audit)
    if problems:
        raise HTTPException(status_code=422, detail={
            "error": f"{len(problems)} problem(s) must be fixed before submitting",
            "problems": problems,
        })
    summary = compute_sop_score(audit)
    audit.score, audit.max_score, audit.percent = (
        summary["score"], summary["max_score"], summary["percent"])
    audit.status = SOP_SUBMITTED
    audit.submitted_at = dt.datetime.utcnow()
    audit.client_submitted_at = _parse_dt(body.client_submitted_at) if body else None
    log_action(db, user.id, "submit_sop_audit", "sop_audit", audit.id,
               {"score": audit.score, "max_score": audit.max_score,
                "percent": audit.percent})
    db.commit()
    return _audit_detail(audit)


@router.post("/{aid}/attachments", status_code=201)
async def upload_attachment(
    aid: str,
    id: str = Form(...),
    criterion_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDITOR)),
):
    att_id = _valid_uuid(id, "attachment id")
    audit = db.get(SopAudit, aid)
    if not audit:
        raise _not_found()
    if audit.auditor_id != user.id:
        raise _forbidden()

    existing = db.get(SopAttachment, att_id)
    if existing:
        return existing.to_dict()            # idempotent replay

    if audit.status not in SOP_AUDITOR_EDITABLE:
        raise HTTPException(status_code=409, detail={
            "error": f"audit is {audit.status.lower()} and can no longer be changed",
            "status": audit.status})
    own = {c.id: c for sec in audit.template.sections for c in sec.criteria}
    criterion = _resolve_criterion(db, audit, criterion_id, own)
    if criterion is None:
        raise HTTPException(status_code=422, detail={
            "error": "criterion is not part of this audit tool"})
    ext = _EXT_BY_MIME.get(file.content_type)
    if ext is None:
        raise HTTPException(status_code=422, detail={
            "error": "only JPEG, PNG or WebP images are accepted"})
    data = await file.read()
    if len(data) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=413, detail={"error": "image larger than 10 MB"})

    folder = ATTACHMENT_FOLDER / audit.id
    folder.mkdir(parents=True, exist_ok=True)
    rel = f"{audit.id}/{att_id}{ext}"
    (ATTACHMENT_FOLDER / rel).write_bytes(data)
    att = SopAttachment(id=att_id, audit_id=audit.id, criterion_id=criterion.id,
                        file_path=rel, mime=file.content_type, size=len(data))
    db.add(att)
    db.commit()
    return att.to_dict()


@router.delete("/{aid}/attachments/{att_id}")
def delete_attachment(
    aid: str,
    att_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDITOR)),
):
    att = db.get(SopAttachment, att_id)
    if not att or att.audit_id != aid:
        return {"ok": True}                  # already gone: idempotent
    if att.audit.auditor_id != user.id:
        raise _forbidden()
    if att.audit.status not in SOP_AUDITOR_EDITABLE:
        raise HTTPException(status_code=409, detail={
            "error": f"audit is {att.audit.status.lower()} and can no longer be changed",
            "status": att.audit.status})
    path = ATTACHMENT_FOLDER / att.file_path
    db.delete(att)
    db.commit()
    path.unlink(missing_ok=True)
    return {"ok": True}
