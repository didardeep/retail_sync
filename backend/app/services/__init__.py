"""Scoring, brand lookup, and audit-logging logic, kept out of the route layer."""

from sqlalchemy import func

from ..models import (
    ROLE_AUDITEE, UNASSIGNED_BRAND, Audit, AuditLog, AuditorAvailability, Brand,
    User, UserStore,
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
    rows = session.query(UserStore.user_id).join(User, User.id == UserStore.user_id).filter(
        UserStore.store_id == store_id, User.role == ROLE_AUDITEE, User.active.is_(True)).all()
    return {r[0] for r in rows}


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
