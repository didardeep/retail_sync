"""
API routes. Grouped by module so it maps 1:1 onto the prototype screens.

Role rules in one place:
  AUDIT_MANAGER  — everything
  AUDITOR        — own assigned audits, answering questions, proposing questions
  STORE_MANAGER  — issues assigned to their store, action + evidence capture
"""
import datetime as dt

from flask import Blueprint, g, jsonify, request
from sqlalchemy import func

from .auth import login_required, make_token, roles_required, verify_password
from .db import SessionLocal
from .models import (
    ROLE_AUDIT_MANAGER, ROLE_AUDITOR, ROLE_STORE_MANAGER,
    Audit, AuditResponse, AuditorAvailability, Checklist, ChecklistItem,
    Issue, Question, Store, User,
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
