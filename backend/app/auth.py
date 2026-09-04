"""JWT auth + role guards."""
import datetime as dt
import os
from functools import wraps

import jwt
from flask import g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from .db import SessionLocal
from .models import User

SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
ALGO = "HS256"
TOKEN_HOURS = 12


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


def _current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    try:
        payload = jwt.decode(header[7:], SECRET, algorithms=[ALGO])
    except jwt.PyJWTError:
        return None
    return SessionLocal().get(User, payload["sub"])


def login_required(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        user = _current_user()
        if not user or not user.active:
            return jsonify({"error": "unauthorized"}), 401
        g.user = user
        return fn(*a, **kw)
    return wrapper


def roles_required(*allowed):
    """Guard an endpoint to specific roles. This is the single place role
    access is enforced — the frontend only hides UI, it does not secure it."""
    def decorator(fn):
        @wraps(fn)
        @login_required
        def wrapper(*a, **kw):
            if g.user.role not in allowed:
                return jsonify({"error": "forbidden", "required": list(allowed)}), 403
            return fn(*a, **kw)
        return wrapper
    return decorator
