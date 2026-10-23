import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_roles
from ..db import get_db
from ..models import (
    ROLE_ADMIN, ROLE_AUDIT_MANAGER, ROLE_AUDITEE, ROLE_AUDITOR, ROLE_STORE_MANAGER,
    Audit, Issue, Store, User,
)
from ..schemas import IssueCreate, IssueUpdate
from ..services import linked_auditee_ids, log_action

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


def _managed_store_ids(db, user):
    return [s.id for s in db.query(Store.id).filter(Store.manager_id == user.id)]


def _can_work_on(db, user, issue):
    """A store manager works on issues assigned to them or at a store they run."""
    return issue.assignee_id == user.id or issue.store_id in _managed_store_ids(db, user)


def _check_refs(db, d, store_id=None):
    """Reject values the page offers but the data cannot hold. `store_id` is the
    issue's store, used to check that an auditee assignee is linked to it."""
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
    if d.get("assignee_id"):
        assignee = db.get(User, d["assignee_id"])
        if not assignee:
            raise _bad("unknown assignee")
        # An auditee only gets issues from the stores they are linked to.
        if assignee.role == ROLE_AUDITEE and (
                not store_id or assignee.id not in linked_auditee_ids(db, store_id)):
            raise _bad("assignee must be an auditee linked to the issue's store")


@router.get("")
def list_issues(
    status: str | None = None,
    store_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Issue)
    if user.role == ROLE_STORE_MANAGER:
        # Issues assigned to them, plus every issue at the stores they run.
        q = q.filter(or_(Issue.assignee_id == user.id,
                         Issue.store_id.in_(_managed_store_ids(db, user))))
    elif user.role == ROLE_AUDITEE:
        q = q.filter(Issue.assignee_id == user.id)
    elif user.role == ROLE_AUDITOR:
        # Only issues from the auditor's own audits.
        q = q.filter(
            Issue.audit_id.in_(db.query(Audit.id).filter(Audit.auditor_id == user.id)))
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
    _check_refs(db, body.model_dump(), body.store_id)
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
        if not _can_work_on(db, user, i):
            raise HTTPException(status_code=403, detail={"error": "forbidden"})
        allowed = {"status", "action_taken", "evidence"}
        d = {k: v for k, v in d.items() if k in allowed}
    elif user.role == ROLE_AUDITEE:
        # An auditee replies and sets the status of their own issue. Closing it
        # is the audit manager's call.
        if i.assignee_id != user.id:
            raise HTTPException(status_code=403, detail={"error": "forbidden"})
        allowed = {"status", "action_taken", "evidence"}
        d = {k: v for k, v in d.items() if k in allowed}
        if d.get("status") == "Closed":
            raise _bad("an auditee cannot close an issue; mark it Resolved")

    _check_refs(db, d, d.get("store_id") or i.store_id)
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
    if user.role in (ROLE_AUDITEE, ROLE_STORE_MANAGER) and ("status" in d or "action_taken" in d):
        # What the manager sees in the issue: who changed what, and when.
        i.meta = {**(i.meta or {}), "history": [*(i.meta or {}).get("history", []), {
            "at": dt.datetime.utcnow().isoformat(), "by": user.name,
            "status": i.status, "reply": d.get("action_taken")}]}
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
