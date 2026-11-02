import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_roles
from ..db import get_db
from ..models import ROLE_ADMIN, ROLE_AUDIT_MANAGER, Notification, User
from ..services.alerts import run_alerts

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
def my_notifications(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """The signed-in person's unread alerts, newest first."""
    rows = db.query(Notification).filter(
        Notification.user_id == user.id, Notification.read_at.is_(None),
    ).order_by(Notification.created_at.desc()).limit(50).all()
    return [n.to_dict() for n in rows]


@router.post("/run")
def run_now(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    """Run the hourly reminders and escalations straight away."""
    return run_alerts(db)


@router.post("/{nid}/read", status_code=204)
def mark_read(nid: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    n = db.get(Notification, nid)
    if not n or n.user_id != user.id:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    n.read_at = dt.datetime.utcnow()
    db.commit()
