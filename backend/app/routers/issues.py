import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_roles
from ..db import get_db
from ..models import ROLE_AUDIT_MANAGER, ROLE_AUDITOR, ROLE_STORE_MANAGER, Issue, User
from ..schemas import IssueCreate, IssueUpdate

router = APIRouter(prefix="/api/issues", tags=["issues"])


@router.get("")
def list_issues(
    status: str | None = None,
    store_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Issue)
    if user.role == ROLE_STORE_MANAGER:
        q = q.filter(Issue.assignee_id == user.id)
    if status:
        q = q.filter(Issue.status == status)
    if store_id:
        q = q.filter(Issue.store_id == store_id)
    return [i.to_dict() for i in q.order_by(Issue.created_at.desc()).all()]


@router.post("", status_code=201)
def create_issue(
    body: IssueCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_AUDITOR)),
):
    i = Issue(
        audit_id=body.audit_id, store_id=body.store_id,
        title=body.title, description=body.description,
        process=body.process, sub_process=body.sub_process,
        priority=body.priority,
        assignee_id=body.assignee_id, raised_by_id=user.id,
        due_date=dt.date.fromisoformat(body.due_date) if body.due_date else None,
    )
    db.add(i)
    db.commit()
    return i.to_dict()


@router.put("/{iid}")
def update_issue(
    iid: str,
    body: IssueUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    i = db.get(Issue, iid)
    if not i:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    d = body.model_dump(exclude_unset=True)

    if user.role == ROLE_STORE_MANAGER:
        # A store manager can only record what they did, not re-prioritise.
        if i.assignee_id != user.id:
            raise HTTPException(status_code=403, detail={"error": "forbidden"})
        allowed = {"status", "action_taken", "evidence"}
        d = {k: v for k, v in d.items() if k in allowed}

    for field in ("title", "description", "priority", "status",
                  "assignee_id", "action_taken"):
        if field in d:
            setattr(i, field, d[field])
    if "evidence" in d:
        i.evidence = d["evidence"]
    if d.get("due_date"):
        i.due_date = dt.date.fromisoformat(d["due_date"])
    if i.status == "Closed" and not i.closed_at:
        i.closed_at = dt.datetime.utcnow()
    db.commit()
    return i.to_dict()
