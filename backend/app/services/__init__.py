"""Scoring, issue-raising, and audit-logging logic, kept out of the route layer."""
import datetime as dt

from sqlalchemy import func

from ..models import (
    Audit, AuditLog, AuditorAvailability, Issue, SopAudit, SopTemplate,
)

# How each answer contributes to the weighted score.
ANSWER_VALUE = {"Yes": 1.0, "Partial": 0.5, "No": 0.0}


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


def raise_issue_from_response(session, audit: Audit, response) -> Issue | None:
    """A failed critical question automatically becomes a store-manager action."""
    if not response.question:
        return None
    store = audit.store
    issue = Issue(
        audit_id=audit.id,
        store_id=audit.store_id,
        response_id=response.id,
        title=response.question.text[:200],
        description=response.remarks or "Raised automatically from a failed critical check.",
        process=response.question.process,
        sub_process=response.question.sub_process,
        priority=response.risk or "Critical",
        status="Open",
        assignee_id=store.manager_id if store else None,
        raised_by_id=audit.auditor_id,
        due_date=dt.date.today() + dt.timedelta(days=7),
        meta={"auto_raised": True, "question_code": response.question.code},
    )
    session.add(issue)
    return issue


def log_action(session, user_id, action, entity_type, entity_id=None, details=None):
    """Write a single audit log entry. Call after the main DB operation
    succeeds; caller is responsible for session.commit()."""
    session.add(AuditLog(
        user_id=user_id, action=action, entity_type=entity_type,
        entity_id=entity_id, details=details or {},
    ))


# SOP audit statuses. A manager schedules an audit (Planned); the auditor's
# first save makes it a Draft; submitting makes it Submitted. Cancelled is for
# a scheduled audit that will not happen. The review step later adds Returned
# (back to the auditor) and Approved.
SOP_PLANNED = "Planned"
SOP_DRAFT = "Draft"
SOP_SUBMITTED = "Submitted"
SOP_APPROVED = "Approved"
SOP_CANCELLED = "Cancelled"

# Statuses in which the owning auditor may still change answers and photos.
# The review step adds "Returned" here, in this one place.
SOP_AUDITOR_EDITABLE = (SOP_PLANNED, SOP_DRAFT)

# SOP audits that count in reports and dashboards. When a manager review step
# is added, extend this tuple in this one place.
SOP_FINAL_STATUSES = (SOP_SUBMITTED, SOP_APPROVED)

# SOP audits that occupy an auditor's day.
SOP_BOOKING_STATUSES = (SOP_PLANNED, SOP_DRAFT)


def current_template(session, code):
    """The version of an audit tool that new audits use, or None."""
    return session.query(SopTemplate).filter_by(
        code=code, is_current=True, is_active=True).first()


def _clash(other, kind):
    """The 409 body for a booking clash: enough to say where and when."""
    return {
        "error": "auditor already booked", "audit_id": other.id, "kind": kind,
        "store": other.store.name if other.store else None,
        "scheduled_at": other.scheduled_at.isoformat() if other.scheduled_at else None,
    }


def auditor_conflict(session, auditor_id, day, store_id=None,
                     exclude_audit_id=None, exclude_sop_id=None):
    """Why an auditor cannot be booked on `day`, or None if they are free.

    Checks their blocked dates, other classic audits (Planned/Ongoing) and SOP
    audits (Planned/Draft with a scheduled date) on the same day. A booking at
    the same store does not clash (Cash and FMCG can be done in one visit);
    a booking at a different store does. With no store given, any booking clashes.
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
            return _clash(other, "legacy")

    sop = session.query(SopAudit).filter(
        SopAudit.auditor_id == auditor_id,
        SopAudit.scheduled_at.isnot(None),
        func.date(SopAudit.scheduled_at) == day.isoformat(),
        SopAudit.status.in_(SOP_BOOKING_STATUSES),
    )
    if exclude_sop_id:
        sop = sop.filter(SopAudit.id != exclude_sop_id)
    for other in sop.all():
        if store_id is None or other.store_id != store_id:
            return _clash(other, "sop")
    return None


def sop_effective_rows(audit: SopAudit) -> dict:
    """criterion_id -> (criterion, score_row_or_None) for every criterion in
    the audit's template. A criterion with no row yet is N/A only if the
    template marks it default_na."""
    rows = {r.criterion_id: r for r in audit.scores}
    out = {}
    for sec in audit.template.sections:
        for c in sec.criteria:
            out[c.id] = (c, rows.get(c.id))
    return out


def _sop_is_na(criterion, row) -> bool:
    return criterion.default_na if row is None else bool(row.is_na)


def compute_sop_score(audit: SopAudit) -> dict:
    """Sum of entered scores over applicable criteria. Max = marks of the
    non-N/A criteria. Unanswered applicable criteria add to max but not to
    score, so the figure is a running total until the audit is submitted."""
    eff = sop_effective_rows(audit)
    sections = []
    total = maximum = 0.0
    answered = applicable = 0
    for sec in audit.template.sections:
        s_score = s_max = 0.0
        for c in sec.criteria:
            row = eff[c.id][1]
            if _sop_is_na(c, row):
                continue
            applicable += 1
            s_max += c.marks
            if row is not None and row.score is not None:
                answered += 1
                s_score += row.score
        sections.append({"id": sec.id, "code": sec.code, "name": sec.name,
                         "score": s_score, "max_score": s_max})
        total += s_score
        maximum += s_max
    percent = round(total / maximum * 100, 2) if maximum else 0.0
    return {"score": total, "max_score": maximum, "percent": percent,
            "answered": answered, "applicable": applicable,
            "sections": sections}


def validate_sop_submit(audit: SopAudit) -> list:
    """Blocking problems for submit: unanswered criteria and missing proof
    required by the criterion's flags."""
    photos = {a.criterion_id for a in audit.attachments}
    problems = []
    for cid, (c, row) in sop_effective_rows(audit).items():
        if _sop_is_na(c, row):
            continue
        if row is None or row.score is None:
            problems.append({"criterion_id": cid, "problem": "unanswered"})
            continue
        if c.requires_comment and not (row.comment or "").strip():
            problems.append({"criterion_id": cid, "problem": "comment required"})
        if c.requires_photo and cid not in photos:
            problems.append({"criterion_id": cid, "problem": "photo required"})
    return problems
