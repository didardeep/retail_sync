from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import require_roles
from ..db import get_db
from ..models import ROLE_AUDIT_MANAGER, AuditLog, User

router = APIRouter(prefix="/api/audit-logs", tags=["audit-log"])


@router.get("")
def list_audit_logs(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER)),
):
    rows = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(500).all()
    return [row.to_dict() for row in rows]
