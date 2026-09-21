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
    Audit, AuditResponse, AuditorAvailability, CashReconciliation,
    CashDepositPickup, Checklist, ChecklistItem, DataImport,
    ExpiredInventory, Issue, Observation, Question, Store, StoreScore, User,
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
    manager_names = sorted({st["manager"] for st in data["stores"] if st.get("manager")})
    auditor_names = sorted({sc["auditor"] for sc in data["schedules"] if sc.get("auditor")}
                           | {a["auditor"] for a in data["audits"] if a.get("auditor")})

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
            store_code=st.get("store_code"),
            state=st.get("state"),
            district=st.get("district"),
            postal_code=st.get("postal_address"),
            deputy_manager=st.get("deputy_manager"),
            operations_manager=st.get("operations_manager"),
            store_category=st.get("store_category"),
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
            photo_video_enablement=q.get("photo_video", "No"),
            data_analyst_enabled=q.get("da_enabled", "N"),
            data_analyst_reference=q.get("da_ref"),
            annex=q.get("annex"),
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

    # ---- data imports (container for structured data) --------------------
    di_cash_recon = DataImport(
        file_name="Store_Audit_Cash_Reconciliation.xlsx",
        data_section="cash_reconciliation",
        column_headers=["Cash at Tills", "Cash in Safe", "Any other place",
                        "Physical Cash Total", "Cash Sales as per sales Report",
                        "Float and Imprest allocated to store as per Master",
                        "Book Cash Total", "Difference (A-B)", "Remarks"],
    )
    di_cash_deposit = DataImport(
        file_name="Store_Audit_Cash_Deposits.xlsx",
        data_section="cash_deposit_pickups",
        column_headers=["Sales Date", "Cash Sales", "Cash Deposited",
                        "Difference (B-C)", "CMS Pick Up date",
                        "Delay in cash handover (A-D)", "Remarks"],
    )
    di_expired = DataImport(
        file_name="Store_Audit_Expired_Inventory.xlsx",
        data_section="expired_inventory",
        column_headers=["Article Code", "Article Description", "Expiry Date",
                        "Review Date", "Quantity", "MRP"],
    )
    di_scores = DataImport(
        file_name="Store_Audit_Scores.xlsx",
        data_section="store_scores",
        column_headers=["Store code", "Status", "Q1", "Q2", "Q3", "Q4"],
    )
    for di in [di_cash_recon, di_cash_deposit, di_expired, di_scores]:
        s.add(di)
    s.flush()

    # ---- cash reconciliation (Sheet 1) -----------------------------------
    for idx, cr in enumerate(data.get("cash_reconciliation", []), 1):
        s.add(CashReconciliation(
            import_id=di_cash_recon.id,
            store_id=cr["store_id"],
            source_row_number=idx,
            cash_at_tills=cr["cash_at_tills"],
            cash_in_safe=cr["cash_in_safe"],
            cash_other_locations=cr["cash_other_locations"],
            physical_cash_total=cr["physical_cash_total"],
            cash_sales_as_per_report=cr["cash_sales_as_per_report"],
            float_or_imprest_amount=cr["float_or_imprest_amount"],
            book_cash_total=cr.get("book_cash_total"),
            difference=cr["difference"],
            remarks=cr.get("remarks", ""),
            raw_data=cr,
        ))

    # ---- cash deposit pickups (Sheet 2) ----------------------------------
    for idx, cd in enumerate(data.get("cash_deposit_pickups", []), 1):
        s.add(CashDepositPickup(
            import_id=di_cash_deposit.id,
            store_id=cd["store_id"],
            source_row_number=idx,
            sales_date=dt.date.fromisoformat(cd["sales_date"]),
            cash_sales=cd["cash_sales"],
            cash_deposited=cd["cash_deposited"],
            difference=cd["difference"],
            cms_pickup_date=dt.date.fromisoformat(cd["cms_pickup_date"]),
            handover_delay_days=cd["handover_delay_days"],
            remarks=cd.get("remarks", ""),
            raw_data=cd,
        ))

    # ---- expired inventory (Sheet 3) -------------------------------------
    for idx, ei in enumerate(data.get("expired_inventory", []), 1):
        s.add(ExpiredInventory(
            import_id=di_expired.id,
            store_id=ei["store_id"],
            source_row_number=idx,
            article_code=ei["article_code"],
            article_description=ei["article_description"],
            expiry_date=dt.date.fromisoformat(ei["expiry_date"]),
            review_date=dt.date.fromisoformat(ei["review_date"]),
            quantity=ei["quantity"],
            mrp=ei["mrp"],
            raw_data=ei,
        ))

    # ---- store scores ----------------------------------------------------
    for idx, ss in enumerate(data.get("store_scores", []), 1):
        s.add(StoreScore(
            import_id=di_scores.id,
            store_id=ss["store_id"],
            source_row_number=idx,
            store_code=ss["store_code"],
            status=ss["status"],
            q1=ss["q1"], q2=ss["q2"], q3=ss["q3"], q4=ss["q4"],
            raw_data=ss,
        ))
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
        sample = list(questions.values())
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

    # ---- observations ----------------------------------------------------
    for obs in data.get("observations", []):
        # Try to find matching audit for this store
        obs_audit = None
        for aid, aobj in audit_objs.items():
            if aobj.store_id == obs["store_id"]:
                obs_audit = aobj
                break
        s.add(Observation(
            audit_id=obs_audit.id if obs_audit else None,
            store_id=obs["store_id"],
            sr_no=obs["sr_no"],
            observation=obs["observation"],
            risk=obs["risk"],
            action_plan=obs["action_plan"],
            person_responsible=obs["person_responsible"],
            target=obs["target"],
            status=obs["status"],
        ))

    # ---- issues ----------------------------------------------------------
    for iss in data.get("issues", []):
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

    # ---- summary ---------------------------------------------------------
    cr_count = len(data.get("cash_reconciliation", []))
    cd_count = len(data.get("cash_deposit_pickups", []))
    ei_count = len(data.get("expired_inventory", []))
    ss_count = len(data.get("store_scores", []))
    ob_count = len(data.get("observations", []))

    print(f"Seeded: {len(data['stores'])} stores, {len(questions)} questions, "
          f"{len(checklists) + 1} checklists, {len(audit_objs)} audits, "
          f"{len(users) + 1} users")
    print(f"  Data: {cr_count} cash reconciliations, {cd_count} cash deposits, "
          f"{ei_count} expired inventory, {ss_count} store scores, {ob_count} observations")
    print(f"  Issues: {len(data.get('issues', []))}")
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

    if "--from-excel" in sys.argv:
        from import_master import seed_from_excel
        seed_from_excel()
    else:
        seed()
