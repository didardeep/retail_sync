"""
API routes. Grouped by module so it maps 1:1 onto the prototype screens.

Role rules in one place:
  AUDIT_MANAGER  — everything
  AUDITOR        — own assigned audits, answering questions, proposing questions
  STORE_MANAGER  — issues assigned to their store, action + evidence capture
"""
import datetime as dt
import os
from pathlib import Path

from flask import Blueprint, g, jsonify, request
from sqlalchemy import func

from .auth import login_required, make_token, roles_required, verify_password
from .db import SessionLocal
from .models import (
    ROLE_AUDIT_MANAGER, ROLE_AUDITOR, ROLE_STORE_MANAGER,
    Audit, AuditResponse, AuditorAvailability, CashReconciliation,
    CashDepositPickup, Checklist, ChecklistItem, DataImport,
    ExpiredInventory, Issue, Observation, Question, Store, StoreScore, User,
)
from .services import (
    compute_audit_score, next_audit_id, raise_issue_from_response,
)

bp = Blueprint("api", __name__, url_prefix="/api")


def db():
    return SessionLocal()


# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------
@bp.post("/auth/login")
def login():
    data = request.get_json(force=True)
    user = db().query(User).filter_by(email=data.get("email", "").lower()).first()
    if not user or not verify_password(user, data.get("password", "")):
        return jsonify({"error": "invalid credentials"}), 401
    return jsonify({"token": make_token(user), "user": user.to_dict()})


@bp.get("/auth/me")
@login_required
def me():
    return jsonify(g.user.to_dict())


# --------------------------------------------------------------------------
# Stores
# --------------------------------------------------------------------------
@bp.get("/stores")
@login_required
def list_stores():
    q = db().query(Store)
    if g.user.role == ROLE_STORE_MANAGER:
        q = q.filter(Store.manager_id == g.user.id)
    if request.args.get("status"):
        q = q.filter(Store.status == request.args["status"])
    return jsonify([s.to_dict() for s in q.all()])


@bp.post("/stores")
@roles_required(ROLE_AUDIT_MANAGER)
def create_store():
    d = request.get_json(force=True)
    s = Store(
        id=d["id"], name=d["name"], city=d.get("city"), region=d.get("region"),
        store_format=d.get("format"), store_type=d.get("type"),
        status=d.get("status", "Operating"), manager_id=d.get("manager_id"),
        contact=d.get("contact"), email=d.get("email"),
        address=d.get("address"), meta=d.get("meta", {}),
    )
    db().add(s)
    db().commit()
    return jsonify(s.to_dict()), 201


@bp.put("/stores/<sid>")
@roles_required(ROLE_AUDIT_MANAGER)
def update_store(sid):
    s = db().get(Store, sid)
    if not s:
        return jsonify({"error": "not found"}), 404
    d = request.get_json(force=True)
    for field, attr in [("name", "name"), ("city", "city"), ("region", "region"),
                        ("format", "store_format"), ("type", "store_type"),
                        ("status", "status"), ("manager_id", "manager_id"),
                        ("contact", "contact"), ("email", "email"),
                        ("address", "address")]:
        if field in d:
            setattr(s, attr, d[field])
    db().commit()
    return jsonify(s.to_dict())


# --------------------------------------------------------------------------
# Questions — the auditor can propose, only the AM approves
# --------------------------------------------------------------------------
@bp.get("/questions")
@login_required
def list_questions():
    q = db().query(Question).filter(Question.is_current.is_(True))
    if request.args.get("process"):
        q = q.filter(Question.process == request.args["process"])
    if request.args.get("status"):
        q = q.filter(Question.approval_status == request.args["status"])
    elif g.user.role == ROLE_AUDITOR:
        q = q.filter(Question.approval_status == "APPROVED")
    return jsonify([x.to_dict() for x in q.order_by(Question.code).all()])


@bp.post("/questions")
@roles_required(ROLE_AUDIT_MANAGER, ROLE_AUDITOR)
def create_question():
    """AM creates approved questions directly; an auditor's goes to PENDING."""
    d = request.get_json(force=True)
    is_am = g.user.role == ROLE_AUDIT_MANAGER
    last = db().query(func.max(Question.code)).scalar() or "Q000"
    code = d.get("code") or f"Q{int(last[1:]) + 1:03d}"
    q = Question(
        code=code, text=d["text"], process=d.get("process"),
        sub_process=d.get("sub_process"), audit_type=d.get("audit_type"),
        weight=d.get("weight", 1), is_critical=d.get("is_critical", False),
        approval_status="APPROVED" if is_am else "PENDING",
        proposed_by_id=g.user.id,
        approved_by_id=g.user.id if is_am else None,
        meta=d.get("meta", {}),
    )
    db().add(q)
    db().commit()
    return jsonify(q.to_dict()), 201


@bp.post("/questions/<qid>/approve")
@roles_required(ROLE_AUDIT_MANAGER)
def approve_question(qid):
    q = db().get(Question, qid)
    if not q:
        return jsonify({"error": "not found"}), 404
    q.approval_status = request.get_json(force=True).get("decision", "APPROVED")
    q.approved_by_id = g.user.id
    db().commit()
    return jsonify(q.to_dict())


@bp.put("/questions/<qid>")
@roles_required(ROLE_AUDIT_MANAGER)
def edit_question(qid):
    """Edits create a new version so completed audits keep their wording."""
    old = db().get(Question, qid)
    if not old:
        return jsonify({"error": "not found"}), 404
    d = request.get_json(force=True)
    old.is_current = False
    new = Question(
        code=old.code, version=old.version + 1, is_current=True,
        text=d.get("text", old.text), process=d.get("process", old.process),
        sub_process=d.get("sub_process", old.sub_process),
        audit_type=d.get("audit_type", old.audit_type),
        weight=d.get("weight", old.weight),
        is_critical=d.get("is_critical", old.is_critical),
        active=d.get("active", old.active),
        approval_status="APPROVED", approved_by_id=g.user.id,
        meta=d.get("meta", old.meta),
    )
    db().add(new)
    db().commit()
    return jsonify(new.to_dict())


# --------------------------------------------------------------------------
# Checklists
# --------------------------------------------------------------------------
@bp.get("/checklists")
@login_required
def list_checklists():
    rows = db().query(Checklist).order_by(Checklist.name, Checklist.version).all()
    return jsonify([c.to_dict() for c in rows])


@bp.get("/checklists/<cid>")
@login_required
def get_checklist(cid):
    c = db().get(Checklist, cid)
    return jsonify(c.to_dict(with_items=True)) if c else (jsonify({"error": "not found"}), 404)


@bp.post("/checklists")
@roles_required(ROLE_AUDIT_MANAGER)
def create_checklist():
    d = request.get_json(force=True)
    existing = db().query(func.max(Checklist.version)).filter(
        Checklist.name == d["name"]).scalar()
    c = Checklist(
        name=d["name"], version=(existing or 0) + 1,
        conditions=d.get("conditions", {}),
    )
    db().add(c)
    db().flush()
    for i, qid in enumerate(d.get("question_ids", [])):
        db().add(ChecklistItem(checklist_id=c.id, question_id=qid, sort_order=i))
    db().commit()
    return jsonify(c.to_dict()), 201


# --------------------------------------------------------------------------
# Scheduling and audits
# --------------------------------------------------------------------------
@bp.get("/audits")
@login_required
def list_audits():
    q = db().query(Audit)
    if g.user.role == ROLE_AUDITOR:
        q = q.filter(Audit.auditor_id == g.user.id)
    elif g.user.role == ROLE_STORE_MANAGER:
        store_ids = [s.id for s in db().query(Store).filter_by(manager_id=g.user.id)]
        q = q.filter(Audit.store_id.in_(store_ids))
    if request.args.get("status"):
        q = q.filter(Audit.status == request.args["status"])
    return jsonify([a.to_dict() for a in q.order_by(Audit.scheduled_at.desc()).all()])


@bp.get("/audits/<aid>")
@login_required
def get_audit(aid):
    a = db().get(Audit, aid)
    if not a:
        return jsonify({"error": "not found"}), 404
    if g.user.role == ROLE_AUDITOR and a.auditor_id != g.user.id:
        return jsonify({"error": "forbidden"}), 403
    return jsonify(a.to_dict(with_responses=True))


@bp.post("/audits")
@roles_required(ROLE_AUDIT_MANAGER)
def schedule_audit():
    """Scheduling checks auditor availability before assigning."""
    d = request.get_json(force=True)
    when = dt.datetime.fromisoformat(d["scheduled_at"])
    auditor_id = d.get("auditor_id")

    if auditor_id:
        blocked = db().query(AuditorAvailability).filter(
            AuditorAvailability.auditor_id == auditor_id,
            AuditorAvailability.from_date <= when.date(),
            AuditorAvailability.to_date >= when.date(),
        ).first()
        if blocked:
            return jsonify({"error": "auditor unavailable",
                            "reason": blocked.reason}), 409
        clash = db().query(Audit).filter(
            Audit.auditor_id == auditor_id,
            func.date(Audit.scheduled_at) == when.date(),
            Audit.status.in_(["Planned", "Ongoing"]),
        ).first()
        if clash:
            return jsonify({"error": "auditor already booked",
                            "audit_id": clash.id}), 409

    audit = Audit(
        id=next_audit_id(db()), store_id=d["store_id"],
        checklist_id=d.get("checklist_id"), auditor_id=auditor_id,
        created_by_id=g.user.id, scheduled_at=when,
        audit_type=d.get("audit_type", "Checklist based Audit"),
        status="Planned", notes=d.get("notes"),
    )
    db().add(audit)
    db().flush()

    # Materialise the checklist so the auditor sees a fixed question set.
    if audit.checklist_id:
        items = db().query(ChecklistItem).filter_by(
            checklist_id=audit.checklist_id).order_by(ChecklistItem.sort_order).all()
        for it in items:
            db().add(AuditResponse(audit_id=audit.id, question_id=it.question_id))
    db().commit()
    return jsonify(audit.to_dict()), 201


@bp.put("/audits/<aid>/responses/<rid>")
@roles_required(ROLE_AUDITOR, ROLE_AUDIT_MANAGER)
def answer_question(aid, rid):
    """The auditor's core action — answer, remark, attach evidence, set risk."""
    audit = db().get(Audit, aid)
    resp = db().get(AuditResponse, rid)
    if not audit or not resp or resp.audit_id != aid:
        return jsonify({"error": "not found"}), 404
    if g.user.role == ROLE_AUDITOR and audit.auditor_id != g.user.id:
        return jsonify({"error": "forbidden"}), 403
    if audit.status in ("Completed", "Approved"):
        return jsonify({"error": "audit already submitted"}), 409

    d = request.get_json(force=True)
    for field in ("answer", "remarks", "risk"):
        if field in d:
            setattr(resp, field, d[field])
    if "evidence" in d:
        resp.evidence = d["evidence"]
    resp.answered_at = dt.datetime.utcnow()

    if audit.status == "Planned":
        audit.status = "Ongoing"
    db().commit()
    return jsonify(resp.to_dict())


@bp.post("/audits/<aid>/submit")
@roles_required(ROLE_AUDITOR)
def submit_audit(aid):
    audit = db().get(Audit, aid)
    if not audit or audit.auditor_id != g.user.id:
        return jsonify({"error": "not found"}), 404
    unanswered = [r for r in audit.responses if not r.answer]
    if unanswered:
        return jsonify({"error": "unanswered questions",
                        "count": len(unanswered)}), 400

    audit.score = compute_audit_score(audit)
    audit.status = "Completed"
    audit.submitted_at = dt.datetime.utcnow()

    # Every failed critical question becomes an action for the store manager.
    created = [raise_issue_from_response(db(), audit, r)
               for r in audit.responses if r.answer == "No" and r.question.is_critical]
    db().commit()
    return jsonify({"audit": audit.to_dict(), "issues_raised": len([c for c in created if c])})


@bp.post("/audits/<aid>/approve")
@roles_required(ROLE_AUDIT_MANAGER)
def approve_audit(aid):
    audit = db().get(Audit, aid)
    if not audit or audit.status != "Completed":
        return jsonify({"error": "audit not ready for approval"}), 400
    d = request.get_json(silent=True) or {}
    if "score" in d:
        audit.score = d["score"]        # AM can override the computed score
    audit.status = "Approved"
    audit.approved_by_id = g.user.id
    db().commit()
    return jsonify(audit.to_dict())


@bp.post("/audits/<aid>/rating")
@roles_required(ROLE_STORE_MANAGER)
def store_manager_rating(aid):
    audit = db().get(Audit, aid)
    if not audit:
        return jsonify({"error": "not found"}), 404
    if not audit.store or audit.store.manager_id != g.user.id:
        return jsonify({"error": "forbidden"}), 403
    d = request.get_json(force=True)
    audit.sm_rating = d.get("rating")
    audit.sm_comment = d.get("comment")
    db().commit()
    return jsonify(audit.to_dict())


# --------------------------------------------------------------------------
# Availability
# --------------------------------------------------------------------------
@bp.get("/availability")
@login_required
def list_availability():
    q = db().query(AuditorAvailability)
    if g.user.role == ROLE_AUDITOR:
        q = q.filter(AuditorAvailability.auditor_id == g.user.id)
    return jsonify([a.to_dict() for a in q.all()])


@bp.post("/availability")
@roles_required(ROLE_AUDIT_MANAGER, ROLE_AUDITOR)
def add_availability():
    d = request.get_json(force=True)
    auditor_id = d.get("auditor_id") if g.user.role == ROLE_AUDIT_MANAGER else g.user.id
    a = AuditorAvailability(
        auditor_id=auditor_id,
        from_date=dt.date.fromisoformat(d["from_date"]),
        to_date=dt.date.fromisoformat(d["to_date"]),
        reason=d.get("reason"),
    )
    db().add(a)
    db().commit()
    return jsonify(a.to_dict()), 201


# --------------------------------------------------------------------------
# Issues / action tracking
# --------------------------------------------------------------------------
@bp.get("/issues")
@login_required
def list_issues():
    q = db().query(Issue)
    if g.user.role == ROLE_STORE_MANAGER:
        q = q.filter(Issue.assignee_id == g.user.id)
    if request.args.get("status"):
        q = q.filter(Issue.status == request.args["status"])
    if request.args.get("store_id"):
        q = q.filter(Issue.store_id == request.args["store_id"])
    return jsonify([i.to_dict() for i in q.order_by(Issue.created_at.desc()).all()])


@bp.post("/issues")
@roles_required(ROLE_AUDIT_MANAGER, ROLE_AUDITOR)
def create_issue():
    d = request.get_json(force=True)
    i = Issue(
        audit_id=d.get("audit_id"), store_id=d.get("store_id"),
        title=d["title"], description=d.get("description"),
        process=d.get("process"), sub_process=d.get("sub_process"),
        priority=d.get("priority", "Medium"),
        assignee_id=d.get("assignee_id"), raised_by_id=g.user.id,
        due_date=dt.date.fromisoformat(d["due_date"]) if d.get("due_date") else None,
    )
    db().add(i)
    db().commit()
    return jsonify(i.to_dict()), 201


@bp.put("/issues/<iid>")
@login_required
def update_issue(iid):
    i = db().get(Issue, iid)
    if not i:
        return jsonify({"error": "not found"}), 404
    d = request.get_json(force=True)

    if g.user.role == ROLE_STORE_MANAGER:
        # A store manager can only record what they did, not re-prioritise.
        if i.assignee_id != g.user.id:
            return jsonify({"error": "forbidden"}), 403
        allowed = {"status", "action_taken", "evidence"}
        d = {k: v for k, v in d.items() if k in allowed}

    for field in ("title", "description", "priority", "status",
                  "assignee_id", "action_taken"):
        if field in d:
            setattr(i, field, d[field])
    if "evidence" in d:
        i.evidence = d["evidence"]
    if "due_date" in d and d["due_date"]:
        i.due_date = dt.date.fromisoformat(d["due_date"])
    if i.status == "Closed" and not i.closed_at:
        i.closed_at = dt.datetime.utcnow()
    db().commit()
    return jsonify(i.to_dict())


# --------------------------------------------------------------------------
# Observations
# --------------------------------------------------------------------------
@bp.get("/observations")
@login_required
def list_observations():
    q = db().query(Observation)
    if request.args.get("store_id"):
        q = q.filter(Observation.store_id == request.args["store_id"])
    if request.args.get("audit_id"):
        q = q.filter(Observation.audit_id == request.args["audit_id"])
    if request.args.get("risk"):
        q = q.filter(Observation.risk == request.args["risk"])
    if request.args.get("status"):
        q = q.filter(Observation.status == request.args["status"])
    return jsonify([o.to_dict() for o in q.order_by(Observation.sr_no).all()])


@bp.post("/observations")
@roles_required(ROLE_AUDIT_MANAGER, ROLE_AUDITOR)
def create_observation():
    d = request.get_json(force=True)
    last_sr = db().query(func.max(Observation.sr_no)).filter(
        Observation.audit_id == d.get("audit_id")).scalar() or 0
    o = Observation(
        audit_id=d.get("audit_id"), store_id=d.get("store_id"),
        sr_no=d.get("sr_no", last_sr + 1),
        observation=d["observation"], risk=d.get("risk", "Medium"),
        action_plan=d.get("action_plan"),
        person_responsible=d.get("person_responsible"),
        target=d.get("target"), status=d.get("status", "Open"),
    )
    db().add(o)
    db().commit()
    return jsonify(o.to_dict()), 201


@bp.put("/observations/<oid>")
@login_required
def update_observation(oid):
    o = db().get(Observation, oid)
    if not o:
        return jsonify({"error": "not found"}), 404
    d = request.get_json(force=True)
    for field in ("observation", "risk", "action_plan", "person_responsible",
                  "target", "status"):
        if field in d:
            setattr(o, field, d[field])
    db().commit()
    return jsonify(o.to_dict())


# --------------------------------------------------------------------------
# Data Imports & Structured Data
# --------------------------------------------------------------------------
@bp.get("/data-imports")
@roles_required(ROLE_AUDIT_MANAGER)
def list_data_imports():
    rows = db().query(DataImport).order_by(DataImport.imported_at.desc()).all()
    return jsonify([{
        "id": di.id, "file_name": di.file_name,
        "data_section": di.data_section,
        "column_headers": di.column_headers,
        "imported_at": di.imported_at.isoformat() if di.imported_at else None,
    } for di in rows])


@bp.get("/cash-reconciliations")
@login_required
def list_cash_reconciliations():
    q = db().query(CashReconciliation)
    if request.args.get("store_id"):
        q = q.filter(CashReconciliation.store_id == request.args["store_id"])
    return jsonify([{
        "id": cr.id, "store_id": cr.store_id,
        "cash_at_tills": cr.cash_at_tills,
        "cash_in_safe": cr.cash_in_safe,
        "cash_other_locations": cr.cash_other_locations,
        "physical_cash_total": cr.physical_cash_total,
        "cash_sales_as_per_report": cr.cash_sales_as_per_report,
        "float_or_imprest_amount": cr.float_or_imprest_amount,
        "difference": cr.difference,
        "remarks": cr.remarks,
    } for cr in q.all()])


@bp.get("/cash-deposit-pickups")
@login_required
def list_cash_deposit_pickups():
    q = db().query(CashDepositPickup)
    if request.args.get("store_id"):
        q = q.filter(CashDepositPickup.store_id == request.args["store_id"])
    return jsonify([{
        "id": cd.id, "store_id": cd.store_id,
        "sales_date": cd.sales_date.isoformat() if cd.sales_date else None,
        "cash_sales": cd.cash_sales,
        "cash_deposited": cd.cash_deposited,
        "difference": cd.difference,
        "cms_pickup_date": cd.cms_pickup_date.isoformat() if cd.cms_pickup_date else None,
        "handover_delay_days": cd.handover_delay_days,
        "remarks": cd.remarks,
    } for cd in q.order_by(CashDepositPickup.sales_date).all()])


@bp.get("/expired-inventory")
@login_required
def list_expired_inventory():
    q = db().query(ExpiredInventory)
    if request.args.get("store_id"):
        q = q.filter(ExpiredInventory.store_id == request.args["store_id"])
    return jsonify([{
        "id": ei.id, "store_id": ei.store_id,
        "article_code": ei.article_code,
        "article_description": ei.article_description,
        "expiry_date": ei.expiry_date.isoformat() if ei.expiry_date else None,
        "review_date": ei.review_date.isoformat() if ei.review_date else None,
        "quantity": ei.quantity, "mrp": ei.mrp,
    } for ei in q.order_by(ExpiredInventory.expiry_date).all()])


@bp.get("/store-scores")
@login_required
def list_store_scores():
    q = db().query(StoreScore)
    if request.args.get("store_id"):
        q = q.filter(StoreScore.store_id == request.args["store_id"])
    return jsonify([{
        "id": ss.id, "store_id": ss.store_id,
        "store_code": ss.store_code, "status": ss.status,
        "q1": ss.q1, "q2": ss.q2, "q3": ss.q3, "q4": ss.q4,
    } for ss in q.all()])


# --------------------------------------------------------------------------
# Dashboard
# --------------------------------------------------------------------------
@bp.get("/dashboard")
@roles_required(ROLE_AUDIT_MANAGER)
def dashboard():
    s = db()
    audits = s.query(Audit).all()
    issues = s.query(Issue).all()
    stores = s.query(Store).all()
    scored = [a for a in audits if a.score is not None]

    by_region = {}
    for a in audits:
        key = a.store.region if a.store else "Unknown"
        by_region[key] = by_region.get(key, 0) + 1

    store_scores = sorted(
        [{"store": st.name, "city": st.city,
          "score": (st.meta or {}).get("s26") or (st.meta or {}).get("s25")}
         for st in stores if (st.meta or {}).get("s26") or (st.meta or {}).get("s25")],
        key=lambda x: x["score"], reverse=True)

    return jsonify({
        "planned": sum(1 for a in audits if a.status == "Planned"),
        "ongoing": sum(1 for a in audits if a.status == "Ongoing"),
        "completed": sum(1 for a in audits if a.status in ("Completed", "Approved")),
        "avg_score": round(sum(a.score for a in scored) / len(scored), 1) if scored else None,
        "total_issues": len(issues),
        "open_issues": sum(1 for i in issues if i.status != "Closed"),
        "overdue_issues": sum(1 for i in issues if i.is_overdue),
        "by_region": by_region,
        "top_stores": store_scores[:5],
        "bottom_stores": store_scores[-5:][::-1],
    })


@bp.get("/users")
@roles_required(ROLE_AUDIT_MANAGER)
def list_users():
    q = db().query(User)
    if request.args.get("role"):
        q = q.filter(User.role == request.args["role"])
    return jsonify([u.to_dict() for u in q.all()])


# --------------------------------------------------------------------------
# File Upload & Import
# --------------------------------------------------------------------------
UPLOAD_FOLDER = Path(__file__).parent.parent / "uploads"
UPLOAD_FOLDER.mkdir(exist_ok=True)

SECTION_MAP = {
    "cash_reconciliation": "cash_reconciliation",
    "cash_deposit_pickups": "cash_deposit_pickups",
    "expired_inventory": "expired_inventory",
    "store_scores": "store_scores",
}


@bp.post("/upload")
@roles_required(ROLE_AUDIT_MANAGER)
def upload_file():
    """Upload an Excel file and import its data into the corresponding table."""
    if "file" not in request.files:
        return jsonify({"error": "no file provided"}), 400

    f = request.files["file"]
    section = request.form.get("section", "").strip()
    if section not in SECTION_MAP:
        return jsonify({"error": f"invalid section, must be one of: {list(SECTION_MAP.keys())}"}), 400

    if not f.filename.endswith((".xlsx", ".xls")):
        return jsonify({"error": "only Excel files (.xlsx) are accepted"}), 400

    # Save file
    filepath = UPLOAD_FOLDER / f.filename
    f.save(str(filepath))

    # Import into DB
    try:
        from openpyxl import load_workbook
        wb = load_workbook(str(filepath), read_only=True, data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        wb.close()

        if not rows:
            return jsonify({"error": "empty file"}), 400

        headers = [str(h).strip() if h else f"col_{i}" for i, h in enumerate(rows[0])]
        data_rows = []
        for row in rows[1:]:
            d = {}
            for i, val in enumerate(row):
                if i < len(headers):
                    d[headers[i]] = val
            data_rows.append(d)

        s = db()
        di = DataImport(
            file_name=f.filename,
            data_section=section,
            column_headers=headers,
        )
        s.add(di)
        s.flush()

        count = _import_rows(s, di, section, data_rows)
        s.commit()

        return jsonify({
            "message": f"Imported {count} records from {f.filename}",
            "import_id": di.id,
            "records": count,
        }), 201

    except Exception as e:
        db().rollback()
        return jsonify({"error": str(e)}), 500


def _parse_date_val(val):
    if val is None:
        return None
    if isinstance(val, dt.date):
        return val
    if isinstance(val, dt.datetime):
        return val.date()
    try:
        return dt.date.fromisoformat(str(val).strip())
    except (ValueError, TypeError):
        return None


def _float_val(val):
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _import_rows(session, di, section, data_rows):
    count = 0
    for idx, row in enumerate(data_rows, 1):
        if section == "cash_reconciliation":
            session.add(CashReconciliation(
                import_id=di.id,
                store_id=str(row.get("Store ID", "")).strip(),
                source_row_number=idx,
                cash_at_tills=_float_val(row.get("Cash at Tills")),
                cash_in_safe=_float_val(row.get("Cash in Safe")),
                cash_other_locations=_float_val(row.get("Cash Other Locations")),
                physical_cash_total=_float_val(row.get("Physical Cash Total")),
                cash_sales_as_per_report=_float_val(row.get("Cash Sales as per Report")),
                float_or_imprest_amount=_float_val(row.get("Float or Imprest Amount")),
                difference=_float_val(row.get("Difference")),
                remarks=str(row.get("Remarks", "") or ""),
            ))
        elif section == "cash_deposit_pickups":
            session.add(CashDepositPickup(
                import_id=di.id,
                store_id=str(row.get("Store ID", "")).strip(),
                source_row_number=idx,
                sales_date=_parse_date_val(row.get("Sales Date")),
                cash_sales=_float_val(row.get("Cash Sales")),
                cash_deposited=_float_val(row.get("Cash Deposited")),
                difference=_float_val(row.get("Difference")),
                cms_pickup_date=_parse_date_val(row.get("CMS Pickup Date")),
                handover_delay_days=int(row.get("Handover Delay Days") or 0),
                remarks=str(row.get("Remarks", "") or ""),
            ))
        elif section == "expired_inventory":
            session.add(ExpiredInventory(
                import_id=di.id,
                store_id=str(row.get("Store ID", "")).strip(),
                source_row_number=idx,
                article_code=str(row.get("Article Code", "") or ""),
                article_description=str(row.get("Article Description", "") or ""),
                expiry_date=_parse_date_val(row.get("Expiry Date")),
                review_date=_parse_date_val(row.get("Review Date")),
                quantity=_float_val(row.get("Quantity")),
                mrp=_float_val(row.get("MRP")),
            ))
        elif section == "store_scores":
            session.add(StoreScore(
                import_id=di.id,
                store_id=str(row.get("Store ID", "")).strip(),
                source_row_number=idx,
                store_code=str(row.get("Store Code", "") or ""),
                status=str(row.get("Status", "") or ""),
                q1=_float_val(row.get("Q1")),
                q2=_float_val(row.get("Q2")),
                q3=_float_val(row.get("Q3")),
                q4=_float_val(row.get("Q4")),
            ))
        count += 1
    return count
