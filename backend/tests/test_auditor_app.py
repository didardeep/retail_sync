"""The Android app is for auditors only. The app marks every request with the
X-App-Client header; the server then refuses anyone who is not an auditor, at
sign-in and on every later request. The website sends no header and is unaffected."""
from app.auth import AUDITOR_APP, AUDITOR_APP_ONLY_MESSAGE
from app.db import SessionLocal
from app.models import AuditLog

PASSWORD = "test-password"
APP = {"X-App-Client": AUDITOR_APP}
NON_AUDITORS = ["manager@test", "admin@test", "sm1@test", "ae1@test"]


def _login(client, email, password=PASSWORD, headers=None):
    return client.post("/api/auth/login", json={"email": email, "password": password},
                       headers=headers or {})


def test_an_auditor_can_sign_in_from_the_app(client):
    res = _login(client, "auditor1@test", headers=APP)
    assert res.status_code == 200
    assert res.json()["user"]["role"] == "AUDITOR"


def test_everyone_else_is_refused_at_sign_in_from_the_app(client):
    for email in NON_AUDITORS:
        res = _login(client, email, headers=APP)
        assert res.status_code == 403, email
        assert res.json()["error"] == AUDITOR_APP_ONLY_MESSAGE
        assert "token" not in res.json()


def test_the_website_is_unaffected(client):
    for email in NON_AUDITORS + ["auditor1@test"]:
        assert _login(client, email).status_code == 200, email


def test_a_refused_app_sign_in_is_recorded(client):
    _login(client, "manager@test", headers=APP)
    db = SessionLocal()
    try:
        rows = db.query(AuditLog).filter_by(action="login_blocked_app").all()
        assert rows and rows[-1].details["role"] == "AUDIT_MANAGER"
    finally:
        db.close()


def test_a_wrong_password_is_still_a_plain_401_in_the_app(client):
    res = _login(client, "manager@test", password="nope", headers=APP)
    assert res.status_code == 401  # no hint that the account exists


def test_a_non_auditor_token_is_refused_everywhere_when_the_app_header_is_sent(client):
    token = _login(client, "manager@test").json()["token"]  # signed in on the website
    auth = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/auth/me", headers=auth).status_code == 200
    for path in ("/api/auth/me", "/api/stores", "/api/issues"):
        res = client.get(path, headers={**auth, **APP})
        assert res.status_code == 403, path
        assert res.json()["error"] == AUDITOR_APP_ONLY_MESSAGE


def test_an_auditor_token_works_in_the_app(client):
    token = _login(client, "auditor1@test", headers=APP).json()["token"]
    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}", **APP})
    assert res.status_code == 200 and res.json()["role"] == "AUDITOR"
