"""JWT auth + role guards."""
import datetime as dt
import os

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from werkzeug.security import check_password_hash, generate_password_hash

from .db import get_db
from .models import User

SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
ALGO = "HS256"
TOKEN_HOURS = 12

_bearer = HTTPBearer(auto_error=False)


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
