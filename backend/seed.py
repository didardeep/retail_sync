"""
Seeds the database from the prototype's data so the app is usable before the
real client data arrives. Everything here is placeholder — when the business
team sends the master files, replace load_seed() with an Excel/CSV import and
leave the rest of the app untouched.

    python seed.py            # create + seed
    python seed.py --reset    # drop everything first
"""
import datetime as dt
import json
import random
import sys
from pathlib import Path

from app.auth import hash_password
from app.db import Base, SessionLocal, engine, init_db
from app.models import (
    ROLE_AUDIT_MANAGER, ROLE_AUDITOR, ROLE_STORE_MANAGER,
    Audit, AuditResponse, AuditorAvailability, Checklist, ChecklistItem,
    Issue, Question, Store, User,
)

SEED_FILE = Path(__file__).parent / "seed_data.json"
DEFAULT_PASSWORD = "password123"

STATUS_MAP = {"Completed": "Completed", "In Progress": "Ongoing",
              "Scheduled": "Planned", "Assigned": "Planned"}


def load_seed() -> dict:
    with open(SEED_FILE, encoding="utf-8") as fh:
        return json.load(fh)


def parse_dt(text: str):
    """The prototype stores dates as '23 Jun 2026, 06:04' — tolerate misses."""
    if not text:
        return None
    for fmt in ("%d %b %Y, %H:%M", "%d %b, %Y", "%d %b %Y"):
        try:
            return dt.datetime.strptime(text.strip(), fmt)
        except ValueError:
            continue
    return None


def seed():
    s = SessionLocal()
    data = load_seed()

    # ---- users -----------------------------------------------------------
    # Store managers come from the store records; auditors from the schedule.
    manager_names = sorted({st["manager"] for st in data["stores"] if st.get("manager")})
    auditor_names = sorted({sc["auditor"] for sc in data["schedules"] if sc.get("auditor")}
                           | {a["auditor"] for a in data["audits"] if a.get("auditor")})

    # Keyed by (role, name): the prototype uses the same person names for
    # auditors and store managers, but they are different accounts.
    users = {}

    def slug(name):
        return ".".join(part for part in name.lower().replace(".", " ").split() if part)

    def add_user(name, role, designation=None, region=None):
        if (role, name) in users:
            return users[(role, name)]
        prefix = {"AUDITOR": "aud", "STORE_MANAGER": "sm"}.get(role, "user")
        u = User(name=name, email=f"{prefix}.{slug(name)}@retail-chain.com", role=role,
                 password_hash=hash_password(DEFAULT_PASSWORD),
                 designation=designation, region=region)
        s.add(u)
        s.flush()
        users[(role, name)] = u
        return u

    admin = User(name="Audit Manager", email="am@retail-chain.com",
                 role=ROLE_AUDIT_MANAGER, designation="Audit Manager",
                 password_hash=hash_password(DEFAULT_PASSWORD))
    s.add(admin)
    s.flush()

    for n in auditor_names:
        add_user(n, ROLE_AUDITOR, "Field Auditor")
    for n in manager_names:
        add_user(n, ROLE_STORE_MANAGER, "Store Manager")

    # ---- stores ----------------------------------------------------------
    for st in data["stores"]:
        mgr = users.get((ROLE_STORE_MANAGER, st.get("manager")))
        s.add(Store(
            id=st["id"], name=st["name"], city=st.get("city"),
            region=st.get("region"), store_format=st.get("format"),
            store_type=st.get("type"), status=st.get("status", "Operating"),
            manager_id=mgr.id if mgr else None,
            contact=st.get("contact"), email=st.get("email"),
            address=st.get("address"),
            meta={k: st[k] for k in ("s22", "s23", "s24", "s25", "s26") if k in st},
        ))
    s.flush()

    # ---- question bank ---------------------------------------------------
    questions = {}
    for q in data["questions"]:
        obj = Question(
            code=q["id"], version=1, is_current=True, text=q["text"],
            process=q.get("proc"), sub_process=q.get("sp"),
            audit_type=q.get("at"), weight=q.get("w", 1),
            is_critical=bool(q.get("crit")), active=bool(q.get("on", True)),
            approval_status="APPROVED", approved_by_id=admin.id,
            meta={"tags": q.get("tags", [])},
        )
        s.add(obj)
        s.flush()
        questions[q["id"]] = obj

    # ---- checklists: one per process, plus a full checklist --------------
    checklists = {}
    for proc in data.get("processes", []):
        cl = Checklist(name=f"{proc} Checklist", version=1,
                       conditions={"process": [proc]})
        s.add(cl)
        s.flush()
        items = [q for q in questions.values() if q.process == proc]
        for i, q in enumerate(items):
            s.add(ChecklistItem(checklist_id=cl.id, question_id=q.id, sort_order=i))
        checklists[proc] = cl

    full = Checklist(name="Full Store Audit", version=1, conditions={})
    s.add(full)
    s.flush()
    for i, q in enumerate(questions.values()):
        s.add(ChecklistItem(checklist_id=full.id, question_id=q.id, sort_order=i))
    s.flush()

    # ---- audits ----------------------------------------------------------
    stores_by_name = {st["name"]: st["id"] for st in data["stores"]}
    audit_objs = {}
    for a in data["audits"]:
        auditor = users.get((ROLE_AUDITOR, a.get("auditor")))
        status = STATUS_MAP.get(a.get("status"), "Planned")
        audit = Audit(
            id=a["id"], store_id=stores_by_name.get(a.get("store")),
            checklist_id=full.id,
            auditor_id=auditor.id if auditor else None,
            created_by_id=admin.id,
            scheduled_at=parse_dt(a.get("sched")),
            status=status,
            score=a.get("score") if status in ("Completed", "Approved") else None,
            submitted_at=parse_dt(a.get("sched")) if status == "Completed" else None,
        )
        s.add(audit)
        s.flush()
        audit_objs[a["id"]] = audit

        # Give completed audits plausible answers so screens aren't empty.
        sample = list(questions.values())[:25]
        for q in sample:
            answer = None
            if status == "Completed":
                answer = random.choices(["Yes", "No", "Partial", "NA"],
                                        weights=[70, 10, 15, 5])[0]
            elif status == "Ongoing":
                answer = random.choice(["Yes", "Partial", None])
            s.add(AuditResponse(audit_id=audit.id, question_id=q.id, answer=answer))
    s.flush()

    # ---- scheduled audits that have no audit record yet ------------------
    for sc in data.get("schedules", []):
        auditor = users.get((ROLE_AUDITOR, sc.get("auditor")))
        if auditor and auditor.role == ROLE_AUDITOR and not auditor.designation:
            auditor.designation = sc.get("role")

    # ---- issues ----------------------------------------------------------
    for iss in data.get("issues", []):
        # The prototype labels issues with strings like "Mumbai #07"; the
        # reliable link is the audit they came from, so use that store.
        parent = audit_objs.get(iss.get("aid"))
        store = s.get(Store, parent.store_id) if parent and parent.store_id else None
        s.add(Issue(
            id=iss["id"], audit_id=iss.get("aid"),
            store_id=store.id if store else None,
            title=iss["title"], description=iss.get("desc"),
            process=iss.get("proc"), sub_process=iss.get("sp"),
            priority=iss.get("pri", "Medium"), status=iss.get("status", "Open"),
            assignee_id=store.manager_id if store else None,
            raised_by_id=admin.id,
            due_date=(parse_dt(iss.get("due")) or dt.datetime.now()).date(),
            meta={"tags": iss.get("tags", []), "store_label": iss.get("store")},
        ))

    # ---- a couple of availability blocks ---------------------------------
    auditors = [u for u in users.values() if u.role == ROLE_AUDITOR]
    if auditors:
        s.add(AuditorAvailability(
            auditor_id=auditors[0].id,
            from_date=dt.date.today() + dt.timedelta(days=3),
            to_date=dt.date.today() + dt.timedelta(days=6),
            reason="Planned leave",
        ))

    s.commit()

    print(f"Seeded: {len(data['stores'])} stores, {len(questions)} questions, "
          f"{len(checklists) + 1} checklists, {len(audit_objs)} audits, "
          f"{len(users) + 1} users")
    print(f"\nLogins (password: {DEFAULT_PASSWORD})")
    print("  Audit Manager : am@retail-chain.com")
    for role, label in ((ROLE_AUDITOR, "Auditor      "),
                        (ROLE_STORE_MANAGER, "Store Manager")):
        for u in users.values():
            if u.role == role:
                print(f"  {label} : {u.email}")
                break


if __name__ == "__main__":
    if "--reset" in sys.argv:
        Base.metadata.drop_all(bind=engine)
        print("Dropped all tables.")
    init_db()
    seed()
