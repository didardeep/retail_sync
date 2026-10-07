"""
Stage the database for the live demo (the script is in docs/DEMO_SCRIPT.md).

    python demo.py prepare                 # stage the demo; also resets a previous run
    python demo.py prepare --new-baseline  # use after `python seed.py --reset`
    python demo.py status                  # show what is staged

What `prepare` does (it is safe to run again and again):
  1. Publishes version 2 of the Cash tool, with a photo required on "Float Cash" and
     a comment required on "Shortage Management", so there is real version history and
     the review screen has something to flag. Audits done on version 1 are untouched.
  2. Creates one nearly finished Cash audit as a Draft for the demo auditor
     (17 of 21 answered, the two proof rules not met), so the review/submit part of the
     demo takes a minute instead of twenty.
  3. Deletes every SOP audit created after the baseline time (anything made live during
     a previous demo), so the data is exactly as staged.

The baseline time is written to backend/.demo_baseline.json the first time `prepare`
runs. Run `prepare --new-baseline` after reseeding the database.
"""
import datetime as dt
import json
import shutil
import sys
import uuid
from pathlib import Path

import seed
from app.db import SessionLocal, init_db
from app.models import (
    ROLE_AUDIT_MANAGER, SopAttachment, SopAudit, SopAuditScore, SopTemplate, Store, User,
)
from app.routers.sop_audits import ATTACHMENT_FOLDER
from app.services import compute_sop_score
from app.sop_versions import publish_version, tree_of

BASELINE_FILE = Path(__file__).parent / ".demo_baseline.json"
_NAMESPACE = uuid.UUID("5f0c3a53-7a54-4c2e-9b0e-0d0a5c1e51a0")
STORY_ID = str(uuid.uuid5(_NAMESPACE, "demo-story-draft"))

DEMO_AUDITOR = "aud.amit.singh@retail-chain.com"
DEMO_STORE = "Ub City"
# Question title (start of it) -> the proof rule switched on in version 2.
PROOF_RULES = {
    "Float Cash": "requires_photo",
    "Shortage Management": "requires_comment",
}
V2_NOTE = "Proof now required: a photo for the float cash check and a comment for shortage records"
LEFT_UNANSWERED = 4
# Share of the marks the staged answers earn, cycled through the questions.
STORY_PATTERN = [0.9, 0.8, 1.0, 0.7, 0.9, 0.8, 1.0, 0.9, 0.7]


def _now():
    return dt.datetime.utcnow()


def _baseline(new):
    if new or not BASELINE_FILE.exists():
        BASELINE_FILE.write_text(json.dumps({"created_at": _now().isoformat()}))
    return dt.datetime.fromisoformat(json.loads(BASELINE_FILE.read_text())["created_at"])


def _repair_history_dates(db, baseline):
    """Finished audits seeded before the fix show today's date as 'last updated'; give them
    their real date back so the history list reads like history."""
    fixed = 0
    for a in db.query(SopAudit).filter(SopAudit.status == "Submitted",
                                       SopAudit.submitted_at.isnot(None),
                                       SopAudit.created_at < baseline):
        if a.updated_at and a.updated_at > a.submitted_at + dt.timedelta(days=1):
            a.updated_at = a.submitted_at
            fixed += 1
    return fixed


def _delete_audits(db, audits):
    ids = [a.id for a in audits]
    if not ids:
        return 0
    for model in (SopAttachment, SopAuditScore):
        db.query(model).filter(model.audit_id.in_(ids)).delete(synchronize_session=False)
    db.query(SopAudit).filter(SopAudit.id.in_(ids)).delete(synchronize_session=False)
    for audit_id in ids:
        shutil.rmtree(ATTACHMENT_FOLDER / audit_id, ignore_errors=True)
    return len(ids)


def _publish_v2(db, manager):
    tpl = db.query(SopTemplate).filter_by(code="CASH", is_current=True).one()
    tree = tree_of(tpl)
    for sec in tree["sections"]:
        for crit in sec["criteria"]:
            for start, flag in PROOF_RULES.items():
                if crit["title"].startswith(start):
                    crit[flag] = True
    result = publish_version(db, "CASH", tree, manager, tpl.version, V2_NOTE)
    return result.template, not result.unchanged


def _stage_story_draft(db, template, auditor, store):
    when = _now() - dt.timedelta(hours=3)
    audit = SopAudit(
        id=STORY_ID, template_id=template.id, store_id=store.id, auditor_id=auditor.id,
        status="Draft", created_at=when, updated_at=when, client_created_at=when,
    )
    db.add(audit)
    db.flush()
    questions = [c for s in template.sections for c in s.criteria if not c.default_na]
    for i, crit in enumerate(questions[:len(questions) - LEFT_UNANSWERED]):
        share = STORY_PATTERN[i % len(STORY_PATTERN)]
        score = min(crit.marks, round(crit.marks * share * 2) / 2)
        audit.scores.append(SopAuditScore(
            criterion_id=crit.id, score=score, is_na=False, answered_at=when))
    db.flush()
    summary = compute_sop_score(audit)
    audit.score, audit.max_score, audit.percent = (
        summary["score"], summary["max_score"], summary["percent"])
    return audit, summary, len(questions)


def prepare(new_baseline=False):
    init_db()
    db = SessionLocal()
    try:
        manager = db.query(User).filter_by(role=ROLE_AUDIT_MANAGER).first()
        auditor = db.query(User).filter_by(email=DEMO_AUDITOR).first()
        store = db.query(Store).filter_by(name=DEMO_STORE).first()
        if not (manager and auditor and store):
            sys.exit("Run `python seed.py --reset` first: the demo users or stores are missing.")

        baseline = _baseline(new_baseline)
        leftovers = db.query(SopAudit).filter(
            (SopAudit.id == STORY_ID) | (SopAudit.created_at > baseline)).all()
        removed = _delete_audits(db, leftovers)
        repaired = _repair_history_dates(db, baseline)
        db.commit()

        template, published = _publish_v2(db, manager)
        audit, summary, total = _stage_story_draft(db, template, auditor, store)
        db.commit()

        print("Demo staged.")
        print(f"  baseline            : {baseline:%Y-%m-%d %H:%M} UTC (audits made after this are removed on reset)")
        print(f"  removed from a previous run: {removed} audit(s); history dates repaired: {repaired}")
        print(f"  Cash tool           : version {template.version}"
              f"{' (published now)' if published else ' (already published)'}")
        print(f"  staged draft        : {DEMO_STORE}, {summary['answered']} of {summary['applicable']} answered"
              f" ({summary['percent']}% so far), owner {auditor.name}")
        print()
        print_logins(db)
    finally:
        db.close()


def print_logins(db):
    print("Demo logins (password for every one of them: " + seed.DEFAULT_PASSWORD + ")")
    for label, role in (("Audit Manager", "AUDIT_MANAGER"), ("Admin", "ADMIN")):
        for u in db.query(User).filter_by(role=role):
            print(f"  {label:<14}: {u.email}")
    print(f"  {'Auditor':<14}: {DEMO_AUDITOR}   (the demo auditor)")
    print("  Store Manager : sm.a.sharma@retail-chain.com")


def status():
    db = SessionLocal()
    try:
        story = db.get(SopAudit, STORY_ID)
        cash = db.query(SopTemplate).filter_by(code="CASH", is_current=True).first()
        print("baseline file :", BASELINE_FILE.read_text() if BASELINE_FILE.exists() else "none (run prepare)")
        print("Cash version  :", cash.version if cash else "?")
        print("staged draft  :", f"{story.status}, {story.percent}%" if story else "missing (run prepare)")
        print("SOP audits    :", db.query(SopAudit).count())
    finally:
        db.close()


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else "prepare"
    if command == "prepare":
        prepare(new_baseline="--new-baseline" in sys.argv)
    elif command == "status":
        status()
    else:
        sys.exit(__doc__)
