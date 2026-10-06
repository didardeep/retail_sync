"""Read-only data for the SOP tab of Dashboard & Analytics.

One call returns everything the tab needs (audits with per-section scores,
per-criterion scores, store coverage), and the browser does the filtering and
cross-filtering. The data set is small (stores x audits x ~25 criteria), and
this keeps every click on a chart instant. If it ever grows past a few
thousand audits, move the filters to query parameters here.

A tool can have several versions (docs/SOP_Audit_Decisions.md, D21). The
response shows one tool per code, and follows each question through the
versions by its stable key, so a re-published questionnaire does not split the
history of a question."""
import datetime as dt

from fastapi import APIRouter, Depends
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from ..auth import require_roles
from ..db import get_db
from ..models import ROLE_ADMIN, ROLE_AUDIT_MANAGER, SopAudit, SopTemplate, Store, User
from ..services import SOP_FINAL_STATUSES, compute_sop_score

router = APIRouter(prefix="/api/sop-dashboard", tags=["sop-dashboard"])

# A store with no final audit for this many days is flagged as not covered.
COVERAGE_DAYS = 30


def _iso(value):
    return value.isoformat() + "Z" if value else None


@router.get("")
def sop_dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    now = dt.datetime.utcnow()
    stores = db.query(Store).order_by(Store.name).all()
    audits = (
        db.query(SopAudit)
        .options(selectinload(SopAudit.scores), selectinload(SopAudit.auditor))
        .filter(SopAudit.status.in_(SOP_FINAL_STATUSES))
        .order_by(SopAudit.store_id, SopAudit.submitted_at)
        .all()
    )
    # Current versions, plus any older version a finished audit was scored on.
    # Versions load oldest first so a question's newest wording and section win.
    used_ids = {a.template_id for a in audits}
    templates = (
        db.query(SopTemplate)
        .filter(SopTemplate.is_active.is_(True),
                or_(SopTemplate.is_current.is_(True), SopTemplate.id.in_(used_ids)))
        .order_by(SopTemplate.code, SopTemplate.version)
        .all()
    )

    criteria = {}          # stable key -> the newest version of that question
    scoring = {}           # criterion id -> (stable key, marks in its own version)
    tool_by_code = {}
    for tpl in templates:
        tool = tool_by_code.setdefault(tpl.code, {"sections": {}})
        if tpl.is_current or "id" not in tool:
            tool.update(id=tpl.id, code=tpl.code, name=tpl.name,
                        total_marks=tpl.total_marks)
        for sec in tpl.sections:
            tool["sections"][sec.code] = sec.name
            for c in sec.criteria:
                scoring[c.id] = (c.stable_key, c.marks)
                criteria[c.stable_key] = {
                    "id": c.id, "key": c.stable_key, "title": c.title,
                    "marks": c.marks, "template_id": tpl.id,
                    "template_code": tpl.code, "section_code": sec.code,
                    "section_name": sec.name,
                }
    tools = [
        {"id": t["id"], "code": t["code"], "name": t["name"],
         "total_marks": t["total_marks"],
         "sections": [{"code": code, "name": name}
                      for code, name in sorted(t["sections"].items())]}
        for t in sorted(tool_by_code.values(), key=lambda t: t["name"])
    ]

    audit_rows = []
    criterion_scores = []
    previous = {}          # (store, tool code) -> percent of the audit before this one
    last_audit_at = {}
    audit_count = {}
    for a in audits:
        summary = compute_sop_score(a)
        key = (a.store_id, a.template.code)
        audit_rows.append({
            "id": a.id,
            "store_id": a.store_id,
            "template_id": a.template_id,
            "template_code": a.template.code,
            "template_version": a.template.version,
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
            known = scoring.get(row.criterion_id)
            if known is None or row.is_na or row.score is None:
                continue
            criterion_scores.append({
                "audit_id": a.id, "criterion_id": row.criterion_id,
                "criterion_key": known[0], "score": row.score, "marks": known[1],
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
