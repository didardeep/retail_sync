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
    ROLE_AUDIT_MANAGER, ROLE_AUDITOR, ROLE_STORE_MANAGER, SopAttachment,
    SopAudit, SopAuditScore, SopCriterion, SopTemplate, Store, User,
)
from ..schemas import SopAuditUpsert, SopCriterionFlags, SopSubmitIn
from ..services import compute_sop_score, log_action, validate_sop_submit

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
    if user.role == ROLE_AUDIT_MANAGER:
        return True
    if user.role == ROLE_AUDITOR:
        return audit.auditor_id == user.id
    if user.role == ROLE_STORE_MANAGER:
        # store managers only see finished audits of their own stores
        return (audit.status == "Submitted" and audit.store is not None
                and audit.store.manager_id == user.id)
    return False


def _load_for_view(db: Session, aid: str, user: User) -> SopAudit:
    audit = db.get(SopAudit, aid)
    if not audit or not _can_view(user, audit):
        raise _not_found()
    return audit


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
    rows = db.query(SopTemplate).filter_by(is_active=True).order_by(SopTemplate.name).all()
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


@router.patch("/criteria/{cid}")
def update_criterion_flags(
    cid: str,
    body: SopCriterionFlags,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER)),
):
    crit = db.get(SopCriterion, cid)
    if not crit:
        raise _not_found()
    changes = body.model_dump(exclude_none=True)
    for field, value in changes.items():
        setattr(crit, field, value)
    if changes:
        log_action(db, user.id, "update_sop_criterion", "sop_criterion", cid, changes)
    db.commit()
    return crit.to_dict()


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
            Store.manager_id == user.id, SopAudit.status == "Submitted")
    if store_id:
        q = q.filter(SopAudit.store_id == store_id)
    if status:
        q = q.filter(SopAudit.status == status)
    if template_id:
        q = q.filter(SopAudit.template_id == template_id)
    return [a.to_dict() for a in q.order_by(SopAudit.updated_at.desc()).all()]


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
        if not db.get(SopTemplate, body.template_id):
            raise HTTPException(status_code=422, detail={"error": "unknown template"})
        if not db.get(Store, body.store_id):
            raise HTTPException(status_code=422, detail={"error": "unknown store"})
        audit = SopAudit(
            id=aid, template_id=body.template_id, store_id=body.store_id,
            auditor_id=user.id, status="Draft",
            client_created_at=_parse_dt(body.client_created_at),
        )
        db.add(audit)
        db.flush()
    else:
        if audit.auditor_id != user.id:
            raise _forbidden()
        if audit.status != "Draft":
            raise HTTPException(status_code=409, detail={"error": "audit already submitted"})
        if (audit.template_id, audit.store_id) != (body.template_id, body.store_id):
            raise HTTPException(status_code=422, detail={
                "error": "store and template cannot change on an existing audit"})

    criteria = {c.id: c for s in audit.template.sections for c in s.criteria}
    existing = {r.criterion_id: r for r in audit.scores}
    for item in body.scores:
        crit = criteria.get(item.criterion_id)
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
        row = existing.get(item.criterion_id)
        if row is None:
            row = SopAuditScore(audit_id=audit.id, criterion_id=item.criterion_id)
            db.add(row)
            existing[item.criterion_id] = row
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
    if audit.status == "Submitted":
        return _audit_detail(audit)          # idempotent replay

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
    audit.status = "Submitted"
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

    if audit.status != "Draft":
        raise HTTPException(status_code=409, detail={"error": "audit already submitted"})
    if not db.query(SopCriterion).filter_by(id=criterion_id).first():
        raise HTTPException(status_code=422, detail={"error": "unknown criterion"})
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
    att = SopAttachment(id=att_id, audit_id=audit.id, criterion_id=criterion_id,
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
    if att.audit.status != "Draft":
        raise HTTPException(status_code=409, detail={"error": "audit already submitted"})
    path = ATTACHMENT_FOLDER / att.file_path
    db.delete(att)
    db.commit()
    path.unlink(missing_ok=True)
    return {"ok": True}
