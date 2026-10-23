from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import get_staff_user, require_roles
from ..db import get_db
from ..models import ROLE_ADMIN, ROLE_AUDIT_MANAGER, Brand, User
from ..schemas import BrandCreate, BrandUpdate
from ..services import log_action

router = APIRouter(prefix="/api/brands", tags=["brands"])


def _clean_name(name):
    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail={"error": "brand name is required"})
    return name


def _check_unique(db, name, exclude_id=None):
    q = db.query(Brand).filter(func.lower(Brand.name) == name.lower())
    if exclude_id:
        q = q.filter(Brand.id != exclude_id)
    if q.first():
        raise HTTPException(status_code=409, detail={"error": "brand name already exists"})


@router.get("")
def list_brands(
    db: Session = Depends(get_db),
    user: User = Depends(get_staff_user),
):
    return [b.to_dict() for b in db.query(Brand).order_by(Brand.name).all()]


@router.post("", status_code=201)
def create_brand(
    body: BrandCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    name = _clean_name(body.name)
    _check_unique(db, name)
    brand = Brand(name=name)
    db.add(brand)
    db.flush()
    log_action(db, user.id, "create_brand", "brand", brand.id, {"name": name})
    db.commit()
    return brand.to_dict()


@router.put("/{bid}")
def update_brand(
    bid: str,
    body: BrandUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    brand = db.get(Brand, bid)
    if not brand:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    if body.name is not None:
        name = _clean_name(body.name)
        _check_unique(db, name, exclude_id=bid)
        brand.name = name
    log_action(db, user.id, "update_brand", "brand", brand.id, {"name": brand.name})
    db.commit()
    return brand.to_dict()
