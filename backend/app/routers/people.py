"""People an audit manager looks after: auditors and auditees.

Admin keeps full user management in admin.py. This router lets an audit
manager (and admin) add, list, edit and deactivate the two roles they work
with day to day, without opening user management to every role.
"""
import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import hash_password, require_roles
from ..db import get_db
from ..models import (
    ROLE_ADMIN, ROLE_AUDIT_MANAGER, ROLE_AUDITEE, ROLE_AUDITOR, Audit, Issue, Store, User,
    UserStore,
)
from ..schemas import PersonCreate, PersonUpdate
from ..services import auditor_conflict, link_person, linked_auditee_ids, log_action
from ..services.alerts import notify

router = APIRouter(prefix="/api/people", tags=["people"])

MANAGED_ROLES = (ROLE_AUDITOR, ROLE_AUDITEE)
OPEN_AUDIT_STATUSES = ("Planned", "Ongoing")
OPEN_ISSUE_STATUSES = ("Open", "In Progress", "On Hold", "Resolved")
_guard = require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)


def _stores_of(db, uid):
    return db.query(Store).join(UserStore, UserStore.store_id == Store.id).filter(
        UserStore.user_id == uid).order_by(Store.name).all()


def _open_work(db, person):
    if person.role == ROLE_AUDITOR:
        return db.query(Audit).filter(
            Audit.auditor_id == person.id, Audit.status.in_(OPEN_AUDIT_STATUSES)).all()
    return db.query(Issue).filter(
        Issue.assignee_id == person.id, Issue.status.in_(OPEN_ISSUE_STATUSES)).all()


def _person_dict(db, u):
    stores = _stores_of(db, u.id)
    d = u.to_dict()
    d["store_ids"] = [s.id for s in stores]
    d["store_names"] = [s.name for s in stores]
    d["open_work"] = len(_open_work(db, u))   # open audits (auditor) or issues (auditee)
    return d


def _target(db, uid):
    u = db.get(User, uid)
    if not u or u.role not in MANAGED_ROLES:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    return u


@router.get("")
def list_people(
    role: str | None = None,
    store_id: str | None = None,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(_guard),
):
    """Auditors and auditees, optionally of one role or one store."""
    if role and role not in MANAGED_ROLES:
        raise HTTPException(status_code=400, detail={"error": "role must be AUDITOR or AUDITEE"})
    q = db.query(User).filter(User.role.in_([role] if role else MANAGED_ROLES))
    if not include_inactive:
        q = q.filter(User.active.is_(True))
    if store_id:
        q = q.filter(User.id.in_(db.query(UserStore.user_id).filter(UserStore.store_id == store_id)))
    return [_person_dict(db, u) for u in q.order_by(User.name).all()]


def _create(db, user, body, role):
    email = body.email.strip().lower()
    if not email or not body.name.strip():
        raise HTTPException(status_code=400, detail={"error": "name and email are required"})
    if not body.password:
        raise HTTPException(status_code=400, detail={"error": "a password is required"})
    if db.query(User.id).filter(func.lower(User.email) == email).first():
        raise HTTPException(status_code=409, detail={"error": "email already in use"})
    store_ids = list(dict.fromkeys(body.store_ids))
    if role == ROLE_AUDITEE and not store_ids:
        raise HTTPException(status_code=400, detail={"error": "link the auditee to at least one store"})
    stores = db.query(Store).filter(Store.id.in_(store_ids)).all() if store_ids else []
    missing = set(store_ids) - {s.id for s in stores}
    if missing:
        raise HTTPException(status_code=404, detail={"error": f"store not found: {sorted(missing)[0]}"})

    person = User(
        name=body.name.strip(), email=email, password_hash=hash_password(body.password),
        role=role, designation=body.designation, region=body.region,
        phone=(body.phone or "").strip() or None,
        notify_email=(body.notify_email or "").strip() or None, active=True,
    )
    db.add(person)
    db.flush()
    for s in stores:
        link_person(db, person, s.id)
    names = ", ".join(s.name for s in stores)
    word = "auditor" if role == ROLE_AUDITOR else "auditee"
    notify(db, person, "welcome",
           f"Welcome! You were added as {word}" + (f" for {names}" if names else ""),
           None, f"welcome:{person.id}")
    log_action(db, user.id, f"create_{word}", "user", person.id,
               {"email": email, "store_ids": store_ids})
    db.commit()
    return _person_dict(db, person)


@router.post("/auditors", status_code=201)
def create_auditor(body: PersonCreate, db: Session = Depends(get_db), user: User = Depends(_guard)):
    """Add an auditor; store_ids (optional) makes them those stores' auditor."""
    return _create(db, user, body, ROLE_AUDITOR)


@router.post("/auditees", status_code=201)
def create_auditee(body: PersonCreate, db: Session = Depends(get_db), user: User = Depends(_guard)):
    """Add an auditee linked to one or more stores."""
    return _create(db, user, body, ROLE_AUDITEE)


def _hand_over(db, user, person, new, work):
    """Move a leaving person's open audits or issues to `new` (same role)."""
    now = dt.datetime.utcnow()
    if person.role == ROLE_AUDITOR:
        for a in work:
            if a.scheduled_at:
                clash = auditor_conflict(db, new.id, a.scheduled_at.date(), a.store_id,
                                         exclude_audit_id=a.id)
                if clash:
                    raise HTTPException(status_code=409, detail={**clash, "for_audit": a.id})
        for a in work:
            a.auditor_id = new.id
            notify(db, new, "audit_assigned", f"Audit {a.id} is now yours (handed over from {person.name})",
                   f"/audits?id={a.id}", f"assign:{a.id}:{new.id}")
        return
    not_linked = sorted({i.store_id for i in work if new.id not in linked_auditee_ids(db, i.store_id)})
    if not_linked:
        raise HTTPException(status_code=422, detail={
            "error": f"{new.name} is not an auditee of store {not_linked[0]}; link them first",
            "stores": not_linked})
    for i in work:
        i.assignee_id = new.id
        i.meta = {**(i.meta or {}), "history": [*(i.meta or {}).get("history", []), {
            "at": now.isoformat(), "by": user.name, "status": i.status,
            "reply": f"Handed over from {person.name} to {new.name}"}]}
    notify(db, new, "issue_assigned",
           f"{len(work)} issue{'s' if len(work) != 1 else ''} handed over to you from {person.name}",
           "/my-issues", f"handover:{person.id}:{new.id}:{now.isoformat()}")


@router.patch("/{uid}")
def update_person(
    uid: str,
    body: PersonUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(_guard),
):
    """Edit an auditor or auditee. Deactivating someone with open audits or issues
    needs `hand_over_to`, so their work is not left behind."""
    person = _target(db, uid)
    d = body.model_dump(exclude_unset=True)
    for field in ("designation", "region"):
        if field in d:
            setattr(person, field, d[field])
    if "name" in d:
        if not (d["name"] or "").strip():
            raise HTTPException(status_code=400, detail={"error": "name is required"})
        person.name = d["name"].strip()
    for field in ("phone", "notify_email"):
        if field in d:
            setattr(person, field, (d[field] or "").strip() or None)

    moved = 0
    if d.get("active") is False and person.active:
        work = _open_work(db, person)
        if work and not d.get("hand_over_to"):
            kind = "audit" if person.role == ROLE_AUDITOR else "issue"
            raise HTTPException(status_code=409, detail={
                "error": f"{person.name} has {len(work)} open {kind}{'s' if len(work) != 1 else ''}; "
                         "choose who takes them over", "count": len(work)})
        if work:
            new = db.get(User, d["hand_over_to"])
            if not new or new.role != person.role or not new.active or new.id == person.id:
                raise HTTPException(status_code=422, detail={
                    "error": "hand_over_to must be another active person with the same role"})
            _hand_over(db, user, person, new, work)
            moved = len(work)
        person.active = False
    elif d.get("active") is True:
        person.active = True

    log_action(db, user.id, "update_person", "user", uid,
               {"fields": [k for k in d if k != "hand_over_to"], "handed_over": moved})
    db.commit()
    return {**_person_dict(db, person), "handed_over": moved}
