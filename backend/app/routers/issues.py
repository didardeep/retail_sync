import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_roles
from ..db import get_db
from ..models import (
    ROLE_ADMIN, ROLE_AUDIT_MANAGER, ROLE_AUDITOR, ROLE_STORE_MANAGER,
    Audit, Issue, Store, User,
)
from ..schemas import IssueCreate, IssueUpdate
from ..services import log_action

router = APIRouter(prefix="/api/issues", tags=["issues"])

PRIORITIES = ("Critical", "High", "Medium", "Low")
STATUSES = ("Open", "In Progress", "On Hold", "Resolved", "Closed")


class IssueEdit(IssueUpdate):
    """The update body plus the store, which the Issues page can change."""
    store_id: str | None = None


def _bad(message):
    return HTTPException(status_code=400, detail={"error": message})


def _parse_due(value):
    try:
        return dt.date.fromisoformat(value[:10])
    except ValueError:
        raise _bad("due_date must be a date like 2026-01-31")


def _check_refs(db, d):
    """Reject values the page offers but the data cannot hold."""
    if d.get("priority") is not None and d["priority"] not in PRIORITIES:
        raise _bad("unknown priority")
    if d.get("status") is not None and d["status"] not in STATUSES:
        raise _bad("unknown status")
    if d.get("title") is not None and not d["title"].strip():
        raise _bad("title is required")
    if d.get("store_id") and not db.get(Store, d["store_id"]):
        raise _bad("unknown store")
    if d.get("audit_id") and not db.get(Audit, d["audit_id"]):
        raise _bad("unknown audit")
    if d.get("assignee_id") and not db.get(User, d["assignee_id"]):
        raise _bad("unknown assignee")


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
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN, ROLE_AUDITOR)),
):
    _check_refs(db, body.model_dump())
    i = Issue(
        audit_id=body.audit_id, store_id=body.store_id,
        title=body.title, description=body.description,
        process=body.process, sub_process=body.sub_process,
        priority=body.priority,
        assignee_id=body.assignee_id, raised_by_id=user.id,
        due_date=_parse_due(body.due_date) if body.due_date else None,
    )
    db.add(i)
    db.flush()
    log_action(db, user.id, "create_issue", "issue", i.id, {"title": i.title})
    db.commit()
    return i.to_dict()


@router.put("/{iid}")
def update_issue(
    iid: str,
    body: IssueEdit,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == ROLE_AUDITOR:
        raise HTTPException(status_code=403, detail={"error": "forbidden"})
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

    _check_refs(db, d)
    for field in ("title", "description", "priority", "status",
                  "assignee_id", "action_taken", "store_id"):
        if field in d:
            setattr(i, field, d[field])
    if "evidence" in d:
        i.evidence = d["evidence"]
    if "due_date" in d:
        i.due_date = _parse_due(d["due_date"]) if d["due_date"] else None
    if i.status == "Closed" and not i.closed_at:
        i.closed_at = dt.datetime.utcnow()
    if "status" in d:
        log_action(db, user.id, "update_issue_status", "issue", i.id,
                   {"status": i.status})
    db.commit()
    return i.to_dict()


@router.delete("/{iid}", status_code=204)
def delete_issue(
    iid: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_ADMIN, ROLE_AUDIT_MANAGER)),
):
    i = db.get(Issue, iid)
    if not i:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    log_action(db, user.id, "delete_issue", "issue", i.id,
               {"title": i.title, "store_id": i.store_id})
    db.delete(i)
    db.commit()
