import datetime as dt
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_staff_user, require_roles
from ..db import get_db
from ..models import ROLE_ADMIN, ROLE_AUDIT_MANAGER, ROLE_AUDITOR, Question, User
from ..schemas import QuestionApprove, QuestionCreate, QuestionEdit
from ..services import log_action
from ..services.alerts import notify

QUESTION_DECISIONS = ("APPROVED", "REJECTED")

router = APIRouter(prefix="/api/questions", tags=["questions"])


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
        weight=body.weight, is_critical=body.is_critical,
        approval_status="APPROVED" if is_am else "PENDING",
        proposed_by_id=user.id,
        approved_by_id=user.id if is_am else None,
        meta=body.meta,
    )
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
    """Edits create a new version so completed audits keep their wording."""
    old = db.get(Question, qid)
    if not old:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    d = body.model_dump(exclude_unset=True)
    old.is_current = False
    new = Question(
        code=old.code, version=old.version + 1, is_current=True,
        text=d.get("text", old.text), process=d.get("process", old.process),
        sub_process=d.get("sub_process", old.sub_process),
        audit_type=d.get("audit_type", old.audit_type),
        weight=d.get("weight", old.weight),
        is_critical=d.get("is_critical", old.is_critical),
        active=d.get("active", old.active),
        approval_status="APPROVED", approved_by_id=user.id,
        meta=d.get("meta", old.meta),
    )
    db.add(new)
    log_action(db, user.id, "edit_question", "question", new.id,
               {"code": new.code, "version": new.version, "fields": list(d.keys())})
    db.commit()
    return new.to_dict()


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
