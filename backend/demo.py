"""
Stage the database for the live demo.

    python demo.py prepare                 # stage the demo; also resets a previous run
    python demo.py prepare --new-baseline  # use after `python seed.py --reset`
    python demo.py status                  # show what is staged

What `prepare` does (it is safe to run again and again):
  Deletes every checklist audit created after the baseline (anything made live during a
  previous demo), with its answers, observations and issues, so the data is exactly as
  staged.

The baseline is written to backend/.demo_baseline.json the first time `prepare` runs: the
time and the ids of the audits that existed then. Run `prepare --new-baseline` after
reseeding the database.
"""
import datetime as dt
import json
import sys
from pathlib import Path

import seed
from app.db import SessionLocal, init_db
from app.models import (
    ROLE_AUDIT_MANAGER, Audit, AuditResponse, Issue, Observation, Store, User,
)

BASELINE_FILE = Path(__file__).parent / ".demo_baseline.json"

DEMO_AUDITOR = "aud.amit.singh@retail-chain.com"
DEMO_STORE = "Ub City"


def _now():
    return dt.datetime.utcnow()


def _baseline(db, new):
    """Returns (time, ids of audits that existed when the baseline was set)."""
    if new or not BASELINE_FILE.exists():
        ids = [a.id for a in db.query(Audit)]
        BASELINE_FILE.write_text(json.dumps({"created_at": _now().isoformat(), "classic_ids": ids}))
    data = json.loads(BASELINE_FILE.read_text())
    return dt.datetime.fromisoformat(data["created_at"]), data.get("classic_ids")


def _delete_new_audits(db, keep_ids):
    """Audits an auditor started or submitted during a demo, with their answers and the
    issues they raised. Everything not in the baseline list goes (nothing if there is no list)."""
    if keep_ids is None:
        return 0
    ids = [a.id for a in db.query(Audit) if a.id not in set(keep_ids)]
    if not ids:
        return 0
    db.query(Issue).filter(Issue.audit_id.in_(ids)).delete(synchronize_session=False)
    db.query(Observation).filter(Observation.audit_id.in_(ids)).delete(synchronize_session=False)
    db.query(AuditResponse).filter(AuditResponse.audit_id.in_(ids)).delete(synchronize_session=False)
    db.query(Audit).filter(Audit.id.in_(ids)).delete(synchronize_session=False)
    return len(ids)


def prepare(new_baseline=False):
    init_db()
    db = SessionLocal()
    try:
        manager = db.query(User).filter_by(role=ROLE_AUDIT_MANAGER).first()
        auditor = db.query(User).filter_by(email=DEMO_AUDITOR).first()
        store = db.query(Store).filter_by(name=DEMO_STORE).first()
        if not (manager and auditor and store):
            sys.exit("Run `python seed.py --reset` first: the demo users or stores are missing.")

        baseline, audit_ids = _baseline(db, new_baseline)
        removed = _delete_new_audits(db, audit_ids)
        db.commit()

        print("Demo staged.")
        print(f"  baseline            : {baseline:%Y-%m-%d %H:%M} UTC")
        print(f"  removed from a previous run: {removed} audit(s)")
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
    print("  Auditee       : ae.neha.kapoor@retail-chain.com")


def status():
    db = SessionLocal()
    try:
        print("baseline file :", BASELINE_FILE.read_text() if BASELINE_FILE.exists() else "none (run prepare)")
        print("audits        :", db.query(Audit).count())
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
