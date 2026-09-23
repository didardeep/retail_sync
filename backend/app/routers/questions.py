from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_roles
from ..db import get_db
from ..models import ROLE_AUDIT_MANAGER, ROLE_AUDITOR, Question, User
from ..schemas import QuestionApprove, QuestionCreate, QuestionEdit

router = APIRouter(prefix="/api/questions", tags=["questions"])


@router.get("")
def list_questions(
    process: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
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
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_AUDITOR)),
):
    """AM creates approved questions directly; an auditor's goes to PENDING."""
    is_am = user.role == ROLE_AUDIT_MANAGER
    last = db.query(func.max(Question.code)).scalar() or "Q000"
    code = body.code or f"Q{int(last[1:]) + 1:03d}"
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
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER)),
):
    q = db.get(Question, qid)
    if not q:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    q.approval_status = body.decision
    q.approved_by_id = user.id
    db.commit()
    return q.to_dict()


@router.put("/{qid}")
def edit_question(
    qid: str,
    body: QuestionEdit,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER)),
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
    db.commit()
    return new.to_dict()
