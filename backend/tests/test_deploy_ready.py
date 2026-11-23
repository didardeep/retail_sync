"""What the site deployment depends on: the API process serves the built
website, writes the access log, runs strict in production, and can create the
first admin account."""
import logging
import os
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.models import ROLE_ADMIN, User
from app.request_log import LOGGER_NAME
from app.settings import LOG_DIR
from app.spa import mount_frontend
from create_admin import create_admins

BACKEND = Path(__file__).resolve().parents[1]
STRONG_SECRET = "x" * 48


# --------------------------------------------------------------------------
# The website is served by the same process
# --------------------------------------------------------------------------
@pytest.fixture()
def site(tmp_path):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "icons").mkdir()
    (dist / "index.html").write_text("<html>INDEX</html>")
    (dist / "assets" / "app-123.js").write_text("console.log('JS')")
    (dist / "sw.js").write_text("// SW")
    (dist / "icons" / "icon-192.png").write_bytes(b"PNG")
    (tmp_path / "secret.txt").write_text("TOP-SECRET")

    app = FastAPI()

    @app.get("/api/ping")
    def ping():
        return {"pong": True}

    assert mount_frontend(app, dist) is True
    return TestClient(app)


def test_root_and_client_routes_get_the_page(site):
    for path in ("/", "/audits/12", "/admin/users/5", "/login"):
        res = site.get(path)
        assert res.status_code == 200 and "INDEX" in res.text, path
    assert site.get("/").headers["cache-control"] == "no-cache"


def test_head_requests_work_for_monitors(site):
    assert site.head("/").status_code == 200
    assert site.head("/sw.js").status_code == 200


def test_assets_and_root_files_are_served(site):
    assert "JS" in site.get("/assets/app-123.js").text
    sw = site.get("/sw.js")
    assert "SW" in sw.text and sw.headers["cache-control"] == "no-cache"
    assert site.get("/icons/icon-192.png").content == b"PNG"


def test_api_wins_and_unknown_api_paths_are_not_the_page(site):
    assert site.get("/api/ping").json() == {"pong": True}
    res = site.get("/api/does-not-exist")
    assert res.status_code == 404 and "INDEX" not in res.text


def test_cannot_read_files_outside_the_build(site):
    for path in ("/../secret.txt", "/%2e%2e/secret.txt", "/..%2fsecret.txt"):
        assert "TOP-SECRET" not in site.get(path).text, path


def test_nothing_is_registered_without_a_build(tmp_path):
    app = FastAPI()
    assert mount_frontend(app, tmp_path / "missing") is False
    assert TestClient(app).get("/").status_code == 404


# --------------------------------------------------------------------------
# Access log
# --------------------------------------------------------------------------
def test_failed_login_is_logged_without_the_password(client):
    client.post("/api/auth/login", json={"email": "nobody@test", "password": "hunter2-secret"})
    for handler in logging.getLogger(LOGGER_NAME).handlers:
        handler.flush()
    text = (LOG_DIR / "app.log").read_text(encoding="utf-8")
    assert "401 POST /api/auth/login" in text
    assert "invalid credentials" in text
    assert "hunter2-secret" not in text


def test_writes_are_logged_with_who_did_them(client):
    token = client.post("/api/auth/login",
                        json={"email": "admin@test", "password": "test-password"}).json()["token"]
    client.post("/api/brands", json={"name": ""},
                headers={"Authorization": f"Bearer {token}"})
    for handler in logging.getLogger(LOGGER_NAME).handlers:
        handler.flush()
    text = (LOG_DIR / "app.log").read_text(encoding="utf-8")
    assert "POST /api/brands" in text and "ADMIN" in text


# --------------------------------------------------------------------------
# Production mode (a fresh interpreter, because settings are read at import)
# --------------------------------------------------------------------------
def _run(code, tmp_path, **env):
    full = dict(os.environ)
    full.update({"APP_ENV": "production", "DATABASE_URL": f"sqlite:///{tmp_path / 'p.db'}",
                 "LOG_DIR": str(tmp_path), "FRONTEND_DIST": str(tmp_path / "no-build")})
    full.update(env)
    return subprocess.run([sys.executable, "-c", code], cwd=BACKEND, env=full,
                          capture_output=True, text=True)


def test_production_starts_with_a_weak_secret_but_warns(tmp_path):
    # Not a hard stop for now (P2 in docs/TODOS-for-Production.md).
    for secret in ("dev-secret-change-me", "short"):
        res = _run("import app.auth; print('ok')", tmp_path, JWT_SECRET=secret)
        assert res.returncode == 0 and "ok" in res.stdout, res.stderr
        assert "JWT_SECRET" in res.stderr


def test_production_is_quiet_with_a_strong_secret(tmp_path):
    res = _run("import app.auth; print('ok')", tmp_path, JWT_SECRET=STRONG_SECRET)
    assert res.returncode == 0 and "ok" in res.stdout, res.stderr
    assert "JWT_SECRET" not in res.stderr


def test_production_closes_api_docs(tmp_path):
    code = ("from fastapi.testclient import TestClient; from app.main import app; "
            "c = TestClient(app); print(c.get('/docs').status_code, c.get('/openapi.json').status_code)")
    res = _run(code, tmp_path, JWT_SECRET=STRONG_SECRET)
    assert res.stdout.split()[-2:] == ["404", "404"], res.stderr


def test_production_cors_is_closed_unless_listed(tmp_path):
    code = ("from fastapi.testclient import TestClient; from app.main import app; "
            "r = TestClient(app).get('/api/health', headers={'Origin': 'https://evil.example'}); "
            "print('allow=' + str(r.headers.get('access-control-allow-origin')))")
    closed = _run(code, tmp_path, JWT_SECRET=STRONG_SECRET, CORS_ORIGINS="")
    assert "allow=None" in closed.stdout, closed.stderr

    code = code.replace("https://evil.example", "https://localhost")
    listed = _run(code, tmp_path, JWT_SECRET=STRONG_SECRET, CORS_ORIGINS="https://localhost")
    assert "allow=https://localhost" in listed.stdout, listed.stderr


# --------------------------------------------------------------------------
# First admin account
# --------------------------------------------------------------------------
def test_create_admin_makes_a_working_admin_once(client):
    db = SessionLocal()
    try:
        first = create_admins(db, [("Site-Admin", "site@example.com")])
        db.commit()
        login, password = first[0]
        assert login == "site-admin" and password

        again = create_admins(db, [("site-admin", "other@example.com")])
        assert again == [("site-admin", None)]
        user = db.query(User).filter_by(email="site-admin").one()
        assert user.role == ROLE_ADMIN and user.notify_email == "site@example.com"
    finally:
        db.close()

    res = client.post("/api/auth/login", json={"email": "site-admin", "password": password})
    assert res.status_code == 200 and res.json()["user"]["role"] == ROLE_ADMIN
