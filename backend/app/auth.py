"""JWT auth + role guards."""
import datetime as dt
import logging
import os

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from werkzeug.security import check_password_hash, generate_password_hash

from .db import get_db
from .models import ROLE_AUDITEE, ROLE_AUDITOR, User
from .settings import IS_PROD

DEFAULT_SECRET = "dev-secret-change-me"
RECOMMENDED_SECRET_LENGTH = 32
SECRET = os.getenv("JWT_SECRET", DEFAULT_SECRET)
# Anyone who knows the secret can forge a login for any user. For now this only
# warns, so a site install is never blocked by it; making it a hard stop in
# production is tracked as P2 in docs/TODOS-for-Production.md. Generate a good
# one with:  python -c "import secrets; print(secrets.token_urlsafe(48))"
if SECRET == DEFAULT_SECRET:
    logging.getLogger(__name__).warning(
        "JWT_SECRET is not set: using the built-in development secret. "
        "Set JWT_SECRET in backend/.env before real use.")
elif IS_PROD and len(SECRET) < RECOMMENDED_SECRET_LENGTH:
    logging.getLogger(__name__).warning(
        "JWT_SECRET is shorter than %d characters. A long random value is safer.",
        RECOMMENDED_SECRET_LENGTH)
ALGO = "HS256"
TOKEN_HOURS = 12

_bearer = HTTPBearer(auto_error=False)

# The Android app is for auditors only. It marks every request with this header
# (frontend/src/lib/appClient.js). The server then refuses anyone who is not an
# auditor, at sign-in and on every later request, so a manager's token cannot be
# used from the phone app either. The website does not send the header.
APP_CLIENT_HEADER = "x-app-client"
AUDITOR_APP = "auditor-app"
AUDITOR_APP_ONLY_MESSAGE = "This app is for auditors. Please use the website."


def blocked_in_auditor_app(request: Request, user: User) -> bool:
    return request.headers.get(APP_CLIENT_HEADER) == AUDITOR_APP and user.role != ROLE_AUDITOR


def hash_password(pw: str) -> str:
    return generate_password_hash(pw)


def verify_password(user: User, pw: str) -> bool:
    return check_password_hash(user.password_hash, pw)


def make_token(user: User) -> str:
    payload = {
        "sub": user.id,
        "role": user.role,
        "name": user.name,
        "exp": dt.datetime.utcnow() + dt.timedelta(hours=TOKEN_HOURS),
    }
    return jwt.encode(payload, SECRET, algorithm=ALGO)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail={"error": "unauthorized"})
    try:
        payload = jwt.decode(credentials.credentials, SECRET, algorithms=[ALGO])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail={"error": "unauthorized"})
    user = db.get(User, payload["sub"])
    if not user or not user.active:
        raise HTTPException(status_code=401, detail={"error": "unauthorized"})
    if blocked_in_auditor_app(request, user):
        raise HTTPException(status_code=403, detail={"error": AUDITOR_APP_ONLY_MESSAGE})
    return user


def require_roles(*allowed):
    """Guard an endpoint to specific roles. This is the single place role
    access is enforced — the frontend only hides UI, it does not secure it."""
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(
                status_code=403,
                detail={"error": "forbidden", "required": list(allowed)},
            )
        return user
    return dependency


def get_staff_user(user: User = Depends(get_current_user)) -> User:
    """Any signed-in user except an auditee. Auditees only work with the issues
    assigned to them, so the audit, score and store data stays closed to them."""
    if user.role == ROLE_AUDITEE:
        raise HTTPException(status_code=403, detail={"error": "forbidden"})
    return user
