import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import get_current_user, get_staff_user, require_roles
from ..db import get_db
from ..models import (
    ROLE_ADMIN, ROLE_AUDIT_MANAGER, ROLE_AUDITEE, ROLE_AUDITOR, ROLE_STORE_MANAGER, Audit, Brand,
    Issue, Store, User, UserStore,
)
from ..schemas import StoreCreate, StorePersonLink, StorePersonRemove, StoreUpdate
from ..services import (
    STORE_FORMATS, STORE_TYPES, auditor_conflict, get_or_create_brand, link_person,
    linked_auditee_ids, linked_people, log_action,
)
from ..services.alerts import notify

router = APIRouter(prefix="/api/stores", tags=["stores"])

_FIELD_MAP = [
    ("name", "name"), ("city", "city"), ("region", "region"),
    ("format", "store_format"), ("type", "store_type"),
    ("status", "status"), ("manager_id", "manager_id"),
    ("contact", "contact"), ("email", "email"), ("address", "address"),
    ("brand_id", "brand_id"),
]
_FORMAT_CODES = {f["code"] for f in STORE_FORMATS}
# Issues still waiting on the auditee; Closed ones stay with whoever closed them.
OPEN_ISSUE_STATUSES = ("Open", "In Progress", "On Hold", "Resolved")
_ROLE_WORD = {ROLE_AUDITOR: "auditor", ROLE_AUDITEE: "auditee"}


def _check_brand(db, brand_id):
    if not db.get(Brand, brand_id):
        raise HTTPException(status_code=400, detail={"error": "unknown brand"})


def _check_format(value):
    if value and value not in _FORMAT_CODES:
        raise HTTPException(status_code=400, detail={
            "error": f"format must be one of {', '.join(sorted(_FORMAT_CODES))}"})


def _store(db, sid):
    s = db.get(Store, sid)
    if not s:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    return s


def _people_counts(db):
    """{store_id: {"auditors": n, "auditees": n}} for every store, one query."""
    rows = db.query(UserStore.store_id, User.role, func.count(UserStore.id)).join(
        User, User.id == UserStore.user_id).filter(
        User.active.is_(True), User.role.in_([ROLE_AUDITOR, ROLE_AUDITEE])).group_by(
        UserStore.store_id, User.role).all()
    out = {}
    for sid, role, n in rows:
        out.setdefault(sid, {"auditors": 0, "auditees": 0})[
            "auditors" if role == ROLE_AUDITOR else "auditees"] = n
    return out


def _person(u):
    return {"id": u.id, "name": u.name, "email": u.email, "designation": u.designation,
            "region": u.region, "phone": u.phone}


@router.get("/catalog")
def store_catalog(user: User = Depends(get_current_user)):
    """Store formats with their full forms, and store types with a short note."""
    return {"formats": STORE_FORMATS, "types": STORE_TYPES}


@router.get("")
def list_stores(
    status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Store)
    if user.role == ROLE_STORE_MANAGER:
        q = q.filter(Store.manager_id == user.id)
    elif user.role == ROLE_AUDITEE:
        q = q.filter(Store.id.in_(
            db.query(UserStore.store_id).filter(UserStore.user_id == user.id)))
    if status:
        q = q.filter(Store.status == status)
    counts = _people_counts(db) if user.role in (ROLE_AUDIT_MANAGER, ROLE_ADMIN) else {}
    out = []
    for s in q.all():
        d = s.to_dict()
        if user.role in (ROLE_AUDIT_MANAGER, ROLE_ADMIN):
            c = counts.get(s.id, {"auditors": 0, "auditees": 0})
            d["auditor_count"], d["auditee_count"] = c["auditors"], c["auditees"]
        out.append(d)
    return out


@router.post("", status_code=201)
def create_store(
    body: StoreCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    d = body.model_dump()
    if db.get(Store, d["id"]):
        raise HTTPException(status_code=409, detail={"error": "store id already exists"})
    _check_format(d.get("format"))
    if d.get("brand_id"):
        _check_brand(db, d["brand_id"])
        brand_id = d["brand_id"]
    else:
        brand_id = get_or_create_brand(db, None).id
    s = Store(
        id=d["id"], brand_id=brand_id, name=d["name"], city=d.get("city"), region=d.get("region"),
        store_format=d.get("format"), store_type=d.get("type"),
        status=d.get("status", "Operating"), manager_id=d.get("manager_id"),
        contact=d.get("contact"), email=d.get("email"),
        address=d.get("address"), meta=d.get("meta", {}),
    )
    db.add(s)
    log_action(db, user.id, "create_store", "store", s.id, {"name": s.name})
    db.commit()
    # What the manager can do next with the new store.
    return {**s.to_dict(), "next_steps": ["assign_auditor", "add_auditee", "schedule_audit"]}


@router.put("/{sid}")
def update_store(
    sid: str,
    body: StoreUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    s = _store(db, sid)
    d = body.model_dump(exclude_unset=True)
    if "brand_id" in d:
        # A store always has a brand: null or blank is not a way to clear it.
        if not d["brand_id"]:
            raise HTTPException(status_code=400, detail={"error": "a store must belong to a brand"})
        _check_brand(db, d["brand_id"])
    if "format" in d:
        _check_format(d["format"])
    for field, attr in _FIELD_MAP:
        if field in d:
            setattr(s, attr, d[field])
    log_action(db, user.id, "update_store", "store", s.id, {"fields": list(d.keys())})
    db.commit()
    return s.to_dict()


@router.get("/{sid}")
def store_details(
    sid: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    """Everything the store view shows: details, format and type in words, its
    auditors and auditees, the last and next audit and the open issues."""
    s = _store(db, sid)
    fmt = next((f for f in STORE_FORMATS if f["code"] == s.store_format), None)
    typ = next((t for t in STORE_TYPES if t["code"] == s.store_type), None)
    now = dt.datetime.utcnow()
    last = db.query(Audit).filter(
        Audit.store_id == sid, Audit.status.in_(["Completed", "Approved"])).order_by(
        Audit.submitted_at.desc()).first()
    upcoming = db.query(Audit).filter(
        Audit.store_id == sid, Audit.status == "Planned", Audit.scheduled_at >= now).order_by(
        Audit.scheduled_at).first()
    open_issues = db.query(func.count(Issue.id)).filter(
        Issue.store_id == sid, Issue.status.in_(OPEN_ISSUE_STATUSES)).scalar()

    def brief(a):
        return None if not a else {
            "id": a.id, "status": a.status, "score": a.score,
            "auditor": a.auditor.name if a.auditor else None,
            "scheduled_at": a.scheduled_at.isoformat() if a.scheduled_at else None,
            "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None}

    return {
        **s.to_dict(),
        "format_name": fmt["name"] if fmt else None, "format_note": fmt["note"] if fmt else None,
        "type_note": typ["note"] if typ else None,
        "auditors": [_person(u) for u in linked_people(db, sid, ROLE_AUDITOR)],
        "auditees": [_person(u) for u in linked_people(db, sid, ROLE_AUDITEE)],
        "last_audit": brief(last), "next_audit": brief(upcoming),
        "open_issues": open_issues,
    }


# ---- People linked to a store ----------------------------------------------

@router.get("/{sid}/auditors")
def store_auditors(
    sid: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_staff_user),
):
    """The store's own auditors: scheduling suggests these first."""
    _store(db, sid)
    return [_person(u) for u in linked_people(db, sid, ROLE_AUDITOR)]


@router.get("/{sid}/auditees")
def store_auditees(
    sid: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_staff_user),
):
    """The auditees an issue at this store can be assigned to."""
    _store(db, sid)
    return [{"id": u.id, "name": u.name, "email": u.email}
            for u in linked_people(db, sid, ROLE_AUDITEE)]


def _link(db, user, sid, body, role):
    s = _store(db, sid)
    person = db.get(User, body.user_id)
    if not person or person.role != role or not person.active:
        raise HTTPException(status_code=422, detail={
            "error": f"user must be an active {_ROLE_WORD[role]}"})
    if not link_person(db, person, sid):
        raise HTTPException(status_code=409, detail={
            "error": f"{person.name} is already linked to this store"})
    notify(db, person, "store_link", f"You were added to {s.name} as {_ROLE_WORD[role]}",
           None, f"link:{sid}:{person.id}:{dt.datetime.utcnow().isoformat()}")
    log_action(db, user.id, f"link_{_ROLE_WORD[role]}", "store", sid, {"user_id": person.id})
    db.commit()
    return [_person(u) for u in linked_people(db, sid, role)]


@router.post("/{sid}/auditors", status_code=201)
def add_store_auditor(
    sid: str,
    body: StorePersonLink,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    return _link(db, user, sid, body, ROLE_AUDITOR)


@router.post("/{sid}/auditees", status_code=201)
def add_store_auditee(
    sid: str,
    body: StorePersonLink,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    return _link(db, user, sid, body, ROLE_AUDITEE)


def _unlink(db, sid, uid, role):
    link = db.query(UserStore).join(User, User.id == UserStore.user_id).filter(
        UserStore.store_id == sid, UserStore.user_id == uid, User.role == role).first()
    if not link:
        raise HTTPException(status_code=404, detail={
            "error": f"this {_ROLE_WORD[role]} is not linked to the store"})
    db.delete(link)


@router.post("/{sid}/auditors/{uid}/remove")
def remove_store_auditor(
    sid: str,
    uid: str,
    body: StorePersonRemove,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    """Take an auditor off a store. Their planned audits there go to
    `reassign_to`, or are left unassigned; audits already under way stay theirs."""
    s = _store(db, sid)
    _unlink(db, sid, uid, ROLE_AUDITOR)
    planned = db.query(Audit).filter(
        Audit.store_id == sid, Audit.auditor_id == uid, Audit.status == "Planned").all()
    ongoing = db.query(func.count(Audit.id)).filter(
        Audit.store_id == sid, Audit.auditor_id == uid, Audit.status == "Ongoing").scalar()
    new = None
    if body.reassign_to:
        new = db.get(User, body.reassign_to)
        if not new or new.role != ROLE_AUDITOR or not new.active or new.id == uid:
            raise HTTPException(status_code=422, detail={
                "error": "reassign_to must be another active auditor"})
        for a in planned:
            if a.scheduled_at:
                clash = auditor_conflict(db, new.id, a.scheduled_at.date(), sid,
                                         exclude_audit_id=a.id)
                if clash:
                    raise HTTPException(status_code=409, detail={**clash, "for_audit": a.id})
    for a in planned:
        a.auditor_id = new.id if new else None
        if new:
            notify(db, new, "audit_assigned", f"Audit {a.id} at {s.name} is now yours",
                   f"/audits?id={a.id}", f"assign:{a.id}:{new.id}")
    removed = db.get(User, uid)
    notify(db, removed, "store_unlink", f"You were removed from {s.name} as auditor",
           None, f"unlink:{sid}:{uid}:{dt.datetime.utcnow().isoformat()}")
    log_action(db, user.id, "unlink_auditor", "store", sid, {
        "user_id": uid, "planned_audits": [a.id for a in planned],
        "reassigned_to": new.id if new else None})
    db.commit()
    return {"removed": uid, "planned_audits_moved": len(planned),
            "reassigned_to": new.id if new else None, "ongoing_audits_kept": ongoing}


@router.post("/{sid}/auditees/{uid}/remove")
def remove_store_auditee(
    sid: str,
    uid: str,
    body: StorePersonRemove,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    """Take an auditee off a store. Their open issues there must go to another
    auditee of the store first (`move_issues_to`), so nothing is left orphaned."""
    s = _store(db, sid)
    _unlink(db, sid, uid, ROLE_AUDITEE)
    issues = db.query(Issue).filter(
        Issue.store_id == sid, Issue.assignee_id == uid,
        Issue.status.in_(OPEN_ISSUE_STATUSES)).all()
    new = None
    if issues:
        if not body.move_issues_to:
            raise HTTPException(status_code=409, detail={
                "error": f"{len(issues)} open issue{'s' if len(issues) != 1 else ''} at this store; "
                         "choose another auditee to move them to", "count": len(issues)})
        db.flush()   # the link is gone, so the person being removed is not a candidate
        if body.move_issues_to not in linked_auditee_ids(db, sid):
            raise HTTPException(status_code=422, detail={
                "error": "move_issues_to must be another auditee linked to this store"})
        new = db.get(User, body.move_issues_to)
        now = dt.datetime.utcnow().isoformat()
        for i in issues:
            i.assignee_id = new.id
            i.meta = {**(i.meta or {}), "history": [*(i.meta or {}).get("history", []), {
                "at": now, "by": user.name, "status": i.status,
                "reply": f"Moved to {new.name}"}]}
        notify(db, new, "issue_assigned",
               f"{len(issues)} issue{'s' if len(issues) != 1 else ''} at {s.name} moved to you",
               "/my-issues", f"moved:{sid}:{uid}:{new.id}:{now}")
    removed = db.get(User, uid)
    notify(db, removed, "store_unlink", f"You were removed from {s.name} as auditee",
           None, f"unlink:{sid}:{uid}:{dt.datetime.utcnow().isoformat()}")
    log_action(db, user.id, "unlink_auditee", "store", sid, {
        "user_id": uid, "issues_moved": [i.id for i in issues],
        "moved_to": new.id if new else None})
    db.commit()
    return {"removed": uid, "issues_moved": len(issues), "moved_to": new.id if new else None}
