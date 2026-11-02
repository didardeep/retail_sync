from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import get_staff_user, require_roles
from ..db import get_db
from ..models import ROLE_ADMIN, ROLE_AUDIT_MANAGER, Audit, Checklist, ChecklistItem, Question, User
from ..schemas import ChecklistCreate
from ..services import log_action

router = APIRouter(prefix="/api/checklists", tags=["checklists"])


@router.get("")
def list_checklists(db: Session = Depends(get_db), user: User = Depends(get_staff_user)):
    rows = db.query(Checklist).order_by(Checklist.name, Checklist.version).all()
    return [c.to_dict() for c in rows]


@router.get("/{cid}")
def get_checklist(cid: str, db: Session = Depends(get_db), user: User = Depends(get_staff_user)):
    c = db.get(Checklist, cid)
    if not c:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    return c.to_dict(with_items=True)


def _check(db, body):
    if not body.name.strip():
        raise HTTPException(status_code=422, detail={"error": "name is required"})
    if not body.question_ids:
        raise HTTPException(status_code=422, detail={"error": "pick at least one question"})
    found = db.query(Question.id).filter(
        Question.id.in_(body.question_ids), Question.is_current.is_(True)).count()
    if found != len(set(body.question_ids)):
        raise HTTPException(status_code=422, detail={"error": "unknown question"})


def _set_questions(db, checklist_id, question_ids):
    for i, qid in enumerate(question_ids):
        db.add(ChecklistItem(checklist_id=checklist_id, question_id=qid, sort_order=i))


@router.put("/{cid}")
def update_checklist(
    cid: str,
    body: ChecklistCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    """Edit a checklist. One already used by an audit is kept as it was and the
    change becomes a new version, so past audits still show what was asked."""
    c = db.get(Checklist, cid)
    if not c:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    _check(db, body)
    same_questions = [i.question_id for i in c.items] == body.question_ids
    used = db.query(Audit.id).filter(Audit.checklist_id == cid).first() is not None
    if used and not same_questions:
        c.is_active = False
        latest = db.query(func.max(Checklist.version)).filter(Checklist.name == c.name).scalar()
        c = Checklist(name=body.name.strip(), version=(latest or 0) + 1,
                      conditions=body.conditions, is_active=body.is_active)
        db.add(c)
        db.flush()
        _set_questions(db, c.id, body.question_ids)
    else:
        c.name = body.name.strip()
        c.conditions = body.conditions
        c.is_active = body.is_active
        if not same_questions:
            db.query(ChecklistItem).filter_by(checklist_id=c.id).delete()
            _set_questions(db, c.id, body.question_ids)
    log_action(db, user.id, "update_checklist", "checklist", c.id, {"name": c.name})
    db.commit()
    db.refresh(c)
    return c.to_dict()


@router.post("", status_code=201)
def create_checklist(
    body: ChecklistCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    _check(db, body)
    name = body.name.strip()
    existing = db.query(func.max(Checklist.version)).filter(Checklist.name == name).scalar()
    c = Checklist(
        name=name, version=(existing or 0) + 1,
        conditions=body.conditions, is_active=body.is_active,
    )
    db.add(c)
    db.flush()
    _set_questions(db, c.id, body.question_ids)
    log_action(db, user.id, "create_checklist", "checklist", c.id, {"name": c.name})
    db.commit()
    return c.to_dict()
