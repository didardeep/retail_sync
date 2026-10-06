import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_roles
from ..db import get_db
from ..models import (
    ROLE_ADMIN, ROLE_AUDIT_MANAGER, ROLE_AUDITOR, ROLE_STORE_MANAGER,
    Audit, AuditResponse, AuditorAvailability, ChecklistItem, Store, User,
)
from ..schemas import (
    AnswerQuestionRequest, AuditApproveRequest, AuditPatchRequest,
    AuditRatingRequest, AuditScheduleRequest,
)
from ..services import (
    auditor_conflict, compute_audit_score, log_action, next_audit_id,
    raise_issue_from_response,
)

router = APIRouter(prefix="/api/audits", tags=["audits"])


@router.get("")
def list_audits(
    status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Audit)
    if user.role == ROLE_AUDITOR:
        q = q.filter(Audit.auditor_id == user.id)
    elif user.role == ROLE_STORE_MANAGER:
        store_ids = [s.id for s in db.query(Store).filter_by(manager_id=user.id)]
        q = q.filter(Audit.store_id.in_(store_ids))
    if status:
        q = q.filter(Audit.status == status)
    return [a.to_dict() for a in q.order_by(Audit.scheduled_at.desc()).all()]


@router.get("/{aid}")
def get_audit(aid: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    a = db.get(Audit, aid)
    if not a:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    if user.role == ROLE_AUDITOR and a.auditor_id != user.id:
        raise HTTPException(status_code=403, detail={"error": "forbidden"})
    return a.to_dict(with_responses=True)


@router.post("", status_code=201)
def schedule_audit(
    body: AuditScheduleRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER)),
):
    """Scheduling checks auditor availability before assigning."""
    when = dt.datetime.fromisoformat(body.scheduled_at)
    auditor_id = body.auditor_id

    if auditor_id:
        conflict = auditor_conflict(db, auditor_id, when.date(), body.store_id)
        if conflict:
            raise HTTPException(status_code=409, detail=conflict)

    audit = Audit(
        id=next_audit_id(db), store_id=body.store_id,
        checklist_id=body.checklist_id, auditor_id=auditor_id,
        created_by_id=user.id, scheduled_at=when,
        audit_type=body.audit_type,
        status="Planned", notes=body.notes,
    )
    db.add(audit)
    db.flush()

    # Materialise the checklist so the auditor sees a fixed question set.
    if audit.checklist_id:
        items = db.query(ChecklistItem).filter_by(
            checklist_id=audit.checklist_id).order_by(ChecklistItem.sort_order).all()
        for it in items:
            db.add(AuditResponse(audit_id=audit.id, question_id=it.question_id))
    log_action(db, user.id, "schedule_audit", "audit", audit.id,
               {"store_id": audit.store_id, "auditor_id": auditor_id})
    db.commit()
    return audit.to_dict()


def _planned_audit(db, aid):
    audit = db.get(Audit, aid)
    if not audit:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    if audit.status != "Planned":
        raise HTTPException(status_code=409, detail={
            "error": f"audit is {audit.status.lower()}; only a planned audit can be changed",
            "status": audit.status})
    return audit


# Statuses a manager or admin may set by hand on a classic audit.
EDITABLE_STATUSES = ("Planned", "Ongoing", "Completed", "Approved", "Cancelled")


def _minute(when):
    return when.replace(second=0, microsecond=0) if when else None


@router.patch("/{aid}")
def update_audit(
    aid: str,
    body: AuditPatchRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    """Edit a classic audit: status, date, auditor, notes.

    Only fields that actually change are applied, so a form that always sends
    all of them is fine. Moving the date or changing the auditor is allowed
    while the audit is still Planned and runs the same availability and
    double-booking check as scheduling. Status can be set to any of
    EDITABLE_STATUSES.
    """
    audit = db.get(Audit, aid)
    if not audit:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    d = body.model_dump(exclude_unset=True)

    when = audit.scheduled_at
    if d.get("scheduled_at"):
        try:
            when = dt.datetime.fromisoformat(d["scheduled_at"].replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=422, detail={
                "error": "scheduled_at must be an ISO date-time"})
        if when.tzinfo is not None:
            when = when.astimezone(dt.timezone.utc).replace(tzinfo=None)
    auditor_id = (d.get("auditor_id") or None) if "auditor_id" in d else audit.auditor_id

    schedule_changed = (_minute(when) != _minute(audit.scheduled_at)
                        or auditor_id != audit.auditor_id)
    notes_changed = "notes" in d and d["notes"] != audit.notes
    if (schedule_changed or notes_changed) and audit.status != "Planned":
        raise HTTPException(status_code=409, detail={
            "error": f"audit is {audit.status.lower()}; the date, auditor and notes can only be changed while it is planned",
            "status": audit.status})
    if schedule_changed:
        if auditor_id and auditor_id != audit.auditor_id:
            auditor = db.get(User, auditor_id)
            if not auditor or not auditor.active or auditor.role != ROLE_AUDITOR:
                raise HTTPException(status_code=422, detail={
                    "error": "auditor must be an active user with the AUDITOR role"})
        if auditor_id and when is not None:
            conflict = auditor_conflict(db, auditor_id, when.date(), audit.store_id,
                                        exclude_audit_id=audit.id)
            if conflict:
                raise HTTPException(status_code=409, detail=conflict)

    new_status = d.get("status")
    if new_status and new_status != audit.status and new_status not in EDITABLE_STATUSES:
        raise HTTPException(status_code=422, detail={
            "error": f"status must be one of {', '.join(EDITABLE_STATUSES)}"})

    changes = {}
    if schedule_changed:
        if _minute(when) != _minute(audit.scheduled_at):
            changes["scheduled_at"] = when.isoformat() if when else None
        if auditor_id != audit.auditor_id:
            changes["auditor_id"] = auditor_id
        audit.scheduled_at, audit.auditor_id = when, auditor_id
    if new_status and new_status != audit.status:
        changes["status"] = new_status
        audit.status = new_status
    if notes_changed:
        changes["notes"] = d["notes"]
        audit.notes = d["notes"]
    if changes:
        log_action(db, user.id, "update_audit", "audit", audit.id, changes)
    db.commit()
    db.refresh(audit)
    return audit.to_dict()


@router.post("/{aid}/cancel")
def cancel_audit(
    aid: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    """A scheduled audit that will not happen. Kept for the record, never deleted."""
    audit = _planned_audit(db, aid)
    audit.status = "Cancelled"
    log_action(db, user.id, "cancel_audit", "audit", audit.id,
               {"store_id": audit.store_id, "auditor_id": audit.auditor_id})
    db.commit()
    return audit.to_dict()


@router.put("/{aid}/responses/{rid}")
def answer_question(
    aid: str,
    rid: str,
    body: AnswerQuestionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDITOR, ROLE_AUDIT_MANAGER)),
):
    """The auditor's core action — answer, remark, attach evidence, set risk."""
    audit = db.get(Audit, aid)
    resp = db.get(AuditResponse, rid)
    if not audit or not resp or resp.audit_id != aid:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    if user.role == ROLE_AUDITOR and audit.auditor_id != user.id:
        raise HTTPException(status_code=403, detail={"error": "forbidden"})
    if audit.status in ("Completed", "Approved", "Cancelled"):
        raise HTTPException(status_code=409, detail={"error": "audit already submitted"})

    d = body.model_dump(exclude_unset=True)
    for field in ("answer", "remarks", "risk"):
        if field in d:
            setattr(resp, field, d[field])
    if "evidence" in d:
        resp.evidence = d["evidence"]
    resp.answered_at = dt.datetime.utcnow()

    if audit.status == "Planned":
        audit.status = "Ongoing"
    db.commit()
    return resp.to_dict()


@router.post("/{aid}/submit")
def submit_audit(
    aid: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDITOR)),
):
    audit = db.get(Audit, aid)
    if not audit or audit.auditor_id != user.id:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    unanswered = [r for r in audit.responses if not r.answer]
    if unanswered:
        raise HTTPException(status_code=400, detail={
            "error": "unanswered questions", "count": len(unanswered),
        })

    audit.score = compute_audit_score(audit)
    audit.status = "Completed"
    audit.submitted_at = dt.datetime.utcnow()

    # Every failed critical question becomes an action for the store manager.
    created = [raise_issue_from_response(db, audit, r)
               for r in audit.responses if r.answer == "No" and r.question.is_critical]
    log_action(db, user.id, "submit_audit", "audit", audit.id,
               {"score": audit.score})
    db.commit()
    return {"audit": audit.to_dict(), "issues_raised": len([c for c in created if c])}


@router.post("/{aid}/approve")
def approve_audit(
    aid: str,
    body: AuditApproveRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER)),
):
    audit = db.get(Audit, aid)
    if not audit or audit.status != "Completed":
        raise HTTPException(status_code=400, detail={"error": "audit not ready for approval"})
    if body.score is not None:
        audit.score = body.score        # AM can override the computed score
    audit.status = "Approved"
    audit.approved_by_id = user.id
    log_action(db, user.id, "approve_audit", "audit", audit.id,
               {"score": audit.score})
    db.commit()
    return audit.to_dict()


@router.post("/{aid}/rating")
def store_manager_rating(
    aid: str,
    body: AuditRatingRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_STORE_MANAGER)),
):
    audit = db.get(Audit, aid)
    if not audit:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    if not audit.store or audit.store.manager_id != user.id:
        raise HTTPException(status_code=403, detail={"error": "forbidden"})
    audit.sm_rating = body.rating
    audit.sm_comment = body.comment
    db.commit()
    return audit.to_dict()
