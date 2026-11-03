"""Scoring, brand lookup, and audit-logging logic, kept out of the route layer."""
import datetime as dt

from sqlalchemy import func

from ..models import (
    ROLE_AUDITEE, ROLE_AUDITOR, UNASSIGNED_BRAND, Audit, AuditLog, AuditorAvailability, Brand,
    Store, StoreScore, User, UserStore,
)

# How each answer contributes to the weighted score.
ANSWER_VALUE = {"Yes": 1.0, "No": 0.0}


def compute_audit_score(audit: Audit) -> float:
    """
    Weighted percentage. 'NA' answers are excluded from both numerator and
    denominator so a store isn't penalised for a question that doesn't apply.
    """
    earned = possible = 0.0
    for r in audit.responses:
        if not r.question or r.answer in (None, "NA"):
            continue
        w = r.question.weight or 1
        possible += w
        earned += w * ANSWER_VALUE.get(r.answer, 0.0)
    if possible == 0:
        return 0.0
    return round(earned / possible * 100, 2)


SCORED_STATUSES = ("Completed", "Approved")


def quarter_of(when) -> int:
    """Calendar quarter, 1 to 4."""
    return (when.month - 1) // 3 + 1


def sync_store_score(session, store_id, when):
    """Set the store's score for the quarter of `when` to the average of its
    scored audits submitted in that quarter, so the dashboards move when an
    audit score does. A quarter with no scored audit keeps its imported value."""
    if not store_id or not when:
        return
    session.flush()
    q = quarter_of(when)
    start = dt.datetime(when.year, 3 * (q - 1) + 1, 1)
    end = dt.datetime(when.year + 1, 1, 1) if q == 4 else dt.datetime(when.year, 3 * q + 1, 1)
    scores = [s for (s,) in session.query(Audit.score).filter(
        Audit.store_id == store_id, Audit.status.in_(SCORED_STATUSES),
        Audit.score.isnot(None), Audit.submitted_at >= start, Audit.submitted_at < end)]
    if not scores:
        return
    row = session.query(StoreScore).filter(StoreScore.store_id == store_id).first()
    if row is None:
        store = session.get(Store, store_id)
        row = StoreScore(store_id=store_id, store_code=store.store_code if store else None,
                         status=store.status if store else None)
        session.add(row)
    setattr(row, f"q{q}", round(sum(scores) / len(scores), 1))


def next_audit_id(session) -> str:
    last = session.query(func.max(Audit.id)).scalar()
    n = int(last.split("-")[1]) + 1 if last and "-" in last else 1000
    return f"AUD-{n}"


def get_or_create_brand(session, name) -> Brand:
    """The brand called `name` (case-insensitive), created if it does not exist.
    A blank name means the Unassigned brand."""
    name = str(name or "").strip() or UNASSIGNED_BRAND
    brand = session.query(Brand).filter(func.lower(Brand.name) == name.lower()).first()
    if not brand:
        brand = Brand(name=name)
        session.add(brand)
        session.flush()
    return brand


def linked_auditee_ids(session, store_id) -> set[str]:
    """Ids of the active auditees linked to a store."""
    return _linked_ids(session, store_id, ROLE_AUDITEE)


def linked_auditor_ids(session, store_id) -> set[str]:
    """Ids of the active auditors assigned to a store (its default auditors)."""
    return _linked_ids(session, store_id, ROLE_AUDITOR)


def _linked_ids(session, store_id, role) -> set[str]:
    rows = session.query(UserStore.user_id).join(User, User.id == UserStore.user_id).filter(
        UserStore.store_id == store_id, User.role == role, User.active.is_(True)).all()
    return {r[0] for r in rows}


def linked_people(session, store_id, role) -> list[User]:
    """The active people of one role linked to a store, by name."""
    ids = _linked_ids(session, store_id, role)
    if not ids:
        return []
    return session.query(User).filter(User.id.in_(ids)).order_by(User.name).all()


def link_person(session, user, store_id) -> bool:
    """Link a person to a store. False when they already were."""
    if session.query(UserStore.id).filter_by(user_id=user.id, store_id=store_id).first():
        return False
    session.add(UserStore(user_id=user.id, store_id=store_id))
    session.flush()
    return True


# Store formats (who owns and who runs the store) and store types (its size).
# The frontend shows the full forms and notes; the codes are what is stored.
STORE_FORMATS = [
    {"code": "COCO", "name": "Company Owned, Company Operated",
     "note": "The company owns the store and runs it."},
    {"code": "COFO", "name": "Company Owned, Franchise Operated",
     "note": "The company owns the store; a franchisee runs it."},
    {"code": "FOCO", "name": "Franchise Owned, Company Operated",
     "note": "A franchisee owns the store; the company runs it."},
    {"code": "FOFO", "name": "Franchise Owned, Franchise Operated",
     "note": "A franchisee owns the store and runs it."},
]
STORE_TYPES = [
    {"code": "Flagship", "name": "Flagship",
     "note": "The brand's largest showcase store, usually in a prime location, with the full range."},
    {"code": "Standard", "name": "Standard",
     "note": "A regular full-size store with the usual range and staffing."},
    {"code": "Compact", "name": "Compact",
     "note": "A smaller store with a reduced range, often in a neighbourhood or high street."},
    {"code": "Kiosk", "name": "Kiosk",
     "note": "A small counter or stall, for example in a mall or station, with a few lines."},
]


def log_action(session, user_id, action, entity_type, entity_id=None, details=None):
    """Write a single audit log entry. Call after the main DB operation
    succeeds; caller is responsible for session.commit()."""
    session.add(AuditLog(
        user_id=user_id, action=action, entity_type=entity_type,
        entity_id=entity_id, details=details or {},
    ))


def _clash(other):
    """The 409 body for a booking clash: enough to say where and when."""
    return {
        "error": "auditor already booked", "audit_id": other.id,
        "store": other.store.name if other.store else None,
        "scheduled_at": other.scheduled_at.isoformat() if other.scheduled_at else None,
    }


def auditor_conflict(session, auditor_id, day, store_id=None,
                     exclude_audit_id=None):
    """Why an auditor cannot be booked on `day`, or None if they are free.

    Checks their blocked dates and other audits (Planned/Ongoing) on the same
    day. A booking at the same store does not clash; a booking at a different
    store does. With no store given, any booking clashes.
    Returns the dict the API sends as the 409 body.
    """
    blocked = session.query(AuditorAvailability).filter(
        AuditorAvailability.auditor_id == auditor_id,
        AuditorAvailability.from_date <= day,
        AuditorAvailability.to_date >= day,
    ).first()
    if blocked:
        return {"error": "auditor unavailable", "reason": blocked.reason}

    classic = session.query(Audit).filter(
        Audit.auditor_id == auditor_id,
        func.date(Audit.scheduled_at) == day.isoformat(),
        Audit.status.in_(["Planned", "Ongoing"]),
    )
    if exclude_audit_id:
        classic = classic.filter(Audit.id != exclude_audit_id)
    for other in classic.all():
        if store_id is None or other.store_id != store_id:
            return _clash(other)
    return None
