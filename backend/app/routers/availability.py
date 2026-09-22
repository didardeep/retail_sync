import datetime as dt

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_roles
from ..db import get_db
from ..models import ROLE_AUDIT_MANAGER, ROLE_AUDITOR, AuditorAvailability, User
from ..schemas import AvailabilityCreate

router = APIRouter(prefix="/api/availability", tags=["availability"])


@router.get("")
def list_availability(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(AuditorAvailability)
    if user.role == ROLE_AUDITOR:
        q = q.filter(AuditorAvailability.auditor_id == user.id)
    return [a.to_dict() for a in q.all()]


@router.post("", status_code=201)
def add_availability(
    body: AvailabilityCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_AUDITOR)),
):
    auditor_id = body.auditor_id if user.role == ROLE_AUDIT_MANAGER else user.id
    a = AuditorAvailability(
        auditor_id=auditor_id,
        from_date=dt.date.fromisoformat(body.from_date),
        to_date=dt.date.fromisoformat(body.to_date),
        reason=body.reason,
    )
    db.add(a)
    db.commit()
    return a.to_dict()
