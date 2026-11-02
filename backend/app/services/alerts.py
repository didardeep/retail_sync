"""Reminders and escalations. run_alerts is safe to run any number of times: each
alert has a key and goes to a person once, so a later run only adds what is new.

Everyone gets alerts in the app's bell. Mail also goes out when SMTP_HOST is set
and the person has a notify_email.
"""
import asyncio
import datetime as dt
import logging
import os
import smtplib
from email.message import EmailMessage

from ..db import SessionLocal
from ..models import (
    ROLE_AUDIT_MANAGER, ROLE_AUDITEE, ROLE_CLUSTER_HEAD, ROLE_HO_OPERATIONS, Audit, Issue,
    Notification, Store, User,
)
from . import log_action

log = logging.getLogger(__name__)

REMINDER_DAYS = 2
OPEN_STATUSES = ("Open", "In Progress", "On Hold")
INTERVAL_SECONDS = int(os.getenv("ALERT_INTERVAL_SECONDS", "3600"))


def send_mail(to, subject, body):
    """True when the mail was handed to the server. No SMTP_HOST means no mail."""
    host = os.getenv("SMTP_HOST")
    if not host:
        return False
    msg = EmailMessage()
    msg["From"] = os.getenv("SMTP_FROM") or os.getenv("SMTP_USER") or "alerts@retail-sync.local"
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(host, int(os.getenv("SMTP_PORT", "587")), timeout=20) as server:
            if os.getenv("SMTP_TLS", "1") == "1":
                server.starttls()
            if os.getenv("SMTP_USER"):
                server.login(os.getenv("SMTP_USER"), os.getenv("SMTP_PASSWORD", ""))
            server.send_message(msg)
        return True
    except (OSError, smtplib.SMTPException):
        log.exception("could not send alert mail")
        return False


def notify(db, user, kind, title, link, key):
    """Add one alert for a person unless they already had it. True when it is new."""
    if not user or not user.active:
        return False
    exists = db.query(Notification.id).filter_by(user_id=user.id, dedupe_key=key).first()
    if exists:
        return False
    note = Notification(user_id=user.id, kind=kind, title=title[:300], link=link, dedupe_key=key)
    if user.notify_email and send_mail(user.notify_email, f"Store Audit: {title}"[:200], title):
        note.emailed_at = dt.datetime.utcnow()
    db.add(note)
    db.flush()
    return True


def _issue_link(user, issue):
    return f"/my-issues?id={issue.id}" if user.role == ROLE_AUDITEE else f"/issues?id={issue.id}"


def _escalate(db, issue, store, targets):
    new = [u for u in targets if notify(
        db, u, "escalation",
        f"Overdue {issue.priority} issue at {store.name if store else 'a store'}: {issue.title}",
        f"/issues?id={issue.id}", f"escalate:{issue.id}:{issue.due_date}")]
    if new:
        names = ", ".join(u.name for u in new)
        issue.meta = {**(issue.meta or {}), "escalated_at": dt.datetime.utcnow().isoformat(),
                      "history": [*(issue.meta or {}).get("history", []), {
                          "at": dt.datetime.utcnow().isoformat(), "by": "System",
                          "status": issue.status, "reply": f"Escalated to {names}"}]}
        log_action(db, None, "escalate_issue", "issue", issue.id, {"to": names})
    return len(new)


def run_alerts(db, today=None):
    """Send what is due now. Returns how many alerts of each kind are new."""
    today = today or dt.date.today()
    counts = {"audit_reminders": 0, "issue_reminders": 0, "escalations": 0}

    # Upcoming audits: the auditor and the store manager.
    until = dt.datetime.combine(today + dt.timedelta(days=REMINDER_DAYS), dt.time.max)
    start = dt.datetime.combine(today, dt.time.min)
    upcoming = db.query(Audit).filter(
        Audit.status == "Planned", Audit.scheduled_at >= start, Audit.scheduled_at <= until)
    for audit in upcoming:
        store = db.get(Store, audit.store_id)
        when = audit.scheduled_at.strftime("%d %b %H:%M")
        for uid in {audit.auditor_id, store.manager_id if store else None} - {None}:
            counts["audit_reminders"] += notify(
                db, db.get(User, uid), "audit_reminder",
                f"Audit {audit.id} at {store.name if store else audit.store_id} on {when}",
                f"/audits?id={audit.id}", f"audit:{audit.id}:{audit.scheduled_at.date()}")

    managers = db.query(User).filter_by(role=ROLE_AUDIT_MANAGER, active=True).all()
    head_office = db.query(User).filter_by(role=ROLE_HO_OPERATIONS, active=True).all()

    issues = db.query(Issue).filter(Issue.status.in_(OPEN_STATUSES), Issue.due_date.isnot(None))
    for issue in issues:
        store = db.get(Store, issue.store_id) if issue.store_id else None

        # Pending actions: the person it is assigned to, once before the due date
        # and once more when it is late.
        if issue.assignee_id and issue.due_date <= today + dt.timedelta(days=REMINDER_DAYS):
            late = issue.due_date < today
            assignee = db.get(User, issue.assignee_id)
            counts["issue_reminders"] += notify(
                db, assignee, "issue_reminder",
                f"{'Overdue' if late else 'Due soon'} ({issue.due_date:%d %b}): {issue.title}",
                _issue_link(assignee, issue) if assignee else None,
                f"issue:{issue.id}:{issue.due_date}:{'late' if late else 'soon'}")

        # Overdue: the audit manager; critical ones also go up the line.
        if issue.due_date < today:
            targets = list(managers)
            if issue.priority == "Critical":
                region = store.region if store else None
                targets += db.query(User).filter_by(
                    role=ROLE_CLUSTER_HEAD, region=region, active=True).all() if region else []
                targets += head_office
            counts["escalations"] += _escalate(db, issue, store, targets)

    db.commit()
    return counts


def _run_once():
    db = SessionLocal()
    try:
        return run_alerts(db)
    finally:
        db.close()


async def alert_loop():
    """Started with the app: a first run shortly after start, then on the interval."""
    delay = min(60, INTERVAL_SECONDS)
    while True:
        await asyncio.sleep(delay)
        delay = INTERVAL_SECONDS
        try:
            log.info("alerts: %s", await asyncio.to_thread(_run_once))
        except Exception:
            log.exception("alert run failed")
