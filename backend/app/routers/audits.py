import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_roles
from ..db import get_db
from ..models import (
    ROLE_AUDIT_MANAGER, ROLE_AUDITOR, ROLE_STORE_MANAGER,
    Audit, AuditResponse, AuditorAvailability, ChecklistItem, Store, User,
)
from ..schemas import (
    AnswerQuestionRequest, AuditApproveRequest, AuditRatingRequest,
    AuditScheduleRequest,
)
from ..services import (
    compute_audit_score, log_action, next_audit_id, raise_issue_from_response,
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
        blocked = db.query(AuditorAvailability).filter(
            AuditorAvailability.auditor_id == auditor_id,
            AuditorAvailability.from_date <= when.date(),
            AuditorAvailability.to_date >= when.date(),
        ).first()
        if blocked:
            raise HTTPException(status_code=409, detail={
                "error": "auditor unavailable", "reason": blocked.reason,
            })
        clash = db.query(Audit).filter(
            Audit.auditor_id == auditor_id,
            func.date(Audit.scheduled_at) == when.date(),
            Audit.status.in_(["Planned", "Ongoing"]),
        ).first()
        if clash:
            raise HTTPException(status_code=409, detail={
                "error": "auditor already booked", "audit_id": clash.id,
            })

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
    if audit.status in ("Completed", "Approved"):
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
