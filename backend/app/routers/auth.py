from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..auth import (
    AUDITOR_APP_ONLY_MESSAGE, blocked_in_auditor_app, get_current_user, make_token, verify_password,
)
from ..db import get_db
from ..models import User
from ..schemas import LoginRequest, LoginResponse
from ..services import log_action

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _client_details(request: Request) -> dict:
    """Where a login attempt came from, for the audit trail."""
    return {
        "ip": request.client.host if request.client else None,
        "user_agent": (request.headers.get("user-agent") or "")[:200],
    }


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    email = body.email.lower()
    user = db.query(User).filter_by(email=email).first()
    if not user or not verify_password(user, body.password):
        # The password is never logged, only who tried and from where.
        log_action(db, user.id if user else None, "login_failed", "user",
                   user.id if user else None,
                   {"email": email[:120], **_client_details(request)})
        db.commit()
        raise HTTPException(status_code=401, detail={"error": "invalid credentials"})
    if blocked_in_auditor_app(request, user):
        # Right password, wrong app: say so, and keep a record of the attempt.
        log_action(db, user.id, "login_blocked_app", "user", user.id,
                   {"role": user.role, **_client_details(request)})
        db.commit()
        raise HTTPException(status_code=403, detail={"error": AUDITOR_APP_ONLY_MESSAGE})
    log_action(db, user.id, "login", "user", user.id, _client_details(request))
    db.commit()
    return {"token": make_token(user), "user": user.to_dict()}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user.to_dict()
