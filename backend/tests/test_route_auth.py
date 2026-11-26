"""Every API route must refuse a request that has no login token.

New routes are covered automatically: the test walks app.routes. A route that
is meant to be public has to be added to PUBLIC below, which makes opening a
door a visible, reviewed change.
"""
import re

from fastapi.routing import APIRoute

from app.db import SessionLocal
from app.main import app
from app.models import AuditLog

PUBLIC = {
    ("POST", "/api/auth/login"),
    ("GET", "/api/health"),
    # The built website (app/spa.py). The browser needs the login page before it
    # has a token. It is only registered when frontend/dist exists, and it never
    # answers /api paths.
    ("GET", "/{path:path}"),
}


def _routes():
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        for method in sorted(route.methods - {"HEAD", "OPTIONS"}):
            yield method, route.path


def test_every_route_requires_a_token(client):
    open_routes = []
    for method, path in _routes():
        if (method, path) in PUBLIC:
            continue
        url = re.sub(r"\{[^}]+\}", "x", path)
        res = client.request(method, url)
        if res.status_code != 401:
            open_routes.append(f"{method} {path} -> {res.status_code}")
    assert not open_routes, "routes reachable without a token:\n" + "\n".join(open_routes)


def test_garbage_token_is_refused(client):
    res = client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-token"})
    assert res.status_code == 401


def test_login_and_failed_login_are_logged(client):
    def count(action):
        db = SessionLocal()
        try:
            return db.query(AuditLog).filter_by(action=action).count()
        finally:
            db.close()

    ok_before, bad_before = count("login"), count("login_failed")
    assert client.post("/api/auth/login",
                       json={"email": "manager@test", "password": "test-password"}).status_code == 200
    assert client.post("/api/auth/login",
                       json={"email": "manager@test", "password": "wrong"}).status_code == 401
    assert client.post("/api/auth/login",
                       json={"email": "nobody@test", "password": "wrong"}).status_code == 401

    assert count("login") == ok_before + 1
    assert count("login_failed") == bad_before + 2

    # The password must never reach the log.
    db = SessionLocal()
    try:
        rows = db.query(AuditLog).filter_by(action="login_failed").all()
        assert all("wrong" not in str(r.details) for r in rows)
    finally:
        db.close()
