import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_roles
from ..db import get_db
from ..models import (
    ROLE_ADMIN, ROLE_AUDIT_MANAGER, ROLE_AUDITEE, ROLE_AUDITOR, ROLE_CLUSTER_HEAD,
    ROLE_HO_OPERATIONS, ROLE_STORE_MANAGER, Audit, Issue, Store, User,
)
from ..schemas import IssueCreate, IssueDecision, IssueReview, IssueUpdate
from ..services import linked_auditee_ids, log_action
from ..services.alerts import notify

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
    elif user.role == ROLE_CLUSTER_HEAD:
        q = q.filter(Issue.store_id.in_(db.query(Store.id).filter(Store.region == user.region)))
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
    if user.role in (ROLE_AUDITOR, ROLE_CLUSTER_HEAD, ROLE_HO_OPERATIONS):
        raise HTTPException(status_code=403, detail={"error": "forbidden"})
    i = db.get(Issue, iid)
    if not i:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    d = body.model_dump(exclude_unset=True)
    old_status = i.status

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
    old_assignee = i.assignee_id
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
    # A review only stands for the answer that was reviewed.
    if i.status != old_status and (i.meta or {}).get("review"):
        i.meta = {k: v for k, v in i.meta.items() if k != "review"}
    if user.role in (ROLE_AUDITEE, ROLE_STORE_MANAGER) and ("status" in d or "action_taken" in d):
        # What the manager sees in the issue: who changed what, and when.
        i.meta = {**(i.meta or {}), "history": [*(i.meta or {}).get("history", []), {
            "at": dt.datetime.utcnow().isoformat(), "by": user.name,
            "status": i.status, "reply": d.get("action_taken")}]}
    if "status" in d:
        log_action(db, user.id, "update_issue_status", "issue", i.id,
                   {"status": i.status})
    if i.assignee_id and i.assignee_id != old_assignee:
        # Reassigned (for example to another auditee of the same store).
        new = db.get(User, i.assignee_id)
        before = db.get(User, old_assignee) if old_assignee else None
        i.meta = {**(i.meta or {}), "history": [*(i.meta or {}).get("history", []), {
            "at": dt.datetime.utcnow().isoformat(), "by": user.name, "status": i.status,
            "reply": f"Reassigned from {before.name if before else 'nobody'} to {new.name if new else 'nobody'}"}]}
        notify(db, new, "issue_assigned", f"Issue assigned to you: {i.title}",
               f"/my-issues?id={i.id}" if new and new.role == ROLE_AUDITEE else f"/issues?id={i.id}",
               f"issue_assign:{i.id}:{i.assignee_id}:{dt.datetime.utcnow().isoformat()}")
        log_action(db, user.id, "reassign_issue", "issue", i.id,
                   {"from": old_assignee, "to": i.assignee_id})
    db.commit()
    return i.to_dict()


@router.post("/{iid}/decision")
def decide_issue(
    iid: str,
    body: IssueDecision,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    """The audit manager's call on the action taken. Approve closes the issue.
    Deny reopens it for the assignee and needs a reason; evidence (photos or
    files from /api/evidence) is optional. The question and answer the issue
    came from are never edited here. Every decision goes into the history."""
    i = db.get(Issue, iid)
    if not i:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    if i.status == "Closed":
        raise HTTPException(status_code=409, detail={"error": "issue is already closed"})
    if body.decision not in ("approve", "deny"):
        raise _bad("decision must be approve or deny")
    reason = body.reason.strip()
    if body.decision == "deny" and not reason:
        raise _bad("say why the action taken is denied")
    if not (i.action_taken or "").strip():
        raise HTTPException(status_code=409, detail={
            "error": "no action has been recorded on this issue yet"})

    now = dt.datetime.utcnow()
    approved = body.decision == "approve"
    entry = {"decision": "approved" if approved else "denied", "by": user.name,
             "at": now.isoformat(), "reason": reason, "evidence": body.evidence or []}
    meta = {k: v for k, v in (i.meta or {}).items() if k != "review"}
    meta["decisions"] = [*meta.get("decisions", []), entry]
    if approved:
        i.status = "Closed"
        i.closed_at = now
    else:
        i.status = "Open"
        i.closed_at = None
    label = "Approved" if approved else "Denied"
    meta["history"] = [*meta.get("history", []), {
        "at": now.isoformat(), "by": user.name, "status": i.status,
        "reply": f"{label}: {reason}" if reason else label,
        "evidence": body.evidence or []}]
    i.meta = meta
    if i.assignee_id:
        assignee = db.get(User, i.assignee_id)
        notify(db, assignee, "issue_decision",
               f"Action on '{i.title}' was {label.lower()}" + (f": {reason}" if reason else ""),
               f"/my-issues?id={i.id}" if assignee and assignee.role == ROLE_AUDITEE
               else f"/issues?id={i.id}",
               f"decision:{i.id}:{now.isoformat()}")
    log_action(db, user.id, "decide_issue", "issue", i.id,
               {"decision": body.decision, "reason": reason,
                "evidence": len(body.evidence or [])})
    db.commit()
    return i.to_dict()


@router.post("/{iid}/review")
def review_issue(
    iid: str,
    body: IssueReview,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDITOR, ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    """The auditor checks the answer to a Resolved issue from their own audit.
    Accepting leaves it Resolved for the audit manager to close; sending it back
    reopens it for the assignee with the reason. Either way it is recorded."""
    i = db.get(Issue, iid)
    if not i:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    if user.role == ROLE_AUDITOR and (not i.audit or i.audit.auditor_id != user.id):
        raise HTTPException(status_code=403, detail={"error": "forbidden"})
    if i.status != "Resolved":
        raise HTTPException(status_code=409, detail={"error": "only a resolved issue can be reviewed"})
    note = body.note.strip()
    if body.decision not in ("accept", "send_back"):
        raise _bad("decision must be accept or send_back")
    if body.decision == "send_back" and not note:
        raise _bad("say why the issue is sent back")

    now = dt.datetime.utcnow().isoformat()
    accepted = body.decision == "accept"
    meta = {k: v for k, v in (i.meta or {}).items() if k != "review"}
    if accepted:
        meta["review"] = {"decision": "accepted", "by": user.name, "at": now, "note": note}
    else:
        i.status = "In Progress"
    label = "Accepted" if accepted else "Sent back"
    meta["history"] = [*meta.get("history", []), {
        "at": now, "by": user.name, "status": i.status,
        "reply": f"{label}: {note}" if note else label}]
    i.meta = meta
    log_action(db, user.id, "review_issue", "issue", i.id, {"decision": body.decision})
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
