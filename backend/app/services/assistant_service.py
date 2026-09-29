"""
Retail Sync Assistant — tool-calling AI chatbot backed by Gemini.
The LLM never writes SQL; it only calls fixed Python tool functions.
All tools enforce row-level scoping per role.
"""
import datetime as dt
import json
import os
import re
import time
import uuid
from typing import Any, Optional

from pydantic import BaseModel, Field, create_model
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..models import (
    ROLE_AUDIT_MANAGER, ROLE_AUDITOR, ROLE_STORE_MANAGER,
    Audit, AuditLog, AuditResponse, AuditorAvailability, ChatTurn,
    CashDepositPickup, CashReconciliation, Checklist,
    DataImport, ExpiredInventory, Issue, Observation, Question, Store,
    StoreScore, User,
)
from ..schemas import CardsSpec, ChartSpec, DetailsSpec, TableSpec

MAX_TOOL_ITERATIONS = 8
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))


# ---------------------------------------------------------------------------
# Row-level scoping helpers
# ---------------------------------------------------------------------------
def _sm_store_ids(db: Session, user) -> list:
    return [r[0] for r in db.query(Store.id).filter(Store.manager_id == user.id).all()]


def _scope_audits_q(q, db: Session, user):
    if user.role == ROLE_AUDITOR:
        q = q.filter(Audit.auditor_id == user.id)
    elif user.role == ROLE_STORE_MANAGER:
        q = q.filter(Audit.store_id.in_(_sm_store_ids(db, user)))
    return q


def _scope_issues_q(q, db: Session, user):
    if user.role == ROLE_STORE_MANAGER:
        q = q.filter(Issue.store_id.in_(_sm_store_ids(db, user)))
    elif user.role == ROLE_AUDITOR:
        return None  # Auditors have no access to issues
    return q


def _am_only(user) -> dict | None:
    if user.role != ROLE_AUDIT_MANAGER:
        return {"error": "not_authorized", "message": "This data is only available to Audit Managers."}
    return None


def _round_dict(obj):
    if isinstance(obj, float):
        return round(obj, 2)
    if isinstance(obj, dict):
        return {k: _round_dict(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_round_dict(i) for i in obj]
    return obj


# ---------------------------------------------------------------------------
# Tool functions
# ---------------------------------------------------------------------------
def _get_audit_summary(db: Session, user, **_):
    err = _am_only(user)
    if err:
        return err
    today = dt.date.today()
    month_start = today.replace(day=1)
    by_status = dict(db.query(Audit.status, func.count()).group_by(Audit.status).all())
    avg_score = db.query(func.avg(Audit.score)).filter(Audit.score.isnot(None)).scalar()
    this_month = db.query(func.count(Audit.id)).filter(
        func.date(Audit.scheduled_at) >= month_start
    ).scalar()
    awaiting = db.query(func.count(Audit.id)).filter(Audit.status == "Completed").scalar()
    return _round_dict({
        "by_status": by_status,
        "total": sum(by_status.values()),
        "average_score": round(avg_score, 2) if avg_score else None,
        "audits_this_month": this_month,
        "awaiting_approval": awaiting,
    })


def _list_audits(db: Session, user, status=None, store=None, auditor_name=None,
                 date_from=None, date_to=None, top_n=20, **_):
    q = db.query(Audit).join(Audit.store).outerjoin(Audit.auditor)
    q = _scope_audits_q(q, db, user)
    if status:
        q = q.filter(Audit.status == status)
    if store:
        q = q.filter(or_(Store.name.ilike(f"%{store}%"), Store.id.ilike(f"%{store}%")))
    if auditor_name:
        q = q.filter(User.name.ilike(f"%{auditor_name}%"))
    if date_from:
        q = q.filter(func.date(Audit.scheduled_at) >= date_from)
    if date_to:
        q = q.filter(func.date(Audit.scheduled_at) <= date_to)
    total = q.count()
    rows = q.order_by(Audit.scheduled_at.desc()).limit(int(top_n or 20)).all()
    return _round_dict({
        "total": total, "showing": len(rows),
        "audits": [{
            "id": a.id,
            "store": a.store.name if a.store else a.store_id,
            "city": a.store.city if a.store else None,
            "region": a.store.region if a.store else None,
            "status": a.status,
            "score": a.score,
            "scheduled_at": a.scheduled_at.date().isoformat() if a.scheduled_at else None,
            "auditor": a.auditor.name if a.auditor else "Unassigned",
        } for a in rows],
    })


def _get_audit_detail(db: Session, user, audit_id, **_):
    a = db.query(Audit).filter(Audit.id == audit_id).first()
    if not a:
        return {"error": "not_found", "message": f"Audit {audit_id} not found."}
    if user.role == ROLE_AUDITOR and a.auditor_id != user.id:
        return {"error": "not_authorized"}
    if user.role == ROLE_STORE_MANAGER and a.store_id not in _sm_store_ids(db, user):
        return {"error": "not_authorized"}
    by_process: dict = {}
    critical_fails = []
    unanswered = 0
    for r in a.responses:
        if not r.answer:
            unanswered += 1
            continue
        proc = (r.question.process if r.question else None) or "Unknown"
        by_process.setdefault(proc, {"yes": 0, "no": 0, "partial": 0, "na": 0})
        ans = r.answer.lower()
        if ans == "yes":
            by_process[proc]["yes"] += 1
        elif ans == "no":
            by_process[proc]["no"] += 1
            if r.question and r.question.is_critical:
                critical_fails.append({"question": r.question.text[:80], "remarks": r.remarks})
        elif ans == "partial":
            by_process[proc]["partial"] += 1
        elif ans == "na":
            by_process[proc]["na"] += 1
    return _round_dict({
        "id": a.id,
        "store": a.store.name if a.store else a.store_id,
        "status": a.status, "score": a.score,
        "scheduled_at": a.scheduled_at.date().isoformat() if a.scheduled_at else None,
        "submitted_at": a.submitted_at.date().isoformat() if a.submitted_at else None,
        "auditor": a.auditor.name if a.auditor else "Unassigned",
        "by_process": by_process,
        "critical_failures": critical_fails,
        "unanswered": unanswered,
        "total_responses": len(a.responses),
        "sm_rating": a.sm_rating,
        "notes": a.notes,
    })


def _list_stores(db: Session, user, region=None, format=None, city=None,
                 score_lt=None, not_audited_days=None, top_n=20, **_):
    err = _am_only(user)
    if err:
        return err
    q = db.query(Store)
    if region:
        q = q.filter(Store.region.ilike(f"%{region}%"))
    if format:
        q = q.filter(Store.store_format.ilike(f"%{format}%"))
    if city:
        q = q.filter(Store.city.ilike(f"%{city}%"))
    stores = q.order_by(Store.id).all()
    score_map = {r.store_id: r for r in db.query(StoreScore).all()}
    last_audit_map = dict(
        db.query(Audit.store_id, func.max(Audit.scheduled_at)).group_by(Audit.store_id).all()
    )
    today = dt.date.today()
    rows = []
    for s in stores:
        sc = score_map.get(s.id)
        last_dt = last_audit_map.get(s.id)
        last_date = last_dt.date() if last_dt else None
        days_since = (today - last_date).days if last_date else None
        q4 = sc.q4 if sc else None
        if score_lt is not None and (q4 is None or q4 >= score_lt):
            continue
        if not_audited_days is not None and (days_since is None or days_since < not_audited_days):
            continue
        rows.append({
            "id": s.id, "name": s.name, "city": s.city, "region": s.region,
            "format": s.store_format, "status": s.status,
            "manager": s.manager.name if s.manager else None,
            "q1": sc.q1 if sc else None, "q2": sc.q2 if sc else None,
            "q3": sc.q3 if sc else None, "q4": sc.q4 if sc else None,
            "last_audit_date": last_date.isoformat() if last_date else None,
            "days_since_audit": days_since,
        })
    return _round_dict({"total": len(rows), "showing": min(len(rows), int(top_n or 20)), "stores": rows[:int(top_n or 20)]})


def _get_store_detail(db: Session, user, store, **_):
    if user.role == ROLE_AUDITOR:
        return {"error": "not_authorized", "message": "Auditors cannot view store details."}
    s = db.query(Store).filter(
        or_(Store.id.ilike(f"%{store}%"), Store.name.ilike(f"%{store}%"))
    ).first()
    if not s:
        return {"error": "not_found", "message": f"No store matching '{store}'."}
    if user.role == ROLE_STORE_MANAGER and s.id not in _sm_store_ids(db, user):
        return {"error": "not_authorized", "message": "You can only view your own store."}
    sc = db.query(StoreScore).filter(StoreScore.store_id == s.id).first()
    last_audit = db.query(Audit).filter(
        Audit.store_id == s.id
    ).order_by(Audit.scheduled_at.desc()).first()
    open_issues = db.query(func.count(Issue.id)).filter(
        Issue.store_id == s.id, Issue.status != "Resolved"
    ).scalar()
    cash_gap = db.query(func.sum(CashReconciliation.difference)).filter(
        CashReconciliation.store_id == s.id
    ).scalar()
    expired_value = db.query(
        func.sum(ExpiredInventory.quantity * ExpiredInventory.mrp)
    ).filter(ExpiredInventory.store_id == s.id).scalar()
    return _round_dict({
        "id": s.id, "name": s.name, "city": s.city, "region": s.region,
        "format": s.store_format, "status": s.status,
        "manager": s.manager.name if s.manager else None,
        "contact": s.contact, "address": s.address,
        "scores": {"q1": sc.q1, "q2": sc.q2, "q3": sc.q3, "q4": sc.q4} if sc else None,
        "last_audit": {
            "id": last_audit.id, "status": last_audit.status, "score": last_audit.score,
            "date": last_audit.scheduled_at.date().isoformat() if last_audit.scheduled_at else None,
        } if last_audit else None,
        "open_issues": open_issues,
        "total_cash_difference": cash_gap,
        "expired_stock_value": expired_value,
    })


def _get_store_score_trend(db: Session, user, store, **_):
    if user.role == ROLE_AUDITOR:
        return {"error": "not_authorized"}
    s = db.query(Store).filter(
        or_(Store.id.ilike(f"%{store}%"), Store.name.ilike(f"%{store}%"))
    ).first()
    if not s:
        return {"error": "not_found", "message": f"No store matching '{store}'."}
    if user.role == ROLE_STORE_MANAGER and s.id not in _sm_store_ids(db, user):
        return {"error": "not_authorized"}
    sc = db.query(StoreScore).filter(StoreScore.store_id == s.id).first()
    audit_scores = db.query(Audit.id, Audit.scheduled_at, Audit.score).filter(
        Audit.store_id == s.id, Audit.score.isnot(None)
    ).order_by(Audit.scheduled_at).all()
    return _round_dict({
        "store": s.name,
        "quarterly_scores": {"q1": sc.q1, "q2": sc.q2, "q3": sc.q3, "q4": sc.q4} if sc else None,
        "audit_scores": [{"audit_id": a.id,
                          "date": a.scheduled_at.date().isoformat() if a.scheduled_at else None,
                          "score": a.score} for a in audit_scores],
    })


def _list_issues(db: Session, user, priority=None, status=None, overdue_only=False,
                 store=None, process=None, top_n=20, **_):
    if user.role == ROLE_AUDITOR:
        return {"error": "not_authorized", "message": "Auditors cannot view issues."}
    q = db.query(Issue).outerjoin(Issue.store)
    q = _scope_issues_q(q, db, user)
    if q is None:
        return {"error": "not_authorized"}
    if priority:
        q = q.filter(Issue.priority == priority)
    if status:
        q = q.filter(Issue.status == status)
    if overdue_only:
        q = q.filter(Issue.due_date < dt.date.today(), Issue.status != "Resolved")
    if store:
        q = q.filter(or_(Store.name.ilike(f"%{store}%"), Store.id.ilike(f"%{store}%")))
    if process:
        q = q.filter(Issue.process.ilike(f"%{process}%"))
    total = q.count()
    rows = q.order_by(Issue.created_at.desc()).limit(int(top_n or 20)).all()
    return _round_dict({
        "total": total, "showing": len(rows),
        "issues": [{
            "id": i.id, "title": i.title,
            "store": i.store.name if i.store else i.store_id,
            "priority": i.priority, "status": i.status, "process": i.process,
            "due_date": i.due_date.isoformat() if i.due_date else None,
            "overdue": i.is_overdue,
            "assignee": i.assignee.name if i.assignee else None,
        } for i in rows],
    })


def _list_observations(db: Session, user, audit_id=None, store=None, status=None, **_):
    q = db.query(Observation).outerjoin(Observation.store)
    if user.role == ROLE_STORE_MANAGER:
        q = q.filter(Observation.store_id.in_(_sm_store_ids(db, user)))
    elif user.role == ROLE_AUDITOR:
        auditor_audits = db.query(Audit.id).filter(Audit.auditor_id == user.id).subquery()
        q = q.filter(Observation.audit_id.in_(auditor_audits))
    if audit_id:
        q = q.filter(Observation.audit_id == audit_id)
    if store:
        q = q.filter(or_(Store.name.ilike(f"%{store}%"), Store.id.ilike(f"%{store}%")))
    if status:
        q = q.filter(Observation.status.ilike(f"%{status}%"))
    rows = q.order_by(Observation.audit_id, Observation.sr_no).limit(30).all()
    return {"total": len(rows), "observations": [o.to_dict() for o in rows]}


def _get_failure_rollup(db: Session, user, group_by="process", region=None, **_):
    err = _am_only(user)
    if err:
        return err
    q = (db.query(AuditResponse, Question, Store)
         .join(Question, AuditResponse.question_id == Question.id)
         .join(Audit, AuditResponse.audit_id == Audit.id)
         .join(Store, Audit.store_id == Store.id)
         .filter(AuditResponse.answer.in_(["No", "Partial"])))
    if region:
        q = q.filter(Store.region.ilike(f"%{region}%"))
    rows = q.all()
    rollup: dict = {}
    for resp, qu, st in rows:
        key = (qu.process if group_by == "process"
               else qu.sub_process or qu.process if group_by == "sub_process"
               else qu.text[:60]) or "Unknown"
        rollup.setdefault(key, {"no": 0, "partial": 0, "critical": 0, "total": 0})
        rollup[key]["total"] += 1
        if resp.answer == "No":
            rollup[key]["no"] += 1
            if qu.is_critical:
                rollup[key]["critical"] += 1
        else:
            rollup[key]["partial"] += 1
    total_resp = db.query(func.count(AuditResponse.id)).filter(
        AuditResponse.answer.in_(["Yes", "No", "Partial"])
    ).scalar() or 1
    result = sorted([
        {"group": k, **v, "failure_pct": round((v["no"] + v["partial"]) / total_resp * 100, 2)}
        for k, v in rollup.items()
    ], key=lambda x: x["total"], reverse=True)
    return {"group_by": group_by, "total_failures": len(rows), "rollup": result[:30]}


def _get_cash_exceptions(db: Session, user, min_difference=None, min_delay_days=None, store=None, **_):
    if user.role == ROLE_AUDITOR:
        return {"error": "not_authorized", "message": "Auditors cannot view cash data."}
    sm_ids = _sm_store_ids(db, user) if user.role == ROLE_STORE_MANAGER else None
    q_r = db.query(CashReconciliation).outerjoin(Store, CashReconciliation.store_id == Store.id)
    if sm_ids is not None:
        q_r = q_r.filter(CashReconciliation.store_id.in_(sm_ids))
    if store:
        q_r = q_r.filter(or_(Store.name.ilike(f"%{store}%"), Store.id.ilike(f"%{store}%")))
    if min_difference is not None:
        q_r = q_r.filter(
            (CashReconciliation.difference < -float(min_difference)) |
            (CashReconciliation.difference > float(min_difference))
        )
    recon = q_r.all()
    q_d = db.query(CashDepositPickup).outerjoin(Store, CashDepositPickup.store_id == Store.id)
    if sm_ids is not None:
        q_d = q_d.filter(CashDepositPickup.store_id.in_(sm_ids))
    if store:
        q_d = q_d.filter(or_(Store.name.ilike(f"%{store}%"), Store.id.ilike(f"%{store}%")))
    if min_delay_days is not None:
        q_d = q_d.filter(CashDepositPickup.handover_delay_days >= int(min_delay_days))
    deps = q_d.all()
    return _round_dict({
        "reconciliation_exceptions": len(recon),
        "reconciliations": [{"store_id": r.store_id, "physical": r.physical_cash_total,
                             "book": r.book_cash_total, "difference": r.difference,
                             "remarks": r.remarks} for r in recon[:20]],
        "deposit_delays": len(deps),
        "deposits": [{"store_id": r.store_id,
                      "sales_date": r.sales_date.isoformat() if r.sales_date else None,
                      "cash_sales": r.cash_sales, "deposited": r.cash_deposited,
                      "delay_days": r.handover_delay_days} for r in deps[:20]],
    })


def _get_expired_inventory(db: Session, user, store=None, top_n=20, **_):
    if user.role == ROLE_AUDITOR:
        return {"error": "not_authorized", "message": "Auditors cannot view inventory data."}
    q = db.query(ExpiredInventory).outerjoin(Store, ExpiredInventory.store_id == Store.id)
    if user.role == ROLE_STORE_MANAGER:
        q = q.filter(ExpiredInventory.store_id.in_(_sm_store_ids(db, user)))
    if store:
        q = q.filter(or_(Store.name.ilike(f"%{store}%"), Store.id.ilike(f"%{store}%")))
    total = q.count()
    total_value = db.query(
        func.sum(ExpiredInventory.quantity * ExpiredInventory.mrp)
    ).scalar()
    rows = q.limit(int(top_n or 20)).all()
    return _round_dict({
        "total_items": total, "total_value": total_value, "showing": len(rows),
        "items": [{"store_id": r.store_id, "article": r.article_description,
                   "code": r.article_code,
                   "expiry": r.expiry_date.isoformat() if r.expiry_date else None,
                   "qty": r.quantity, "mrp": r.mrp,
                   "value": round((r.quantity or 0) * (r.mrp or 0), 2)} for r in rows],
    })


def _get_auditor_availability(db: Session, user, date_from, date_to=None, auditor_name=None, **_):
    err = _am_only(user)
    if err:
        return err
    from_d = dt.date.fromisoformat(date_from)
    to_d = dt.date.fromisoformat(date_to) if date_to else from_d + dt.timedelta(days=7)
    q = (db.query(AuditorAvailability).join(User, AuditorAvailability.auditor_id == User.id)
         .filter(AuditorAvailability.from_date <= to_d, AuditorAvailability.to_date >= from_d))
    if auditor_name:
        q = q.filter(User.name.ilike(f"%{auditor_name}%"))
    blocks = q.all()
    blocked_ids = {b.auditor_id: b.reason for b in blocks}
    auditors = db.query(User).filter(User.role == ROLE_AUDITOR, User.active == True).all()
    scheduled = db.query(Audit).filter(
        func.date(Audit.scheduled_at) >= from_d,
        func.date(Audit.scheduled_at) <= to_d,
    ).all()
    sched_map: dict = {}
    for a in scheduled:
        sched_map.setdefault(a.auditor_id, []).append({
            "audit_id": a.id,
            "store": a.store.name if a.store else a.store_id,
            "date": a.scheduled_at.date().isoformat() if a.scheduled_at else None,
        })
    return {
        "window": {"from": from_d.isoformat(), "to": to_d.isoformat()},
        "auditors": [{
            "id": u.id, "name": u.name,
            "available": u.id not in blocked_ids,
            "block_reason": blocked_ids.get(u.id),
            "scheduled_audits": sched_map.get(u.id, []),
        } for u in auditors],
    }


def _list_questions(db: Session, user, process=None, critical_only=False,
                    photo_required=False, approval_status=None, **_):
    q = db.query(Question).filter(Question.is_current == True, Question.active == True)
    if user.role == ROLE_AUDITOR:
        q = q.filter(Question.approval_status == "APPROVED")
    elif approval_status:
        q = q.filter(Question.approval_status == approval_status)
    if process:
        q = q.filter(Question.process.ilike(f"%{process}%"))
    if critical_only:
        q = q.filter(Question.is_critical == True)
    if photo_required:
        q = q.filter(Question.photo_video_enablement == "Yes")
    total = q.count()
    rows = q.order_by(Question.process, Question.sub_process).limit(50).all()
    return {
        "total": total, "showing": len(rows),
        "questions": [{"id": r.id, "code": r.code, "text": r.text,
                       "process": r.process, "sub_process": r.sub_process,
                       "weight": r.weight, "is_critical": r.is_critical,
                       "approval_status": r.approval_status,
                       "photo_required": r.photo_video_enablement == "Yes"} for r in rows],
    }


def _get_checklist_detail(db: Session, user, name_or_id, **_):
    cl = db.query(Checklist).filter(
        or_(Checklist.id == name_or_id, Checklist.name.ilike(f"%{name_or_id}%"))
    ).first()
    if not cl:
        return {"error": "not_found", "message": f"No checklist matching '{name_or_id}'."}
    return cl.to_dict(with_items=True)


def _get_activity_log(db: Session, user, entity_type=None, entity_id=None, top_n=20, **_):
    err = _am_only(user)
    if err:
        return err
    q = db.query(AuditLog)
    if entity_type:
        q = q.filter(AuditLog.entity_type.ilike(f"%{entity_type}%"))
    if entity_id:
        q = q.filter(AuditLog.entity_id == entity_id)
    total = q.count()
    rows = q.order_by(AuditLog.timestamp.desc()).limit(int(top_n or 20)).all()
    return {"total": total, "showing": len(rows), "logs": [r.to_dict() for r in rows]}


def _get_data_freshness(db: Session, user, section=None, **_):
    err = _am_only(user)
    if err:
        return err
    q = db.query(DataImport)
    if section:
        q = q.filter(DataImport.data_section.ilike(f"%{section}%"))
    rows = q.order_by(DataImport.imported_at.desc()).all()
    by_section: dict = {}
    for r in rows:
        if r.data_section not in by_section:
            by_section[r.data_section] = {
                "last_import": r.imported_at.isoformat() if r.imported_at else None,
                "file": r.file_name,
                "columns": r.column_headers,
            }
    return {"sections": by_section}


# ---------------------------------------------------------------------------
# Tool definitions (single source of truth)
# ---------------------------------------------------------------------------
TOOLS_DEF = [
    {"name": "get_audit_summary", "description": "High-level audit stats: counts by status, average score, audits this month, awaiting approval. AUDIT_MANAGER only.", "properties": {}, "required": []},
    {"name": "list_audits", "description": "List audits. Scoped by role.", "properties": {"status": {"type": "string", "description": "Planned / Ongoing / Completed"}, "store": {"type": "string", "description": "Store name or ID (partial)"}, "auditor_name": {"type": "string", "description": "Auditor name (partial)"}, "date_from": {"type": "string", "description": "YYYY-MM-DD"}, "date_to": {"type": "string", "description": "YYYY-MM-DD"}, "top_n": {"type": "integer", "description": "Max results (default 20)"}}, "required": []},
    {"name": "get_audit_detail", "description": "Full detail of one audit: score breakdown by process, critical failures, unanswered count.", "properties": {"audit_id": {"type": "string", "description": "e.g. AUD-1000"}}, "required": ["audit_id"]},
    {"name": "list_stores", "description": "List stores with Q1-Q4 scores and last audit date. AUDIT_MANAGER only.", "properties": {"region": {"type": "string", "description": "North/South/East/West"}, "format": {"type": "string", "description": "COCO/COFO/FOCO/FOFO"}, "city": {"type": "string", "description": "City name (partial)"}, "score_lt": {"type": "number", "description": "Only stores with Q4 score below this"}, "not_audited_days": {"type": "integer", "description": "Only stores not audited for N days"}, "top_n": {"type": "integer", "description": "Max results (default 20)"}}, "required": []},
    {"name": "get_store_detail", "description": "Master data + last audit + open issues + cash gap + expired stock for one store.", "properties": {"store": {"type": "string", "description": "Store name or ID (partial)"}}, "required": ["store"]},
    {"name": "get_store_score_trend", "description": "Q1-Q4 quarterly scores and audit score history for a store.", "properties": {"store": {"type": "string", "description": "Store name or ID (partial)"}}, "required": ["store"]},
    {"name": "list_issues", "description": "List issues/actions. Overdue = due_date < today AND status != Resolved.", "properties": {"priority": {"type": "string", "description": "Critical/High/Medium/Low"}, "status": {"type": "string", "description": "Open/In Progress/Resolved"}, "overdue_only": {"type": "boolean", "description": "Only overdue issues"}, "store": {"type": "string", "description": "Store name or ID (partial)"}, "process": {"type": "string", "description": "Process area (partial)"}, "top_n": {"type": "integer", "description": "Max results (default 20)"}}, "required": []},
    {"name": "list_observations", "description": "List audit observations.", "properties": {"audit_id": {"type": "string"}, "store": {"type": "string"}, "status": {"type": "string", "description": "Open - Not Due / Open - Overdue / In Progress / Closed"}}, "required": []},
    {"name": "get_failure_rollup", "description": "Count No/Partial answers grouped by process, sub_process, or question. AUDIT_MANAGER only.", "properties": {"group_by": {"type": "string", "description": "process / sub_process / question"}, "region": {"type": "string"}}, "required": []},
    {"name": "get_cash_exceptions", "description": "Cash reconciliation gaps and deposit pickup delays.", "properties": {"min_difference": {"type": "number"}, "min_delay_days": {"type": "integer"}, "store": {"type": "string"}}, "required": []},
    {"name": "get_expired_inventory", "description": "Expired inventory items and total value.", "properties": {"store": {"type": "string"}, "top_n": {"type": "integer"}}, "required": []},
    {"name": "get_auditor_availability", "description": "Who is free/blocked in a date window. AUDIT_MANAGER only.", "properties": {"date_from": {"type": "string", "description": "YYYY-MM-DD"}, "date_to": {"type": "string", "description": "YYYY-MM-DD (optional)"}, "auditor_name": {"type": "string"}}, "required": ["date_from"]},
    {"name": "list_questions", "description": "List active audit checklist questions.", "properties": {"process": {"type": "string"}, "critical_only": {"type": "boolean"}, "photo_required": {"type": "boolean"}, "approval_status": {"type": "string", "description": "APPROVED/PENDING/REJECTED"}}, "required": []},
    {"name": "get_checklist_detail", "description": "Full checklist with all questions.", "properties": {"name_or_id": {"type": "string"}}, "required": ["name_or_id"]},
    {"name": "get_activity_log", "description": "Recent system activity log. AUDIT_MANAGER only.", "properties": {"entity_type": {"type": "string"}, "entity_id": {"type": "string"}, "top_n": {"type": "integer"}}, "required": []},
    {"name": "get_data_freshness", "description": "Last data import date per section. AUDIT_MANAGER only.", "properties": {"section": {"type": "string"}}, "required": []},
]

_DISPATCH = {
    "get_audit_summary": _get_audit_summary,
    "list_audits": _list_audits,
    "get_audit_detail": _get_audit_detail,
    "list_stores": _list_stores,
    "get_store_detail": _get_store_detail,
    "get_store_score_trend": _get_store_score_trend,
    "list_issues": _list_issues,
    "list_observations": _list_observations,
    "get_failure_rollup": _get_failure_rollup,
    "get_cash_exceptions": _get_cash_exceptions,
    "get_expired_inventory": _get_expired_inventory,
    "get_auditor_availability": _get_auditor_availability,
    "list_questions": _list_questions,
    "get_checklist_detail": _get_checklist_detail,
    "get_activity_log": _get_activity_log,
    "get_data_freshness": _get_data_freshness,
}


# ---------------------------------------------------------------------------
# Build LangChain tools dynamically from TOOLS_DEF
# ---------------------------------------------------------------------------
def _py_type(ftype: str, required: bool):
    base = {"string": str, "integer": int, "number": float, "boolean": bool}.get(ftype, str)
    return base if required else Optional[base]


def _build_tools(db: Session, user):
    from langchain_core.tools import StructuredTool

    tools = []
    for tdef in TOOLS_DEF:
        name = tdef["name"]
        fn = _DISPATCH[name]
        req = set(tdef.get("required", []))
        fields: dict = {}
        for fname, fspec in tdef.get("properties", {}).items():
            py_t = _py_type(fspec.get("type", "string"), fname in req)
            default = ... if fname in req else None
            fields[fname] = (py_t, Field(default=default, description=fspec.get("description", "")))
        ArgsModel = create_model(f"_{name}_args", **fields)

        def _make(f=fn, db_=db, user_=user):
            def _call(**kwargs):
                return f(db_, user_, **kwargs)
            return _call

        tools.append(StructuredTool.from_function(
            func=_make(),
            name=name,
            description=tdef["description"],
            args_schema=ArgsModel,
        ))
    return tools


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------
def _build_system_prompt(user) -> str:
    today = dt.datetime.now(IST).strftime("%d %B %Y")
    ctx = {
        ROLE_AUDIT_MANAGER: "You are speaking with the Audit Manager — full access to all stores, audits, issues, cash data, and system logs.",
        ROLE_AUDITOR: "You are speaking with an Auditor — only their own assigned audits and APPROVED questions. No cash, inventory, or cross-store data.",
        ROLE_STORE_MANAGER: "You are speaking with a Store Manager — only their own store's audits, issues, cash reconciliation, deposits, and expired inventory.",
    }
    return f"""You are **Retail Sync Assistant**, the AI for the Retail Sync Store Audit & Analysis platform.
User: {user.name} | Role: {user.role} | Today: {today} (IST)

{ctx.get(user.role, "")}

FIXED FACTS (no tool needed):
- Score = round(Σ(weight × answer_value) / Σ(weight) × 100, 2). Yes=1.0, Partial=0.5, No=0.0, NA excluded.
- Audit flow: Planned → Ongoing → Completed → Approved.
- Issue status: Open / In Progress / Resolved. Overdue = due_date < today AND status ≠ Resolved.
- Observation status: Open - Not Due / Open - Overdue / In Progress / Closed.
- Store formats: COCO=Company Owned Company Operated, COFO=Company Owned Franchise Operated, FOCO=Franchise Owned Company Operated, FOFO=Franchise Owned Franchise Operated.
- Cash difference = physical_cash_total − book_cash_total. Negative = shortage.
- Processes: Cashiering, EHS & Compliance, Inventory Management, Schemes and Promotions, Store Operations.
- Regions: North, South, East, West.

RULES:
1. Always call a tool before stating any count, score, or factual DB value. Never invent data.
2. Only answer about this app's data or how it works. Decline anything else in one sentence.
3. This is read-only. Decline requests to approve, create, update, or delete anything.
4. If AM asks "how many issues?" with no store, ask once: "For one store or all stores?"
5. Match store names flexibly — partial or code. If multiple match, list them.
6. Currency: ₹, Indian format (e.g., ₹2.4 lakh, ₹1.2 crore).
7. No markdown headers (#). Use **bold** for labels. Answer first, chart second.
8. For 3+ comparable data points use ONE block:
   ```rs-chart\n{{"type":"bar|line|pie","title":"...","x_key":"...","y_label":"...","series":[{{"key":"...","name":"..."}}],"data":[...]}}\n```
   ```rs-table\n{{"title":"...","columns":[...],"rows":[[...]]}}\n```
   ```rs-cards\n{{"title":"...","items":[{{"name":"...","value":"...","subtitle":"...","badge":"..."}}]}}\n```
   ```rs-details\n{{"title":"...","items":[{{"summary":"...","detail":"...","badge":"..."}}]}}\n```
"""


# ---------------------------------------------------------------------------
# Block parser
# ---------------------------------------------------------------------------
_BLOCK_RE = re.compile(r"```(rs-chart|rs-table|rs-cards|rs-details)\s*\n(.*?)\n```", re.DOTALL)


def _parse_blocks(text: str):
    charts, tables, cards, details_list = [], [], [], []
    for m in _BLOCK_RE.finditer(text):
        btype, raw = m.group(1), m.group(2).strip()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        try:
            if btype == "rs-chart":
                charts.append(ChartSpec(**data))
            elif btype == "rs-table":
                tables.append(TableSpec(**data))
            elif btype == "rs-cards":
                cards.append(CardsSpec(**data))
            elif btype == "rs-details":
                details_list.append(DetailsSpec(**data))
        except Exception:
            pass
    clean = _BLOCK_RE.sub("", text).strip()
    return clean, charts, tables, cards, details_list


def _extract_text(msg) -> str:
    c = msg.content
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return "".join(
            b.get("text", "") if isinstance(b, dict) else str(b)
            for b in c
        )
    return str(c) if c else ""


def _get_suggestions(llm, reply: str) -> list[str]:
    try:
        from langchain_core.messages import HumanMessage
        prompt = (
            f'Based on this answer: "{reply[:300]}"\n'
            "Generate exactly 3 short follow-up questions a retail auditor or manager might ask next. "
            "Return ONLY a JSON array of 3 strings, no other text."
        )
        resp = llm.invoke([HumanMessage(content=prompt)])
        text = _extract_text(resp).strip()
        m = re.search(r"\[.*?\]", text, re.DOTALL)
        if m:
            return json.loads(m.group(0))[:3]
    except Exception:
        pass
    return []


# ---------------------------------------------------------------------------
# Log turn
# ---------------------------------------------------------------------------
def _log_turn(db, conv_id, idx, user, question, reply, tools_used, latency_ms, iterations, error=None):
    try:
        db.add(ChatTurn(
            conversation_id=conv_id,
            turn_index=idx,
            user_id=user.id,
            question=(question or "")[:2000],
            reply=(reply or "")[:4000],
            tools_used=tools_used,
            latency_ms=latency_ms,
            iterations=iterations,
            error=error,
        ))
        db.commit()
    except Exception:
        db.rollback()


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------
def run_chat(db: Session, user, messages: list[dict], conversation_id: str | None = None) -> dict:
    from langchain_google_genai import ChatGoogleGenerativeAI
    from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage

    t0 = time.time()
    conv_id = conversation_id or uuid.uuid4().hex[:12]

    key = os.getenv("GOOGLE_API_KEY", "")
    model = os.getenv("LLM_MODEL", "gemini-1.5-flash")
    if not key or key == "your_gemini_api_key_here":
        return {
            "reply": "⚠️ AI Assistant is not configured. Please set GOOGLE_API_KEY in backend/.env.",
            "charts": [], "tables": [], "cards": [], "details": [],
            "suggestions": [], "conversation_id": conv_id,
        }

    llm = ChatGoogleGenerativeAI(model=model, temperature=0, google_api_key=key)
    tools = _build_tools(db, user)
    llm_with_tools = llm.bind_tools(tools)

    lc_msgs = [SystemMessage(content=_build_system_prompt(user))]
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        if role == "user":
            lc_msgs.append(HumanMessage(content=content))
        elif role == "assistant":
            lc_msgs.append(AIMessage(content=content))

    iterations = 0
    tools_used = []
    last_response = None

    for _ in range(MAX_TOOL_ITERATIONS):
        response = llm_with_tools.invoke(lc_msgs)
        lc_msgs.append(response)
        last_response = response
        if not response.tool_calls:
            break
        for tc in response.tool_calls:
            iterations += 1
            name, args, tid = tc["name"], tc["args"], tc["id"]
            try:
                fn = _DISPATCH.get(name)
                result = fn(db, user, **args) if fn else {"error": "unknown_tool", "name": name}
            except Exception as e:
                result = {"error": "tool_failed", "detail": str(e)[:200]}
            tools_used.append({
                "name": name, "args": args,
                "error": result.get("error") if isinstance(result, dict) else None,
            })
            lc_msgs.append(ToolMessage(content=json.dumps(result, default=str), tool_call_id=tid))

    raw = _extract_text(last_response) if last_response else "Sorry, I could not process that request."
    clean_reply, charts, tables, cards, details_list = _parse_blocks(raw)
    suggestions = _get_suggestions(llm, clean_reply)

    latency_ms = int((time.time() - t0) * 1000)
    turn_idx = sum(1 for m in messages if m.get("role") == "user")
    user_q = messages[-1].get("content", "") if messages else ""
    _log_turn(db, conv_id, turn_idx, user, user_q, clean_reply, tools_used, latency_ms, iterations)

    return {
        "reply": clean_reply,
        "charts": [c.model_dump() for c in charts],
        "tables": [t.model_dump() for t in tables],
        "cards": [c.model_dump() for c in cards],
        "details": [d.model_dump() for d in details_list],
        "suggestions": suggestions,
        "conversation_id": conv_id,
    }
