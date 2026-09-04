"""Scoring and issue-raising logic, kept out of the route layer."""
import datetime as dt

from sqlalchemy import func

from .models import Audit, Issue

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
