from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user, get_staff_user, require_roles
from ..db import get_db
from ..models import (
    ROLE_ADMIN, ROLE_AUDIT_MANAGER, ROLE_AUDITEE, ROLE_STORE_MANAGER, Brand, Store, User,
    UserStore,
)
from ..schemas import StoreCreate, StoreUpdate
from ..services import get_or_create_brand, linked_auditee_ids, log_action

router = APIRouter(prefix="/api/stores", tags=["stores"])

_FIELD_MAP = [
    ("name", "name"), ("city", "city"), ("region", "region"),
    ("format", "store_format"), ("type", "store_type"),
    ("status", "status"), ("manager_id", "manager_id"),
    ("contact", "contact"), ("email", "email"), ("address", "address"),
    ("brand_id", "brand_id"),
]


def _check_brand(db, brand_id):
    if not db.get(Brand, brand_id):
        raise HTTPException(status_code=400, detail={"error": "unknown brand"})


@router.get("")
def list_stores(
    status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Store)
    if user.role == ROLE_STORE_MANAGER:
        q = q.filter(Store.manager_id == user.id)
    elif user.role == ROLE_AUDITEE:
        q = q.filter(Store.id.in_(
            db.query(UserStore.store_id).filter(UserStore.user_id == user.id)))
    if status:
        q = q.filter(Store.status == status)
    return [s.to_dict() for s in q.all()]


@router.post("", status_code=201)
def create_store(
    body: StoreCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    d = body.model_dump()
    if db.get(Store, d["id"]):
        raise HTTPException(status_code=409, detail={"error": "store id already exists"})
    if d.get("brand_id"):
        _check_brand(db, d["brand_id"])
        brand_id = d["brand_id"]
    else:
        brand_id = get_or_create_brand(db, None).id
    s = Store(
        id=d["id"], brand_id=brand_id, name=d["name"], city=d.get("city"), region=d.get("region"),
        store_format=d.get("format"), store_type=d.get("type"),
        status=d.get("status", "Operating"), manager_id=d.get("manager_id"),
        contact=d.get("contact"), email=d.get("email"),
        address=d.get("address"), meta=d.get("meta", {}),
    )
    db.add(s)
    log_action(db, user.id, "create_store", "store", s.id, {"name": s.name})
    db.commit()
    return s.to_dict()


@router.put("/{sid}")
def update_store(
    sid: str,
    body: StoreUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    s = db.get(Store, sid)
    if not s:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    d = body.model_dump(exclude_unset=True)
    if "brand_id" in d:
        # A store always has a brand: null or blank is not a way to clear it.
        if not d["brand_id"]:
            raise HTTPException(status_code=400, detail={"error": "a store must belong to a brand"})
        _check_brand(db, d["brand_id"])
    for field, attr in _FIELD_MAP:
        if field in d:
            setattr(s, attr, d[field])
    log_action(db, user.id, "update_store", "store", s.id, {"fields": list(d.keys())})
    db.commit()
    return s.to_dict()


@router.get("/{sid}/auditees")
def store_auditees(
    sid: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_staff_user),
):
    """The auditees an issue at this store can be assigned to."""
    if not db.get(Store, sid):
        raise HTTPException(status_code=404, detail={"error": "not found"})
    ids = linked_auditee_ids(db, sid)
    people = db.query(User).filter(User.id.in_(ids)).order_by(User.name).all() if ids else []
    return [{"id": u.id, "name": u.name, "email": u.email} for u in people]
