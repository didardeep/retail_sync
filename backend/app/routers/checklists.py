from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_roles
from ..db import get_db
from ..models import ROLE_AUDIT_MANAGER, Checklist, ChecklistItem, User
from ..schemas import ChecklistCreate

router = APIRouter(prefix="/api/checklists", tags=["checklists"])


@router.get("")
def list_checklists(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.query(Checklist).order_by(Checklist.name, Checklist.version).all()
    return [c.to_dict() for c in rows]


@router.get("/{cid}")
def get_checklist(cid: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    c = db.get(Checklist, cid)
    if not c:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    return c.to_dict(with_items=True)


@router.post("", status_code=201)
def create_checklist(
    body: ChecklistCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER)),
):
    existing = db.query(func.max(Checklist.version)).filter(
        Checklist.name == body.name).scalar()
    c = Checklist(
        name=body.name, version=(existing or 0) + 1,
        conditions=body.conditions,
    )
    db.add(c)
    db.flush()
    for i, qid in enumerate(body.question_ids):
        db.add(ChecklistItem(checklist_id=c.id, question_id=qid, sort_order=i))
    db.commit()
    return c.to_dict()
