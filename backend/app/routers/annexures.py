"""Supporting documents filed against an audit from the web."""
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..auth import get_staff_user
from ..db import get_db
from ..models import (
    ROLE_ADMIN, ROLE_AUDIT_MANAGER, ROLE_AUDITOR, ROLE_CLUSTER_HEAD, ROLE_HO_OPERATIONS,
    ROLE_STORE_MANAGER, Annexure, Audit, Store, User,
)
from ..services import log_action

router = APIRouter(prefix="/api/audits/{aid}/annexures", tags=["annexures"])

ANNEXURE_FOLDER = Path(__file__).parent.parent.parent / "uploads" / "annexures"
ANNEXURE_FOLDER.mkdir(parents=True, exist_ok=True)

MAX_BYTES = 25 * 1024 * 1024
CHUNK_BYTES = 1024 * 1024
ALLOWED_TYPES = (".pdf", ".xlsx", ".xls", ".csv", ".docx", ".doc", ".jpg", ".jpeg", ".png")


def _audit_for(db, aid, user):
    """The audit, if this person may see it."""
    audit = db.get(Audit, aid)
    if not audit:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    store = db.get(Store, audit.store_id)
    allowed = (
        user.role in (ROLE_ADMIN, ROLE_AUDIT_MANAGER, ROLE_HO_OPERATIONS)
        or (user.role == ROLE_AUDITOR and audit.auditor_id == user.id)
        or (user.role == ROLE_STORE_MANAGER and store and store.manager_id == user.id)
        or (user.role == ROLE_CLUSTER_HEAD and store and store.region == user.region)
    )
    if not allowed:
        raise HTTPException(status_code=403, detail={"error": "forbidden"})
    return audit


def _check_can_file(user):
    if user.role in (ROLE_CLUSTER_HEAD, ROLE_HO_OPERATIONS):
        raise HTTPException(status_code=403, detail={"error": "forbidden"})


def _annexure(db, audit, nid):
    a = db.get(Annexure, nid)
    if not a or a.audit_id != audit.id:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    return a


@router.get("")
def list_annexures(aid: str, db: Session = Depends(get_db), user: User = Depends(get_staff_user)):
    audit = _audit_for(db, aid, user)
    rows = db.query(Annexure).filter_by(audit_id=audit.id).order_by(Annexure.created_at.desc()).all()
    return [a.to_dict() for a in rows]


@router.post("", status_code=201)
async def file_annexure(
    aid: str,
    title: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_staff_user),
):
    audit = _audit_for(db, aid, user)
    _check_can_file(user)
    original = Path(file.filename or "").name
    ext = Path(original).suffix.lower()
    if ext not in ALLOWED_TYPES:
        raise HTTPException(status_code=422, detail={
            "error": f"allowed file types: {', '.join(t[1:] for t in ALLOWED_TYPES)}"})

    stored = f"{uuid.uuid4().hex}{ext}"
    path = ANNEXURE_FOLDER / stored
    size = 0
    try:
        with path.open("wb") as out:
            while chunk := await file.read(CHUNK_BYTES):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(status_code=413, detail={
                        "error": f"file is larger than {MAX_BYTES // (1024 * 1024)} MB"})
                out.write(chunk)
        if size == 0:
            raise HTTPException(status_code=422, detail={"error": "file is empty"})
    except HTTPException:
        path.unlink(missing_ok=True)
        raise

    a = Annexure(audit_id=audit.id, title=title.strip() or original, file_name=original,
                 stored_name=stored, uploaded_by_id=user.id)
    db.add(a)
    db.flush()
    log_action(db, user.id, "file_annexure", "audit", audit.id, {"file": original})
    db.commit()
    return a.to_dict()


@router.get("/{nid}/file")
def read_annexure(aid: str, nid: str, db: Session = Depends(get_db), user: User = Depends(get_staff_user)):
    a = _annexure(db, _audit_for(db, aid, user), nid)
    path = ANNEXURE_FOLDER / a.stored_name
    if not path.is_file():
        raise HTTPException(status_code=404, detail={"error": "not found"})
    return FileResponse(path, filename=a.file_name, headers={"X-Content-Type-Options": "nosniff"})


@router.delete("/{nid}", status_code=204)
def delete_annexure(aid: str, nid: str, db: Session = Depends(get_db), user: User = Depends(get_staff_user)):
    audit = _audit_for(db, aid, user)
    _check_can_file(user)
    a = _annexure(db, audit, nid)
    if user.role not in (ROLE_ADMIN, ROLE_AUDIT_MANAGER) and a.uploaded_by_id != user.id:
        raise HTTPException(status_code=403, detail={"error": "forbidden"})
    (ANNEXURE_FOLDER / a.stored_name).unlink(missing_ok=True)
    log_action(db, user.id, "delete_annexure", "audit", audit.id, {"file": a.file_name})
    db.delete(a)
    db.commit()
