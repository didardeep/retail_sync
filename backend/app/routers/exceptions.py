from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import get_staff_user
from ..db import get_db
from ..models import ROLE_CLUSTER_HEAD, ROLE_STORE_MANAGER, Store, User
from ..services.exceptions import store_exceptions

router = APIRouter(prefix="/api/exceptions", tags=["exceptions"])


@router.get("")
def list_exceptions(
    store_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_staff_user),
):
    """Data analytics exceptions. A store manager sees their stores and a cluster
    head their region; auditors and managers see every store."""
    stores = None
    if user.role == ROLE_STORE_MANAGER:
        stores = {s.id for s in db.query(Store.id).filter(Store.manager_id == user.id)}
    elif user.role == ROLE_CLUSTER_HEAD:
        stores = {s.id for s in db.query(Store.id).filter(Store.region == user.region)}
    if store_id:
        stores = {store_id} if stores is None or store_id in stores else set()
    return store_exceptions(db, stores)
