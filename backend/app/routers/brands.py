from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import get_staff_user, require_roles
from ..db import get_db
from ..models import ROLE_ADMIN, ROLE_AUDIT_MANAGER, Brand, Store, User
from ..schemas import BrandCreate, BrandUpdate
from ..services import log_action

router = APIRouter(prefix="/api/brands", tags=["brands"])


def _clean_name(name):
    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail={"error": "brand name is required"})
    return name


BRAND_STATUSES = ("Active", "Inactive")
# Onboarding fields copied as they are (after trimming) from the request.
_DETAIL_FIELDS = ("code", "legal_name", "category", "contact_name", "contact_email",
                  "contact_phone", "notes")


def _apply_details(brand, d):
    for field in _DETAIL_FIELDS:
        if field in d:
            value = d[field]
            setattr(brand, field, value.strip() or None if isinstance(value, str) else value)
    if "regions" in d and d["regions"] is not None:
        brand.regions = list(dict.fromkeys(r.strip() for r in d["regions"] if r and r.strip()))
    if d.get("status") is not None:
        if d["status"] not in BRAND_STATUSES:
            raise HTTPException(status_code=400, detail={
                "error": f"status must be one of {', '.join(BRAND_STATUSES)}"})
        brand.status = d["status"]


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
    """Onboard a brand. Only the name is required; the rest are its details.
    The answer says what to do next: add the brand's first store."""
    name = _clean_name(body.name)
    _check_unique(db, name)
    brand = Brand(name=name, status="Active", regions=[])
    _apply_details(brand, body.model_dump())
    db.add(brand)
    db.flush()
    log_action(db, user.id, "create_brand", "brand", brand.id, {"name": name})
    db.commit()
    return {**brand.to_dict(), "next_step": "add_store"}


@router.get("/{bid}")
def get_brand(
    bid: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_staff_user),
):
    """One brand with its details and its stores."""
    brand = db.get(Brand, bid)
    if not brand:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    stores = db.query(Store).filter(Store.brand_id == bid).order_by(Store.name).all()
    return {**brand.to_dict(), "stores": [
        {"id": s.id, "name": s.name, "city": s.city, "region": s.region,
         "format": s.store_format, "type": s.store_type, "status": s.status} for s in stores]}


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
    d = body.model_dump(exclude_unset=True)
    _apply_details(brand, d)
    log_action(db, user.id, "update_brand", "brand", brand.id,
               {"name": brand.name, "fields": list(d.keys())})
    db.commit()
    return brand.to_dict()
