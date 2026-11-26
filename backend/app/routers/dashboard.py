from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from ..auth import require_roles
from ..db import get_db
from ..models import (
    ROLE_ADMIN, ROLE_AUDIT_MANAGER, Audit, AuditLog, AuditResponse, Issue, Store, StoreScore, User,
)

router = APIRouter(prefix="/api", tags=["dashboard"])

QUARTERS = ("q1", "q2", "q3", "q4")


def _ids(csv):
    return [x for x in (csv or "").split(",") if x.strip()]


def _mean(values):
    return round(sum(values) / len(values), 1) if values else None


@router.get("/dashboard")
def dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    audits = db.query(Audit).all()
    issues = db.query(Issue).all()
    stores = db.query(Store).all()
    scored = [a for a in audits if a.score is not None]

    by_region = {}
    for a in audits:
        key = a.store.region if a.store else "Unknown"
        by_region[key] = by_region.get(key, 0) + 1

    # Use StoreScore table (q4 as latest, fallback q3) for top/bottom ranking
    all_scores = db.query(StoreScore).all()
    store_by_id = {st.id: st for st in stores}
    store_scores = sorted(
        [{"store_id": store_by_id[sc.store_id].id,
          "store": store_by_id[sc.store_id].name,
          "city": store_by_id[sc.store_id].city,
          "score": sc.q4 or sc.q3 or sc.q2 or sc.q1 or 0}
         for sc in all_scores if sc.store_id in store_by_id
         and (sc.q4 or sc.q3 or sc.q2 or sc.q1)],
        key=lambda x: x["score"], reverse=True)

    return {
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
    }


class AuditDetailsRequest(BaseModel):
    audit_ids: list[str] = Field(default_factory=list, max_length=5000)


def _iso(value):
    return value.isoformat() if value else None


@router.post("/dashboard/audit-details")
def audit_details(
    body: AuditDetailsRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    """What the audit list does not carry, for the audits the dashboard shows:
    when each was started, approved and sent back (Execution), and how the
    answers went (Findings): Yes/No by process, High-criticality questions
    answered No, and the questions answered No most often."""
    ids = list(dict.fromkeys(body.audit_ids))
    if not ids:
        return {"timing": {}, "by_process": [], "critical_failures": [], "failed_questions": []}
    audits = {a.id: a for a in db.query(Audit).options(joinedload(Audit.store))
              .filter(Audit.id.in_(ids)).all()}

    timing = {aid: {"started_at": None, "approved_at": None, "returns": 0} for aid in audits}
    logs = (db.query(AuditLog)
            .filter(AuditLog.entity_type == "audit", AuditLog.entity_id.in_(list(audits)),
                    AuditLog.action.in_(("approve_audit", "return_audit", "request_changes")))
            .all())
    for log in logs:
        t = timing[log.entity_id]
        if log.action == "approve_audit":
            if t["approved_at"] is None or log.timestamp > t["approved_at"]:
                t["approved_at"] = log.timestamp
        else:
            t["returns"] += 1
    for aid, a in audits.items():
        # Approved before approvals were logged: the decision time is the best we have.
        if a.status == "Approved" and timing[aid]["approved_at"] is None:
            timing[aid]["approved_at"] = a.decision_at

    responses = (db.query(AuditResponse).options(joinedload(AuditResponse.question))
                 .filter(AuditResponse.audit_id.in_(list(audits))).all())
    by_process, failed, critical = {}, {}, []
    for r in responses:
        if not r.answer:
            continue
        t = timing[r.audit_id]
        if t["started_at"] is None or (r.answered_at and r.answered_at < t["started_at"]):
            t["started_at"] = r.answered_at
        a = audits[r.audit_id]
        if a.status not in ("Completed", "Approved"):
            continue  # findings come from submitted audits only
        q = r.question
        process = (q.process if q else None) or "General"
        row = by_process.setdefault(process, {"process": process, "yes": 0, "no": 0, "na": 0})
        key = {"Yes": "yes", "No": "no"}.get(r.answer, "na")
        row[key] += 1
        if not q:
            continue
        f = failed.setdefault(q.id, {"question_id": q.id, "code": q.code, "text": q.text,
                                    "process": process, "criticality": q.criticality or "Low",
                                    "no": 0, "answered": 0, "stores": set()})
        if r.answer in ("Yes", "No"):
            f["answered"] += 1
        if r.answer == "No":
            f["no"] += 1
            f["stores"].add(a.store_id)
            if (q.criticality or "Low") == "High":
                critical.append({
                    "audit_id": a.id, "store_id": a.store_id,
                    "store": a.store.name if a.store else None,
                    "question_code": q.code, "question": q.text, "process": process,
                    "remarks": r.remarks, "issue_raised": bool(r.issues),
                    "date": _iso(a.submitted_at or a.scheduled_at),
                })

    failed_rows = sorted(
        ({**f, "stores": len(f["stores"])} for f in failed.values() if f["no"]),
        key=lambda f: (-f["no"], -f["stores"], f["code"] or ""))
    critical.sort(key=lambda c: c["date"] or "", reverse=True)
    return {
        "timing": {aid: {k: (_iso(v) if k != "returns" else v) for k, v in t.items()}
                   for aid, t in timing.items()},
        "by_process": sorted(by_process.values(), key=lambda p: p["process"]),
        "critical_failures": critical,
        "failed_questions": failed_rows[:10],
    }


@router.get("/users")
def list_users(
    role: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    return [u.to_dict() for u in q.all()]
