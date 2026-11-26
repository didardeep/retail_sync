"""Rebuild this year's Q4 audit data so every dashboard number agrees.

    python seed_q4.py            # back up current Q4 rows, then replace them
    python seed_q4.py --dry-run  # show what would be deleted and created

Only Q4 changes: audits scheduled from 1 October, with their answers, issues,
observations, annexures, audit-log rows and notifications. Users, stores,
questions, checklists and Q1-Q3 stay as they are. A JSON backup of what is
deleted goes to backups/ first.

What makes the numbers line up:
- every store has at least one scored (Completed or Approved) audit submitted
  in Q4, so its Q4 store score is the average of those audits and nothing else;
- answers are timed between the audit's start and its submit, approvals and
  send-backs are logged after the submit, so "days to finish" and "review time"
  are real;
- some audits are submitted after their due date, some are overdue, some wait
  for review and one is sent back, so every Execution tile has something to show;
- an issue is raised for most High-criticality questions answered No (a few are
  left without one on purpose), with Open / In Progress / Closed set by age, and
  closed ones carry closed_at.

The October wave uses fixed dates; the November and December waves are placed
around today so overdue / not-yet-due stay true on the day the script is run.
Run it again to start over; random choices are seeded, so a rerun on the same
day gives the same data.
"""
import datetime as dt
import json
import random
import sys
from pathlib import Path

from app.db import SessionLocal
from app.models import (
    ROLE_AUDIT_MANAGER, ROLE_AUDITEE, ROLE_AUDITOR, Annexure, Audit, AuditLog,
    AuditResponse, Checklist, ChecklistItem, Issue, Notification, Observation,
    Store, StoreScore, User, UserStore,
)
from app.services import compute_audit_score, next_audit_id, sync_store_score

REPLIES = [
    "Checked with the team and corrected the entries. Process explained to the shift staff.",
    "Issue fixed and verified with the store manager. New checklist put up at the counter.",
    "Root cause was a missed handover. Added a sign-off to the daily closing routine.",
    "Vendor called in and the fault repaired. Photos shared with the area office.",
]
NO_REMARKS = [
    "Not in place at the time of the visit.",
    "Records incomplete for the last week.",
    "Checked with the shift lead; process not being followed.",
    "Seen on the floor during the walk-through.",
]
OBS_RISK = {"High": "High", "Medium": "Medium", "Low": "Low"}
ISSUE_DAYS = 14          # an issue is due two weeks after it is raised
WINDOW = dt.timedelta(days=2, hours=8)  # 10:00 start to 18:00 two days later


def _row(obj):
    out = {}
    for col in obj.__table__.columns:
        v = getattr(obj, col.name)
        out[col.name] = v.isoformat() if isinstance(v, (dt.date, dt.datetime)) else v
    return out


def main(dry_run=False):
    s = SessionLocal()
    rng = random.Random(2026_4)
    now = dt.datetime.now().replace(second=0, microsecond=0)
    today = now.replace(hour=0, minute=0)
    year = now.year
    q4_start, q4_end = dt.datetime(year, 10, 1), dt.datetime(year + 1, 1, 1)
    if not (q4_start <= now < q4_end):
        sys.exit(f"Today ({now:%d %b %Y}) is not in Q4 {year}; this script places audits around today.")

    # ---- what goes ---------------------------------------------------------------
    old = s.query(Audit).filter(Audit.scheduled_at >= q4_start, Audit.scheduled_at < q4_end).all()
    old_ids = [a.id for a in old]
    issues = s.query(Issue).filter(Issue.audit_id.in_(old_ids)).all()
    issue_ids = [i.id for i in issues]
    observations = s.query(Observation).filter(Observation.audit_id.in_(old_ids)).all()
    annexures = s.query(Annexure).filter(Annexure.audit_id.in_(old_ids)).all()
    responses = s.query(AuditResponse).filter(AuditResponse.audit_id.in_(old_ids)).all()
    logs = s.query(AuditLog).filter(
        ((AuditLog.entity_type == "audit") & AuditLog.entity_id.in_(old_ids))
        | ((AuditLog.entity_type == "issue") & AuditLog.entity_id.in_(issue_ids or ["-"]))).all()
    notes = [n for n in s.query(Notification).all()
             if any(i in (n.title or "") or i in (n.link or "") for i in old_ids + issue_ids)]
    scores = s.query(StoreScore).all()
    print(f"Q4 {year} now: {len(old)} audits, {len(responses)} answers, {len(issues)} issues, "
          f"{len(observations)} observations, {len(annexures)} annexures, {len(logs)} log rows, "
          f"{len(notes)} notifications")
    if dry_run:
        print("Dry run: nothing changed.")
        return

    backup_dir = Path(__file__).parent / "backups"
    backup_dir.mkdir(exist_ok=True)
    backup = backup_dir / f"q4_backup_{now:%Y-%m-%d_%H%M}.json"
    backup.write_text(json.dumps({
        "audits": [_row(x) for x in old], "audit_responses": [_row(x) for x in responses],
        "issues": [_row(x) for x in issues], "observations": [_row(x) for x in observations],
        "annexures": [_row(x) for x in annexures], "audit_log": [_row(x) for x in logs],
        "notifications": [_row(x) for x in notes], "store_scores": [_row(x) for x in scores],
    }, indent=1, default=str), encoding="utf-8")
    print(f"Backup written to {backup}")

    for group in (notes, logs, issues, observations, annexures, responses):
        for x in group:
            s.delete(x)
    s.flush()
    for a in old:
        s.delete(a)
    s.flush()

    # ---- who and what ------------------------------------------------------------
    manager = s.query(User).filter_by(email="manager").first() \
        or s.query(User).filter_by(role=ROLE_AUDIT_MANAGER).first()
    auditors = sorted(s.query(User).filter_by(role=ROLE_AUDITOR, active=True).all(), key=lambda u: u.name)
    stores = s.query(Store).order_by(Store.id).all()
    full = s.query(Checklist).filter_by(name="Full Store Audit").first()
    items = s.query(ChecklistItem).filter_by(checklist_id=full.id).order_by(ChecklistItem.sort_order).all()

    def linked(store_id, role):
        return sorted(u for (u,) in s.query(User.id).join(UserStore, UserStore.user_id == User.id)
                      .filter(UserStore.store_id == store_id, User.role == role, User.active.is_(True)))

    def auditor_for(store, n):
        ids = linked(store.id, ROLE_AUDITOR)
        return ids[n % len(ids)] if ids else auditors[n % len(auditors)].id

    def assignee_for(store):
        ids = linked(store.id, ROLE_AUDITEE)
        return ids[0] if ids else store.manager_id

    # How well each store does: near its Q3 score, so the trend carries on.
    q3 = {sc.store_id: sc.q3 for sc in scores}
    yes_rate = {st.id: min(0.97, max(0.5, ((q3.get(st.id) or 78) + rng.uniform(-6, 4)) / 100)) for st in stores}

    def log(user_id, action, kind, entity_id, at, details=None):
        s.add(AuditLog(user_id=user_id, action=action, entity_type=kind, entity_id=entity_id,
                       details=details or {}, timestamp=at))

    def make_audit(store, start, status, auditor_id, notes=None):
        a = Audit(id=next_audit_id(s), store_id=store.id, checklist_id=full.id,
                  checklist_ids=[full.id], auditor_id=auditor_id, created_by_id=manager.id,
                  audit_type="Checklist based Audit", created_at=start - dt.timedelta(days=10),
                  scheduled_at=start, due_at=start + WINDOW, status=status, notes=notes)
        s.add(a)
        s.flush()
        log(manager.id, "schedule_audit", "audit", a.id, a.created_at, {"store": store.id})
        for it in items:
            s.add(AuditResponse(audit_id=a.id, question_id=it.question_id, answered_at=None))
        s.flush()
        s.refresh(a)
        return a

    def answer(a, until, share=1.0):
        """Answer `share` of the questions between the start and `until`."""
        rate = yes_rate[a.store_id]
        resp = sorted(a.responses, key=lambda r: r.question_id)
        todo = resp if share >= 1 else rng.sample(resp, round(len(resp) * share))
        span = (until - a.scheduled_at).total_seconds()
        for r in todo:
            roll = rng.random()
            r.answer = "NA" if roll < 0.03 else ("Yes" if rng.random() < rate else "No")
            r.answered_at = a.scheduled_at + dt.timedelta(seconds=span * rng.uniform(0.02, 0.98))
            if r.answer == "No":
                r.remarks = rng.choice(NO_REMARKS)
        log(a.auditor_id, "start_audit", "audit", a.id, min(r.answered_at for r in todo))

    def submit(a, at):
        a.submitted_at = at
        a.score = compute_audit_score(a)
        log(a.auditor_id, "submit_audit", "audit", a.id, at, {"score": a.score})

    def approve(a, at):
        a.status, a.approved_by_id, a.decision_at = "Approved", manager.id, at
        for r in a.responses:
            r.review_status, r.reviewed_by_id, r.reviewed_at = "approved", manager.id, at
        log(manager.id, "approve_audit", "audit", a.id, at, {"score": a.score})

    def send_back(a, at, note):
        nos = [r for r in a.responses if r.answer == "No"] or a.responses
        r = nos[0]
        r.review_status, r.review_note, r.review_category = "query", note, "missing_evidence"
        r.reviewed_by_id, r.reviewed_at = manager.id, at
        a.decision_note, a.decision_at = "Please add photos for the No answers.", at
        log(manager.id, "return_audit", "audit", a.id, at, {"reason": a.decision_note})

    created = []

    # ---- October: one audit per store, all approved ------------------------------
    # Two are submitted late; one was sent back once before it was approved.
    for n, st in enumerate(stores):
        start = dt.datetime(year, 10, 6 + 2 * n, 10)
        a = make_audit(st, start, "Completed", auditor_for(st, n), "Quarterly checklist audit.")
        late = n in (3, 7)
        sub = a.due_at + dt.timedelta(days=1 + n % 2, hours=2) if late else start + dt.timedelta(days=1, hours=6 + n % 5)
        answer(a, sub)
        submit(a, sub)
        if n == 5:
            back = sub + dt.timedelta(days=1)
            send_back(a, back, "Photo missing for this answer.")
            sub = back + dt.timedelta(days=1, hours=3)
            a.submitted_at = sub
            for r in a.responses:
                if r.review_status == "query":
                    r.review_reply = "Photo added."
            log(a.auditor_id, "submit_audit", "audit", a.id, sub, {"score": a.score, "resubmitted": True})
        approve(a, sub + dt.timedelta(days=1 + n % 4, hours=3))
        created.append(a)

    # ---- November: the work in hand, placed around today ---------------------------
    def at(days, hour=10):
        return today + dt.timedelta(days=days, hours=hour)

    nov = [
        # store index, start offset (days from today), status, note
        (0, -14, "Completed", "Awaiting review: submitted on time."),
        (2, -9, "Completed", "Awaiting review: submitted a day late."),
        (4, -4, "Completed", "Awaiting review: submitted yesterday."),
        (6, -11, "Changes Requested", "Sent back: photos needed for the No answers."),
        (8, -6, "Ongoing", "Started but not finished by the due date: overdue."),
        (1, -1, "Ongoing", "Started yesterday, due tomorrow."),
        (9, -5, "Planned", "Not started by its due date: overdue."),
        (3, -16, "Cancelled", "Store closed for renovation that day."),
    ]
    for n, (i, off, status, note) in enumerate(nov):
        st = stores[i]
        start = at(off)
        a = make_audit(st, start, status, auditor_for(st, i + n + 1), note)
        if status == "Completed":
            sub = (a.due_at + dt.timedelta(days=1, hours=1)) if "late" in note else min(start + dt.timedelta(days=1, hours=7), now - dt.timedelta(hours=20))
            answer(a, sub)
            submit(a, sub)
        elif status == "Changes Requested":
            sub = start + dt.timedelta(days=1, hours=5)
            answer(a, sub)
            submit(a, sub)
            send_back(a, sub + dt.timedelta(days=3), "Photo missing for this answer.")
            a.status = "Changes Requested"
        elif status == "Ongoing":
            answer(a, min(now, a.due_at), share=0.5)
        created.append(a)

    # ---- December and the rest of November: coming up ------------------------------
    for n, off in enumerate((3, 5, 8, 12, 15, 19)):
        st = stores[(n * 3 + 1) % len(stores)]
        start = at(off)
        if start + WINDOW >= q4_end:
            continue
        a = make_audit(st, start, "Planned", None if n in (2, 5) else auditor_for(st, n + 3),
                       "Not yet assigned." if n in (2, 5) else "Quarterly checklist audit.")
        created.append(a)
    s.flush()

    # ---- issues and observations from the No answers of submitted audits ------------
    issue_no = max((int(i.split("-")[1]) for (i,) in s.query(Issue.id).filter(Issue.id.like("ISS-%"))
                    if i.split("-")[1].isdigit()), default=0)
    raised = skipped = 0
    for a in created:
        if a.submitted_at is None:
            continue
        nos = [r for r in sorted(a.responses, key=lambda r: r.question.code or "") if r.answer == "No"]
        store = s.get(Store, a.store_id)
        for k, r in enumerate(nos):
            q = r.question
            if (q.criticality or "Low") != "High":
                continue
            if (raised + skipped) % 5 == 4:   # a few left without an issue: "No issue raised"
                skipped += 1
                continue
            raised += 1
            issue_no += 1
            created_at = a.submitted_at + dt.timedelta(hours=1)
            due = (created_at + dt.timedelta(days=ISSUE_DAYS)).date()
            age = (now - created_at).days
            # Older issues are mostly closed; some ran past their due date unfinished.
            if age > 30:
                status = "Closed" if raised % 4 else "In Progress"
            elif age > 10:
                status = ("Closed", "In Progress", "Open")[raised % 3]
            else:
                status = ("Open", "In Progress")[raised % 2]
            assignee = assignee_for(store)
            meta = {}
            closed_at = None
            if status != "Open":
                reply_at = created_at + dt.timedelta(days=3 + raised % 4)
                meta["history"] = [{"at": reply_at.isoformat(), "by": s.get(User, assignee).name if assignee else "Store",
                                    "status": status, "reply": REPLIES[raised % len(REPLIES)]}]
            if status == "Closed":
                # Most close within the two weeks; every fifth a little after.
                closed_at = created_at + dt.timedelta(days=(ISSUE_DAYS + 4) if raised % 5 == 0 else 5 + raised % 8)
                meta["review"] = {"decision": "accepted", "by": s.get(User, a.auditor_id).name,
                                  "at": closed_at.isoformat(), "note": ""}
            s.add(Issue(
                id=f"ISS-{issue_no:03d}", audit_id=a.id, store_id=a.store_id, response_id=r.id,
                title=f"Not met: {q.text}"[:240], description=f"Answered No during audit {a.id}. {r.remarks or ''}".strip(),
                process=q.process, sub_process=q.sub_process, priority="Critical" if k == 0 else "High",
                status=status, assignee_id=assignee, raised_by_id=a.auditor_id,
                action_taken=meta["history"][0]["reply"] if meta.get("history") else None,
                due_date=due, closed_at=closed_at, created_at=created_at, meta=meta,
            ))
            log(a.auditor_id, "raise_issue", "issue", f"ISS-{issue_no:03d}", created_at, {"audit": a.id})
        for sr, r in enumerate(nos[:2], 1):
            s.add(Observation(
                audit_id=a.id, store_id=a.store_id, sr_no=sr, observation=r.question.text,
                risk=OBS_RISK.get(r.question.criticality or "Low", "Low"),
                action_plan="Correct the gap and confirm at the next audit.",
                person_responsible=store.name,
                target=(a.submitted_at + dt.timedelta(days=30)).strftime("%d-%b-%y"),
                status="Closed" if a.status == "Approved" and (now - a.submitted_at).days > 30 else "Open",
            ))
    s.flush()

    # ---- Q4 store scores: the average of each store's scored Q4 audits -------------
    for st in stores:
        sync_store_score(s, st.id, dt.datetime(year, 11, 1))
    s.commit()

    by_status = {}
    for a in created:
        by_status[a.status] = by_status.get(a.status, 0) + 1
    print(f"Created {len(created)} Q4 audits: {by_status}")
    print(f"Issues raised: {raised}; High-criticality No answers left without an issue: {skipped}")


if __name__ == "__main__":
    main(dry_run="--dry-run" in sys.argv)
