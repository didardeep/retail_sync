"""Admin router — user management (create, list, update, deactivate).
Only accessible by ROLE_ADMIN users.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user, hash_password, require_roles
from ..db import get_db
from ..models import ROLE_ADMIN, ROLE_AUDIT_MANAGER, ROLE_AUDITOR, ROLE_STORE_MANAGER, Store, User
from ..schemas import UserCreate, UserUpdate
from ..services import log_action

router = APIRouter(prefix="/api/admin", tags=["admin"])

# Roles that the admin is allowed to create/manage (not ADMIN itself)
_MANAGEABLE_ROLES = {ROLE_AUDIT_MANAGER, ROLE_AUDITOR, ROLE_STORE_MANAGER}


def _user_dict(user: User, db: Session) -> dict:
    d = user.to_dict()
    if user.role == ROLE_STORE_MANAGER:
        store = db.query(Store).filter_by(manager_id=user.id).first()
        d["store_id"] = store.id if store else None
        d["store_name"] = store.name if store else None
    else:
        d["store_id"] = None
        d["store_name"] = None
    return d


@router.get("/users")
def list_users(
    role: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_ADMIN)),
):
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    return [_user_dict(u, db) for u in q.order_by(User.name).all()]


@router.post("/users", status_code=201)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_ADMIN)),
):
    if body.role not in _MANAGEABLE_ROLES:
        raise HTTPException(status_code=400, detail={"error": f"role must be one of: {sorted(_MANAGEABLE_ROLES)}"})

    email = body.email.strip().lower()
    if db.query(User).filter_by(email=email).first():
        raise HTTPException(status_code=409, detail={"error": "email already in use"})

    new_user = User(
        name=body.name.strip(),
        email=email,
        password_hash=hash_password(body.password),
        role=body.role,
        designation=body.designation,
        region=body.region,
        active=True,
    )
    db.add(new_user)
    db.flush()  # get new_user.id

    # Auto-assign as store manager if store_id provided
    if body.role == ROLE_STORE_MANAGER and body.store_id:
        store = db.get(Store, body.store_id)
        if not store:
            raise HTTPException(status_code=404, detail={"error": "store not found"})
        store.manager_id = new_user.id

    log_action(db, user.id, "create_user", "user", new_user.id,
               {"email": email, "role": body.role})
    db.commit()
    return _user_dict(new_user, db)


@router.patch("/users/{uid}")
def update_user(
    uid: str,
    body: UserUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_ADMIN)),
):
    target = db.get(User, uid)
    if not target:
        raise HTTPException(status_code=404, detail={"error": "user not found"})

    d = body.model_dump(exclude_unset=True)

    if "name" in d:
        target.name = d["name"].strip()
    if "email" in d:
        email = d["email"].strip().lower()
        existing = db.query(User).filter_by(email=email).first()
        if existing and existing.id != uid:
            raise HTTPException(status_code=409, detail={"error": "email already in use"})
        target.email = email
    if "designation" in d:
        target.designation = d["designation"]
    if "region" in d:
        target.region = d["region"]
    if "active" in d:
        target.active = d["active"]
    if "password" in d and d["password"]:
        target.password_hash = hash_password(d["password"])

    # Handle store reassignment for STORE_MANAGER
    if "store_id" in d and target.role == ROLE_STORE_MANAGER:
        # Clear old store assignment
        old_store = db.query(Store).filter_by(manager_id=uid).first()
        if old_store:
            old_store.manager_id = None
        # Set new store assignment
        if d["store_id"]:
            new_store = db.get(Store, d["store_id"])
            if not new_store:
                raise HTTPException(status_code=404, detail={"error": "store not found"})
            new_store.manager_id = uid

    log_action(db, user.id, "update_user", "user", uid, {"fields": list(d.keys())})
    db.commit()
    return _user_dict(target, db)
