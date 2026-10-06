"""Scheduling SOP audits for auditors (manager only).

A manager books a tool + store + auditor + time; the audit is created as
Planned and shows up in that auditor's "Assigned to me" list. Cancel, never
delete: a phone that already holds the audit must learn that it was cancelled.
See docs/SOP_Audit_Decisions.md (D20)."""
import datetime as dt
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import require_roles
from ..db import get_db
from ..models import ROLE_AUDIT_MANAGER, ROLE_AUDITOR, SopAudit, Store, User
from ..schemas import SopScheduleCreate, SopSchedulePatch
from ..services import (
    SOP_CANCELLED, SOP_PLANNED, auditor_conflict, current_template, log_action,
)

router = APIRouter(prefix="/api/sop-schedule", tags=["sop-schedule"])


def _unprocessable(message):
    return HTTPException(status_code=422, detail={"error": message})


def _parse_when(text):
    """ISO date-time to a naive datetime (a timezone, if sent, is converted to UTC)."""
    try:
        when = dt.datetime.fromisoformat((text or "").replace("Z", "+00:00"))
    except ValueError:
        raise _unprocessable("scheduled_at must be an ISO date-time")
    if when.tzinfo is not None:
        when = when.astimezone(dt.timezone.utc).replace(tzinfo=None)
    return when


def _check_store(db, store_id):
    if not db.get(Store, store_id):
        raise _unprocessable("unknown store")


def _check_auditor(db, auditor_id):
    auditor = db.get(User, auditor_id)
    if not auditor or not auditor.active or auditor.role != ROLE_AUDITOR:
        raise _unprocessable("auditor must be an active user with the AUDITOR role")


@router.get("/conflicts")
def check_conflicts(
    auditor_id: str,
    date: str,
    store_id: str | None = None,
    exclude_sop_id: str | None = None,
    exclude_audit_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER)),
):
    """Lets the form warn before saving. Never fails on a clash: the clash is
    the answer."""
    try:
        day = dt.date.fromisoformat(date[:10])
    except ValueError:
        raise _unprocessable("date must be YYYY-MM-DD")
    return {"conflict": auditor_conflict(
        db, auditor_id, day, store_id,
        exclude_audit_id=exclude_audit_id, exclude_sop_id=exclude_sop_id)}


@router.post("")
def schedule_sop_audit(
    body: SopScheduleCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER)),
):
    template = current_template(db, body.template_code)
    if template is None:
        raise _unprocessable("unknown or inactive audit tool")
    when = _parse_when(body.scheduled_at)
    _check_store(db, body.store_id)
    _check_auditor(db, body.auditor_id)
    conflict = auditor_conflict(db, body.auditor_id, when.date(), body.store_id)
    if conflict:
        raise HTTPException(status_code=409, detail=conflict)

    audit = SopAudit(
        id=str(uuid.uuid4()), template_id=template.id, store_id=body.store_id,
        auditor_id=body.auditor_id, status=SOP_PLANNED, scheduled_at=when,
        notes=body.notes, created_by_id=user.id,
    )
    db.add(audit)
    log_action(db, user.id, "schedule_sop_audit", "sop_audit", audit.id,
               {"store_id": audit.store_id, "auditor_id": audit.auditor_id,
                "template_code": template.code, "scheduled_at": when.isoformat()})
    db.commit()
    return audit.to_dict()


def _load_planned(db, aid):
    audit = db.get(SopAudit, aid)
    if not audit:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    if audit.status != SOP_PLANNED:
        raise HTTPException(status_code=409, detail={
            "error": f"audit is {audit.status.lower()}; only a planned audit can be changed",
            "status": audit.status})
    return audit


@router.patch("/{aid}")
def patch_sop_audit(
    aid: str,
    body: SopSchedulePatch,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER)),
):
    """Reschedule, reassign, change store or notes while the audit is Planned."""
    audit = _load_planned(db, aid)
    d = body.model_dump(exclude_unset=True)

    when = _parse_when(d["scheduled_at"]) if d.get("scheduled_at") else audit.scheduled_at
    store_id = d.get("store_id") or audit.store_id
    auditor_id = d.get("auditor_id") or audit.auditor_id
    if store_id != audit.store_id:
        _check_store(db, store_id)
    if auditor_id != audit.auditor_id:
        _check_auditor(db, auditor_id)
    if when is not None:
        conflict = auditor_conflict(db, auditor_id, when.date(), store_id,
                                    exclude_sop_id=audit.id)
        if conflict:
            raise HTTPException(status_code=409, detail=conflict)

    changes = {}
    if when != audit.scheduled_at:
        changes["scheduled_at"] = when.isoformat() if when else None
    if store_id != audit.store_id:
        changes["store_id"] = store_id
    if auditor_id != audit.auditor_id:
        changes["auditor_id"] = auditor_id
    if "notes" in d and d["notes"] != audit.notes:
        changes["notes"] = d["notes"]
        audit.notes = d["notes"]
    audit.scheduled_at, audit.store_id, audit.auditor_id = when, store_id, auditor_id
    if changes:
        log_action(db, user.id, "reschedule_sop_audit", "sop_audit", audit.id, changes)
    db.commit()
    db.refresh(audit)
    return audit.to_dict()


@router.post("/{aid}/cancel")
def cancel_sop_audit(
    aid: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER)),
):
    audit = _load_planned(db, aid)
    audit.status = SOP_CANCELLED
    log_action(db, user.id, "cancel_sop_audit", "sop_audit", audit.id,
               {"store_id": audit.store_id, "auditor_id": audit.auditor_id})
    db.commit()
    return audit.to_dict()
