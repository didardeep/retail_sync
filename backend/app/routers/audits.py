import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from ..auth import get_staff_user, require_roles
from ..db import get_db
from ..models import (
    ROLE_ADMIN, ROLE_AUDIT_MANAGER, ROLE_AUDITOR, ROLE_STORE_MANAGER,
    Audit, AuditResponse, AuditorAvailability, Checklist, ChecklistItem, Issue, Store, User,
)
from ..schemas import (
    AnswerQuestionRequest, AuditApproveRequest, AuditPatchRequest,
    AuditRatingRequest, AuditScheduleRequest, AuditStartRequest, RaiseIssueRequest,
)
from ..services import (
    SCORED_STATUSES, auditor_conflict, compute_audit_score, linked_auditee_ids, log_action,
    next_audit_id, sync_store_score,
)

router = APIRouter(prefix="/api/audits", tags=["audits"])

ANSWERS = ("Yes", "No", "NA")
RISKS = ("None", "Low", "Medium", "High", "Critical")
ISSUE_PRIORITIES = ("Critical", "High", "Medium", "Low")
DEFAULT_ISSUE_DAYS = 7
CLASSIC_AUDIT_TYPE = "Checklist based Audit"


def _progress_by_audit(db, audit_ids):
    """{audit_id: {"answered": n, "total": n}} in one grouped query."""
    if not audit_ids:
        return {}
    rows = db.query(
        AuditResponse.audit_id,
        func.count(AuditResponse.id),
        func.sum(case((func.coalesce(AuditResponse.answer, "") != "", 1), else_=0)),
    ).filter(AuditResponse.audit_id.in_(audit_ids)).group_by(AuditResponse.audit_id).all()
    return {aid: {"answered": int(ans or 0), "total": int(total)} for aid, total, ans in rows}


def _copy_checklist_items(db, audit):
    """Materialise the checklist so the auditor sees a fixed question set."""
    if not audit.checklist_id:
        return
    items = db.query(ChecklistItem).filter_by(
        checklist_id=audit.checklist_id).order_by(ChecklistItem.sort_order).all()
    for it in items:
        db.add(AuditResponse(audit_id=audit.id, question_id=it.question_id))


@router.get("")
def list_audits(
    status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_staff_user),
):
    q = db.query(Audit)
    if user.role == ROLE_AUDITOR:
        q = q.filter(Audit.auditor_id == user.id)
    elif user.role == ROLE_STORE_MANAGER:
        store_ids = [s.id for s in db.query(Store).filter_by(manager_id=user.id)]
        q = q.filter(Audit.store_id.in_(store_ids))
    if status:
        q = q.filter(Audit.status == status)
    audits = q.order_by(Audit.scheduled_at.desc()).all()
    progress = _progress_by_audit(db, [a.id for a in audits])
    out = []
    for a in audits:
        d = a.to_dict()
        d["progress"] = progress.get(a.id, {"answered": 0, "total": 0})
        out.append(d)
    return out


@router.get("/conflicts")
def check_conflicts(
    auditor_id: str,
    date: str,
    store_id: str | None = None,
    exclude_audit_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    """Lets the scheduling form warn before saving. Never fails on a clash: the
    clash is the answer."""
    try:
        day = dt.date.fromisoformat(date[:10])
    except ValueError:
        raise HTTPException(status_code=422, detail={"error": "date must be YYYY-MM-DD"})
    return {"conflict": auditor_conflict(
        db, auditor_id, day, store_id, exclude_audit_id=exclude_audit_id)}


@router.get("/{aid}")
def get_audit(aid: str, db: Session = Depends(get_db), user: User = Depends(get_staff_user)):
    a = db.get(Audit, aid)
    if not a:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    if user.role == ROLE_AUDITOR and a.auditor_id != user.id:
        raise HTTPException(status_code=403, detail={"error": "forbidden"})
    return a.to_dict(with_responses=True)


def _parse_due(text, start):
    """Planned end of an audit: an ISO date-time, not before the start."""
    if not text:
        return None
    try:
        due = dt.datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=422, detail={"error": "due_at must be an ISO date-time"})
    if due.tzinfo is not None:
        due = due.astimezone(dt.timezone.utc).replace(tzinfo=None)
    _check_window(start, due)
    return due


def _check_window(start, due):
    if start and due and due < start:
        raise HTTPException(status_code=422, detail={"error": "the end must not be before the start"})


@router.post("", status_code=201)
def schedule_audit(
    body: AuditScheduleRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    """Scheduling checks auditor availability before assigning."""
    when = dt.datetime.fromisoformat(body.scheduled_at)
    due = _parse_due(body.due_at, when)
    auditor_id = body.auditor_id

    if auditor_id:
        conflict = auditor_conflict(db, auditor_id, when.date(), body.store_id)
        if conflict:
            raise HTTPException(status_code=409, detail=conflict)

    audit = Audit(
        id=next_audit_id(db), store_id=body.store_id,
        checklist_id=body.checklist_id, auditor_id=auditor_id,
        created_by_id=user.id, scheduled_at=when, due_at=due,
        audit_type=body.audit_type,
        status="Planned", notes=body.notes,
    )
    db.add(audit)
    db.flush()

    _copy_checklist_items(db, audit)
    log_action(db, user.id, "schedule_audit", "audit", audit.id,
               {"store_id": audit.store_id, "auditor_id": auditor_id})
    db.commit()
    return audit.to_dict()


@router.post("/start")
def start_audit(
    body: AuditStartRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDITOR)),
):
    """An auditor starts a classic checklist audit on the spot.

    Returns the caller's open (Planned/Ongoing) audit for the same store and
    checklist if there is one, otherwise creates an Ongoing audit.
    """
    if not db.get(Store, body.store_id):
        raise HTTPException(status_code=404, detail={"error": "unknown store"})
    checklist = db.get(Checklist, body.checklist_id)
    if not checklist or not checklist.is_active:
        raise HTTPException(status_code=404, detail={"error": "unknown or inactive checklist"})

    audit = db.query(Audit).filter(
        Audit.auditor_id == user.id, Audit.store_id == body.store_id,
        Audit.checklist_id == body.checklist_id,
        Audit.status.in_(["Planned", "Ongoing"]),
    ).order_by(Audit.scheduled_at.desc()).first()
    if not audit:
        audit = Audit(
            id=next_audit_id(db), store_id=body.store_id,
            checklist_id=body.checklist_id, auditor_id=user.id,
            created_by_id=user.id, scheduled_at=dt.datetime.utcnow(),
            audit_type=CLASSIC_AUDIT_TYPE, status="Ongoing",
        )
        db.add(audit)
        db.flush()
        _copy_checklist_items(db, audit)
        log_action(db, user.id, "start_audit", "audit", audit.id,
                   {"store_id": audit.store_id, "checklist_id": audit.checklist_id})
        db.commit()
        db.refresh(audit)
    d = audit.to_dict(with_responses=True)
    d["progress"] = _progress_by_audit(db, [audit.id]).get(audit.id, {"answered": 0, "total": 0})
    return d


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
    due = _parse_due(d.get("due_at"), when) if "due_at" in d else audit.due_at
    _check_window(when, due)
    due_changed = _minute(due) != _minute(audit.due_at)

    schedule_changed = (_minute(when) != _minute(audit.scheduled_at)
                        or auditor_id != audit.auditor_id or due_changed)
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
    # Completed and Approved mean the checklist is filled: every question answered.
    if new_status in SCORED_STATUSES and new_status != audit.status:
        unanswered = sum(1 for r in audit.responses if not r.answer)
        if unanswered:
            raise HTTPException(status_code=409, detail={
                "error": f"{unanswered} question{'s' if unanswered != 1 else ''} not answered yet; "
                         f"an audit is {new_status.lower()} only once every question is answered",
                "count": unanswered})

    changes = {}
    if schedule_changed:
        if _minute(when) != _minute(audit.scheduled_at):
            changes["scheduled_at"] = when.isoformat() if when else None
        if auditor_id != audit.auditor_id:
            changes["auditor_id"] = auditor_id
        if due_changed:
            changes["due_at"] = due.isoformat() if due else None
        audit.scheduled_at, audit.auditor_id, audit.due_at = when, auditor_id, due
    if new_status and new_status != audit.status:
        changes["status"] = new_status
        audit.status = new_status
        if new_status in SCORED_STATUSES:
            if audit.score is None and audit.responses:
                audit.score = compute_audit_score(audit)
            audit.submitted_at = audit.submitted_at or dt.datetime.utcnow()
        sync_store_score(db, audit.store_id, audit.submitted_at)
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
    user: User = Depends(require_roles(ROLE_AUDITOR, ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
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
    if d.get("answer") and d["answer"] not in ANSWERS:
        raise HTTPException(status_code=422, detail={
            "error": f"answer must be one of {', '.join(ANSWERS)} or empty"})
    if d.get("risk") and d["risk"] not in RISKS:
        raise HTTPException(status_code=422, detail={
            "error": f"risk must be one of {', '.join(RISKS)} or empty"})
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


@router.post("/{aid}/responses/{rid}/issue", status_code=201)
def raise_issue(
    aid: str,
    rid: str,
    body: RaiseIssueRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDITOR, ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    """The auditor's choice to follow up one answered question: raise an issue
    and give it to an auditee linked to the audit's store. Never automatic."""
    audit = db.get(Audit, aid)
    resp = db.get(AuditResponse, rid)
    if not audit or not resp or resp.audit_id != aid:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    if user.role == ROLE_AUDITOR and audit.auditor_id != user.id:
        raise HTTPException(status_code=403, detail={"error": "forbidden"})
    if audit.status == "Cancelled":
        raise HTTPException(status_code=409, detail={"error": "audit is cancelled"})
    if not resp.answer:
        raise HTTPException(status_code=409, detail={"error": "answer the question before raising an issue"})
    if body.priority not in ISSUE_PRIORITIES:
        raise HTTPException(status_code=422, detail={
            "error": f"priority must be one of {', '.join(ISSUE_PRIORITIES)}"})
    if body.assignee_id not in linked_auditee_ids(db, audit.store_id):
        raise HTTPException(status_code=422, detail={
            "error": "assignee must be an auditee linked to this audit's store"})
    if resp.issues:
        raise HTTPException(status_code=409, detail={
            "error": "an issue was already raised for this question", "issue_id": resp.issues[0].id})
    try:
        due = dt.date.fromisoformat(body.due_date[:10]) if body.due_date else (
            dt.date.today() + dt.timedelta(days=DEFAULT_ISSUE_DAYS))
    except ValueError:
        raise HTTPException(status_code=422, detail={"error": "due_date must be a date like 2026-01-31"})

    q = resp.question
    issue = Issue(
        audit_id=audit.id, store_id=audit.store_id, response_id=resp.id,
        title=q.text[:200] if q else "Audit question", description=body.description or resp.remarks,
        process=q.process if q else None, sub_process=q.sub_process if q else None,
        priority=body.priority, status="Open",
        assignee_id=body.assignee_id, raised_by_id=user.id, due_date=due,
        meta={"question_code": q.code if q else None},
    )
    db.add(issue)
    db.flush()
    log_action(db, user.id, "raise_issue", "issue", issue.id,
               {"audit_id": audit.id, "assignee_id": issue.assignee_id})
    db.commit()
    return issue.to_dict()


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
    if audit.status not in ("Ongoing", "Planned"):
        raise HTTPException(status_code=409, detail={
            "error": f"audit is {audit.status.lower()}; it cannot be submitted again",
            "status": audit.status})
    if audit.status == "Planned" and unanswered:
        raise HTTPException(status_code=409, detail={
            "error": "audit has not been started; answer the questions first",
            "status": audit.status})
    if unanswered:
        raise HTTPException(status_code=400, detail={
            "error": "unanswered questions", "count": len(unanswered),
        })

    audit.score = compute_audit_score(audit)
    audit.status = "Completed"
    audit.submitted_at = dt.datetime.utcnow()
    sync_store_score(db, audit.store_id, audit.submitted_at)

    # Issues are never raised automatically: the auditor chose them, per question,
    # while answering (see raise_issue below). Report how many that was.
    raised = db.query(Issue).filter(Issue.audit_id == audit.id).count()
    log_action(db, user.id, "submit_audit", "audit", audit.id,
               {"score": audit.score})
    db.commit()
    return {"audit": audit.to_dict(), "issues_raised": raised}


@router.post("/{aid}/approve")
def approve_audit(
    aid: str,
    body: AuditApproveRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    audit = db.get(Audit, aid)
    if not audit or audit.status != "Completed":
        raise HTTPException(status_code=400, detail={"error": "audit not ready for approval"})
    if body.score is not None:
        audit.score = body.score        # AM can override the computed score
    audit.status = "Approved"
    audit.approved_by_id = user.id
    sync_store_score(db, audit.store_id, audit.submitted_at)
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
