from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_roles
from ..db import get_db
from ..models import ROLE_AUDIT_MANAGER, ROLE_STORE_MANAGER, Store, User
from ..schemas import StoreCreate, StoreUpdate

router = APIRouter(prefix="/api/stores", tags=["stores"])

_FIELD_MAP = [
    ("name", "name"), ("city", "city"), ("region", "region"),
    ("format", "store_format"), ("type", "store_type"),
    ("status", "status"), ("manager_id", "manager_id"),
    ("contact", "contact"), ("email", "email"), ("address", "address"),
]


@router.get("")
def list_stores(
    status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Store)
    if user.role == ROLE_STORE_MANAGER:
        q = q.filter(Store.manager_id == user.id)
    if status:
        q = q.filter(Store.status == status)
    return [s.to_dict() for s in q.all()]


@router.post("", status_code=201)
def create_store(
    body: StoreCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER)),
):
    d = body.model_dump()
    s = Store(
        id=d["id"], name=d["name"], city=d.get("city"), region=d.get("region"),
        store_format=d.get("format"), store_type=d.get("type"),
        status=d.get("status", "Operating"), manager_id=d.get("manager_id"),
        contact=d.get("contact"), email=d.get("email"),
        address=d.get("address"), meta=d.get("meta", {}),
    )
    db.add(s)
    db.commit()
    return s.to_dict()


@router.put("/{sid}")
def update_store(
    sid: str,
    body: StoreUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER)),
):
    s = db.get(Store, sid)
    if not s:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    d = body.model_dump(exclude_unset=True)
    for field, attr in _FIELD_MAP:
        if field in d:
            setattr(s, attr, d[field])
    db.commit()
    return s.to_dict()
