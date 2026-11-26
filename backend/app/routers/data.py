from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import get_staff_user, require_roles
from ..db import get_db
from ..models import (
    ROLE_ADMIN, ROLE_AUDIT_MANAGER, ROLE_STORE_MANAGER,
    DataImport, Store, StoreScore, User,
)
from ..schemas import DataImportOut, StoreScoreOut

router = APIRouter(prefix="/api", tags=["data"])


def _sm_store_ids(db: Session, user: User) -> list[str]:
    """Return all store IDs managed by a Store Manager."""
    stores = db.query(Store).filter(Store.manager_id == user.id).all()
    return [s.id for s in stores]


@router.get("/data-imports", response_model=list[DataImportOut])
def list_data_imports(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    rows = db.query(DataImport).order_by(DataImport.imported_at.desc()).all()
    return [{
        "id": di.id, "file_name": di.file_name,
        "data_section": di.data_section,
        "column_headers": di.column_headers,
        "imported_at": di.imported_at.isoformat() if di.imported_at else None,
    } for di in rows]


@router.get("/store-scores", response_model=list[StoreScoreOut])
def list_store_scores(
    store_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_staff_user),
):
    q = db.query(StoreScore)
    if user.role == ROLE_STORE_MANAGER:
        ids = _sm_store_ids(db, user)
        q = q.filter(StoreScore.store_id.in_(ids))
    elif store_id:
        q = q.filter(StoreScore.store_id == store_id)
    return [{
        "id": ss.id, "store_id": ss.store_id,
        "store_code": ss.store_code, "status": ss.status,
        "q1": ss.q1, "q2": ss.q2, "q3": ss.q3, "q4": ss.q4,
    } for ss in q.all()]
