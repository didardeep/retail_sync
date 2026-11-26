"""Stage the "almost finished audit and issues waiting for the manager" demo.

    python demo_review_scenario.py

What it sets up (safe to run again: it first removes what an earlier run made):

  Amit (auditor) has an audit at Pacific Hub, AUD-1007, with 33 of its 34 questions
  answered (97%), the FIRST question left blank. He answers it, reviews and submits.
  Three of his answers are "No", and each already has an issue assigned to the
  store's auditee (Pooja Iyer), who has replied and attached evidence. The audit
  manager then has three issues to review, and an audit to approve once it is submitted:

    issue 1  strong reply and a real photo      -> approve and close
    issue 2  strong reply and a signed receipt  -> approve and close
    issue 3  vague reply, blurry unrelated photo -> deny, with a reason

It changes only AUD-1007, its answers and the issues it carries. Nothing else is touched,
and it never creates users. Dev data only: do not run it on a real server.
"""
import datetime as dt
import shutil
import sys
import uuid
from pathlib import Path

from app.db import SessionLocal, init_db
from app.models import Audit, AuditLog, AuditResponse, Issue, Question, User
from app.routers.evidence import EVIDENCE_FOLDER
from app.services import log_action

try:
    from PIL import Image, ImageDraw, ImageFilter
except ImportError:  # the pictures fall back to the sample photo
    Image = None

AUDIT_ID = "AUD-1007"
AUDITOR_LOGIN = "amit"
AUDITEE_LOGIN = "pooja"
TAG = "review-scenario"
SAMPLE_PHOTO = Path(__file__).resolve().parent.parent / "docs" / "demo" / "sample-proof-float-cash.jpg"

# (question code, priority, the auditor's note, the auditor's picture, the auditee's reply,
#  the auditee's picture, days until due). Pictures: a title and some lines, or "sample"/"blurry".
ISSUES = [
    ("Q002", "Critical",
     "Count sheet shows a difference of Rs 1,150 on Till 2 at close.",
     ("TILL 2 - CLOSING COUNT", ["System report   48,250", "Counted         47,100", "Difference      -1,150"]),
     "Recounted every till with the shift supervisor. The Rs 1,150 gap was a late POS sync on Till 2. "
     "The sync is fixed and the daily count sheet is now signed by two people.",
     "sample", 7),
    ("Q005", "Critical",
     "The CMS agency missed the pickup on 14 Nov; cash stayed in the safe two extra days.",
     ("CMS PICKUP REGISTER", ["Scheduled   14 Nov  11:00", "Collected   16 Nov  15:40", "Status      LATE"]),
     "Agreed fixed pickup slots with the CMS agency (Mon and Thu, 11:00). The pickup register is now "
     "countersigned by the agent. The missed pickup was collected on 16 Nov; receipt attached.",
     ("CMS RECEIPT - COUNTERSIGNED", ["Pickup  Mon 18 Nov  11:05", "Bags    4", "Signed  Store + Agent"]), 5),
    ("Q007", "High",
     "Deposited amount is lower than the day's cash sales on three days this month.",
     ("BANK SLIP vs SALES REPORT", ["Sales report   1,84,300", "Bank slip      1,79,800", "Difference      4,500"]),
     "Fixed it.",
     "blurry", 3),
]


def _make_picture(spec):
    """Save a picture into the evidence folder and return its {type, url, name} entry."""
    name = f"{uuid.uuid4().hex}.jpg"
    path = EVIDENCE_FOLDER / name
    if spec == "sample" or Image is None:
        shutil.copyfile(SAMPLE_PHOTO, path)
    elif spec == "blurry":
        img = Image.new("RGB", (800, 600), (150, 150, 146))
        draw = ImageDraw.Draw(img)
        draw.rectangle([120, 160, 680, 440], outline=(110, 110, 105), width=6)
        draw.text((330, 290), "IMG_0042", fill=(95, 95, 92))
        img.filter(ImageFilter.GaussianBlur(9)).save(path, "JPEG", quality=55)
    else:
        title, lines = spec
        img = Image.new("RGB", (800, 600), (246, 244, 236))
        draw = ImageDraw.Draw(img)
        draw.rectangle([30, 30, 770, 570], outline=(60, 60, 60), width=3)
        draw.text((60, 60), title, fill=(20, 20, 20))
        for n, line in enumerate(lines):
            draw.text((60, 140 + 60 * n), line, fill=(40, 40, 40))
        draw.text((60, 520), "Pacific Hub - demo evidence", fill=(120, 120, 120))
        img.save(path, "JPEG", quality=88)
    return {"type": "photo", "url": f"/api/evidence/{name}", "name": f"{name[:8]}.jpg"}


def _file_name(entry):
    return entry["url"].rsplit("/", 1)[-1]


def _remove_earlier_run(db):
    """Delete the issues this scenario made before, and their pictures."""
    old = [i for i in db.query(Issue).filter(Issue.audit_id == AUDIT_ID)
           if (i.meta or {}).get("scenario") == TAG]
    names = {_file_name(e) for i in old for e in (i.evidence or [])}
    for i in old:
        db.query(AuditLog).filter(AuditLog.entity_type == "issue", AuditLog.entity_id == i.id).delete()
        db.delete(i)
    return names


def main():
    init_db()
    db = SessionLocal()
    try:
        audit = db.get(Audit, AUDIT_ID)
        amit = db.query(User).filter_by(email=AUDITOR_LOGIN).first()
        pooja = db.query(User).filter_by(email=AUDITEE_LOGIN).first()
        if not (audit and amit and pooja) or audit.auditor_id != amit.id:
            print(f"Need {AUDIT_ID} assigned to {AUDITOR_LOGIN}, and the user {AUDITEE_LOGIN}. Nothing changed.")
            return 1

        stale_files = _remove_earlier_run(db)
        rows = (db.query(AuditResponse).join(Question, Question.id == AuditResponse.question_id)
                .filter(AuditResponse.audit_id == AUDIT_ID).order_by(Question.code).all())
        if len(rows) < 10:
            print(f"{AUDIT_ID} has only {len(rows)} questions; expected a full checklist. Nothing changed.")
            return 1
        by_code = {r.question.code: r for r in rows}
        stale_files |= {_file_name(e) for r in rows for e in (r.evidence or [])}

        now = dt.datetime.utcnow()
        for r in rows:  # everything answered Yes, except the three issues; wiped clean first
            r.answer, r.remarks, r.risk, r.evidence = "Yes", None, None, []
            r.review_status = r.review_note = r.review_category = r.review_reply = None
            r.reviewed_by_id = r.reviewed_at = None
            r.answered_at = now - dt.timedelta(hours=2)
        first = rows[0]
        first.answer, first.answered_at = None, None  # the one left for Amit

        audit.status, audit.submitted_at, audit.score = "Ongoing", None, None
        for n, (code, priority, note, auditor_pic, reply, auditee_pic, days) in enumerate(ISSUES):
            r = by_code[code]
            r.answer, r.remarks, r.risk = "No", note, priority
            r.evidence = [_make_picture(auditor_pic)]
            q = r.question
            started = now - dt.timedelta(days=2, hours=n)
            replied = now - dt.timedelta(days=1, hours=n)
            issue = Issue(
                audit_id=AUDIT_ID, store_id=audit.store_id, response_id=r.id,
                title=f"Not met: {q.text}", description=f"Answered No during audit {AUDIT_ID}. {note}",
                process=q.process, sub_process=q.sub_process, priority=priority, status="Resolved",
                assignee_id=pooja.id, raised_by_id=amit.id, due_date=(now + dt.timedelta(days=days)).date(),
                action_taken=reply, evidence=[_make_picture(auditee_pic)], created_at=started,
                meta={"scenario": TAG, "history": [
                    {"at": (started + dt.timedelta(hours=3)).isoformat(), "by": pooja.name,
                     "status": "In Progress", "reply": "Looking into this with the store team."},
                    {"at": replied.isoformat(), "by": pooja.name, "status": "Resolved", "reply": reply},
                ]})
            db.add(issue)
            db.flush()
            log_action(db, amit.id, "raise_issue", "issue", issue.id, {"audit": AUDIT_ID, "question": code})
            log_action(db, pooja.id, "update_issue_status", "issue", issue.id, {"status": "Resolved"})
        db.flush()

        # Remove the earlier pictures nothing points to any more.
        in_use = {_file_name(e) for i in db.query(Issue) for e in (i.evidence or [])}
        in_use |= {_file_name(e) for x in db.query(AuditResponse) for e in (x.evidence or [])}
        for name in stale_files - in_use:
            (EVIDENCE_FOLDER / name).unlink(missing_ok=True)
        db.commit()

        total = len(rows)
        answered = sum(1 for r in rows if r.answer)
        print(f"{AUDIT_ID} (Pacific Hub, {AUDITOR_LOGIN}): {answered} of {total} answered "
              f"({round(100 * answered / total)}%), first question ({first.question.code}) left blank.")
        print(f"{len(ISSUES)} issues assigned to {pooja.name}, replied and with evidence, waiting for the manager.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
