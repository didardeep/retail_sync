"""Read-only data for the SOP tab of Dashboard & Analytics.

One call returns everything the tab needs (audits with per-section scores,
per-criterion scores, store coverage), and the browser does the filtering and
cross-filtering. The data set is small (stores x audits x ~25 criteria), and
this keeps every click on a chart instant. If it ever grows past a few
thousand audits, move the filters to query parameters here."""
import datetime as dt

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, selectinload

from ..auth import require_roles
from ..db import get_db
from ..models import ROLE_AUDIT_MANAGER, SopAudit, SopTemplate, Store, User
from ..services import SOP_FINAL_STATUSES, compute_sop_score

router = APIRouter(prefix="/api/sop-dashboard", tags=["sop-dashboard"])

# A store with no final audit for this many days is flagged as not covered.
COVERAGE_DAYS = 30


def _iso(value):
    return value.isoformat() + "Z" if value else None


@router.get("")
def sop_dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER)),
):
    now = dt.datetime.utcnow()
    templates = db.query(SopTemplate).filter_by(is_active=True).order_by(SopTemplate.name).all()
    stores = db.query(Store).order_by(Store.name).all()
    audits = (
        db.query(SopAudit)
        .options(selectinload(SopAudit.scores), selectinload(SopAudit.auditor))
        .filter(SopAudit.status.in_(SOP_FINAL_STATUSES))
        .order_by(SopAudit.store_id, SopAudit.template_id, SopAudit.submitted_at)
        .all()
    )

    criteria = {}
    tools = []
    for tpl in templates:
        sections = []
        for sec in tpl.sections:
            sections.append({"code": sec.code, "name": sec.name})
            for c in sec.criteria:
                criteria[c.id] = {
                    "id": c.id, "title": c.title, "marks": c.marks,
                    "template_id": tpl.id, "template_code": tpl.code,
                    "section_code": sec.code, "section_name": sec.name,
                }
        tools.append({
            "id": tpl.id, "code": tpl.code, "name": tpl.name,
            "total_marks": tpl.total_marks, "sections": sections,
        })

    audit_rows = []
    criterion_scores = []
    previous = {}          # (store, template) -> percent of the audit before this one
    last_audit_at = {}
    audit_count = {}
    for a in audits:
        summary = compute_sop_score(a)
        key = (a.store_id, a.template_id)
        audit_rows.append({
            "id": a.id,
            "store_id": a.store_id,
            "template_id": a.template_id,
            "template_code": a.template.code,
            "auditor": a.auditor.name if a.auditor else None,
            "submitted_at": _iso(a.submitted_at),
            "score": summary["score"],
            "max_score": summary["max_score"],
            "percent": summary["percent"],
            "prev_percent": previous.get(key),
            "sections": [
                {"code": s["code"], "name": s["name"],
                 "score": s["score"], "max_score": s["max_score"]}
                for s in summary["sections"]
            ],
        })
        previous[key] = summary["percent"]
        if a.submitted_at and (a.store_id not in last_audit_at
                               or a.submitted_at > last_audit_at[a.store_id]):
            last_audit_at[a.store_id] = a.submitted_at
        audit_count[a.store_id] = audit_count.get(a.store_id, 0) + 1
        for row in a.scores:
            crit = criteria.get(row.criterion_id)
            if crit is None or row.is_na or row.score is None:
                continue
            criterion_scores.append({
                "audit_id": a.id, "criterion_id": row.criterion_id,
                "score": row.score, "marks": crit["marks"],
            })

    store_rows = []
    for s in stores:
        last = last_audit_at.get(s.id)
        store_rows.append({
            "id": s.id, "name": s.name, "city": s.city, "region": s.region,
            "format": s.store_format,
            "last_audit_at": _iso(last),
            "days_since": (now - last).days if last else None,
            "audit_count": audit_count.get(s.id, 0),
        })

    return {
        "generated_at": _iso(now),
        "coverage_days": COVERAGE_DAYS,
        "tools": tools,
        "stores": store_rows,
        "audits": audit_rows,
        "criteria": list(criteria.values()),
        "criterion_scores": criterion_scores,
    }
