from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_roles
from ..db import get_db
from ..models import ROLE_AUDIT_MANAGER, ROLE_AUDITOR, Observation, User
from ..schemas import ObservationCreate, ObservationUpdate

router = APIRouter(prefix="/api/observations", tags=["observations"])


@router.get("")
def list_observations(
    store_id: str | None = None,
    audit_id: str | None = None,
    risk: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Observation)
    if store_id:
        q = q.filter(Observation.store_id == store_id)
    if audit_id:
        q = q.filter(Observation.audit_id == audit_id)
    if risk:
        q = q.filter(Observation.risk == risk)
    if status:
        q = q.filter(Observation.status == status)
    return [o.to_dict() for o in q.order_by(Observation.sr_no).all()]


@router.post("", status_code=201)
def create_observation(
    body: ObservationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_AUDITOR)),
):
    last_sr = db.query(func.max(Observation.sr_no)).filter(
        Observation.audit_id == body.audit_id).scalar() or 0
    o = Observation(
        audit_id=body.audit_id, store_id=body.store_id,
        sr_no=body.sr_no if body.sr_no is not None else last_sr + 1,
        observation=body.observation, risk=body.risk,
        action_plan=body.action_plan,
        person_responsible=body.person_responsible,
        target=body.target, status=body.status,
    )
    db.add(o)
    db.commit()
    return o.to_dict()


@router.put("/{oid}")
def update_observation(
    oid: str,
    body: ObservationUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    o = db.get(Observation, oid)
    if not o:
        raise HTTPException(status_code=404, detail={"error": "not found"})
    d = body.model_dump(exclude_unset=True)
    for field in ("observation", "risk", "action_plan", "person_responsible",
                  "target", "status"):
        if field in d:
            setattr(o, field, d[field])
    db.commit()
    return o.to_dict()
