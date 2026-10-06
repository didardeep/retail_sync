"""Editing and publishing SOP audit tools as new versions (manager only).

The editor loads the current tree, the manager changes it in the browser, and
one publish call turns it into the next version (see app/sop_versions.py)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import require_roles
from ..db import get_db
from ..models import ROLE_AUDIT_MANAGER, SopAudit, SopTemplate, User
from ..schemas import SopPublishIn
from ..services import SOP_DRAFT, SOP_FINAL_STATUSES, SOP_PLANNED
from ..sop_versions import (
    InvalidTree, StaleVersion, publish_version, tree_of,
)

router = APIRouter(prefix="/api/sop-admin", tags=["sop-admin"])

# Audits that are tied to the version they were started on.
_TIED_STATUSES = (*SOP_FINAL_STATUSES, SOP_DRAFT)


def _iso(value):
    return value.isoformat() + "Z" if value else None


def _counts(db, template_ids):
    """template id -> {audit_count (final + draft), planned_count}."""
    out = {tid: {"audit_count": 0, "planned_count": 0} for tid in template_ids}
    rows = (db.query(SopAudit.template_id, SopAudit.status, func.count(SopAudit.id))
            .filter(SopAudit.template_id.in_(template_ids))
            .group_by(SopAudit.template_id, SopAudit.status).all())
    for tid, status, n in rows:
        if status in _TIED_STATUSES:
            out[tid]["audit_count"] += n
        elif status == SOP_PLANNED:
            out[tid]["planned_count"] += n
    return out


def _version_row(tpl, counts, authors):
    return {
        "id": tpl.id, "version": tpl.version, "is_current": tpl.is_current,
        "name": tpl.name, "total_marks": tpl.total_marks,
        "published_at": _iso(tpl.published_at), "change_note": tpl.change_note,
        "created_by": authors.get(tpl.created_by_id),
        "section_count": len(tpl.sections),
        "criterion_count": sum(len(s.criteria) for s in tpl.sections),
        **counts,
    }


def _authors(db, templates):
    ids = {t.created_by_id for t in templates if t.created_by_id}
    if not ids:
        return {}
    return {u.id: u.name for u in db.query(User).filter(User.id.in_(ids))}


def _not_found():
    return HTTPException(status_code=404, detail={"error": "not found"})


def _current_or_404(db, code):
    tpl = db.query(SopTemplate).filter_by(code=code, is_current=True).first()
    if tpl is None:
        raise _not_found()
    return tpl


@router.get("/tools")
def list_tools(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER)),
):
    rows = db.query(SopTemplate).order_by(SopTemplate.code, SopTemplate.version.desc()).all()
    counts = _counts(db, [t.id for t in rows]) if rows else {}
    authors = _authors(db, rows)
    by_code = {}
    for tpl in rows:
        by_code.setdefault(tpl.code, []).append(tpl)
    tools = []
    for code, versions in by_code.items():
        current = next((t for t in versions if t.is_current), versions[0])
        tools.append({
            "code": code, "name": current.name, "min_rule": current.min_rule,
            "is_active": current.is_active,
            "current": _version_row(current, counts[current.id], authors),
            "versions": [_version_row(t, counts[t.id], authors) for t in versions],
            "audit_count": sum(counts[t.id]["audit_count"] for t in versions),
        })
    tools.sort(key=lambda t: t["name"])
    return tools


@router.get("/tools/{code}/current")
def get_current_tree(
    code: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER)),
):
    tpl = _current_or_404(db, code)
    counts = _counts(db, [tpl.id])[tpl.id]
    return {"tree": tree_of(tpl), "base_version": tpl.version,
            "published_at": _iso(tpl.published_at),
            "change_note": tpl.change_note, **counts}


@router.get("/tools/{code}/versions/{version}")
def get_version_tree(
    code: str,
    version: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER)),
):
    tpl = db.query(SopTemplate).filter_by(code=code, version=version).first()
    if tpl is None:
        raise _not_found()
    counts = _counts(db, [tpl.id])[tpl.id]
    return {"tree": tree_of(tpl, with_ids=True), "template_id": tpl.id,
            "version": tpl.version, "is_current": tpl.is_current,
            "published_at": _iso(tpl.published_at),
            "change_note": tpl.change_note, **counts}


@router.post("/tools/{code}/publish")
def publish_tool(
    code: str,
    body: SopPublishIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER)),
):
    _current_or_404(db, code)
    tree = body.tree.model_dump()
    tree["code"] = code
    try:
        result = publish_version(db, code, tree, user, body.base_version,
                                 body.change_note)
    except StaleVersion as exc:
        raise HTTPException(status_code=409, detail={
            "error": "this tool was published by someone else; reload to continue",
            "current_version": exc.current_version})
    except InvalidTree as exc:
        raise HTTPException(status_code=422, detail={
            "error": f"{len(exc.errors)} problem(s) must be fixed before publishing",
            "errors": exc.errors})
    tpl = result.template
    return {
        "unchanged": result.unchanged, "version": tpl.version, "id": tpl.id,
        "moved_audits": result.moved_audits,
        "summary": result.diff["summary"] if result.diff else None,
        "template": tpl.to_dict(),
    }
