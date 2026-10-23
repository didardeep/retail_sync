"""Test setup: a throwaway SQLite database, built by the real migrations.

DATABASE_URL must be set before the app is imported, because app/db.py reads
it at import time. That is why the app imports sit below the environment line.
"""
import os
import tempfile
import uuid
from pathlib import Path

_TMP = tempfile.mkdtemp(prefix="retail_sync_tests_")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_TMP, 'test.db').as_posix()}"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.auth import hash_password  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    ROLE_ADMIN, ROLE_AUDIT_MANAGER, ROLE_AUDITEE, ROLE_AUDITOR, ROLE_STORE_MANAGER, Brand,
    Store, User, UserStore,
)

PASSWORD = "test-password"


def _user(db, email, name, role):
    user = User(name=name, email=email, role=role, active=True,
                password_hash=hash_password(PASSWORD))
    db.add(user)
    db.flush()
    return user


@pytest.fixture(scope="session")
def client():
    """App started inside a context manager so the startup migrations run."""
    with TestClient(app) as c:
        db = SessionLocal()
        try:
            _user(db, "manager@test", "Manager", ROLE_AUDIT_MANAGER)
            _user(db, "admin@test", "Admin", ROLE_ADMIN)
            _user(db, "auditor1@test", "Auditor One", ROLE_AUDITOR)
            _user(db, "auditor2@test", "Auditor Two", ROLE_AUDITOR)
            sm1 = _user(db, "sm1@test", "Store Manager One", ROLE_STORE_MANAGER)
            _user(db, "sm2@test", "Store Manager Two", ROLE_STORE_MANAGER)
            ae1 = _user(db, "ae1@test", "Auditee One", ROLE_AUDITEE)
            ae2 = _user(db, "ae2@test", "Auditee Two", ROLE_AUDITEE)
            brand_a = Brand(id="BRA", name="Alpha Mart")
            brand_b = Brand(id="BRB", name="Beta Bazaar")
            db.add_all([brand_a, brand_b])
            db.flush()
            db.add(Store(id="T001", name="Test Store 1", city="Delhi",
                         region="North India", manager_id=sm1.id, brand_id=brand_a.id))
            db.add(Store(id="T002", name="Test Store 2", city="Pune",
                         region="West India", brand_id=brand_b.id))
            db.flush()
            # ae1 is linked to T001 only; ae2 to T002 only.
            db.add(UserStore(user_id=ae1.id, store_id="T001"))
            db.add(UserStore(user_id=ae2.id, store_id="T002"))
            db.commit()
        finally:
            db.close()
        yield c


@pytest.fixture(scope="session")
def tokens(client):
    out = {}
    for key, email in {
        "manager": "manager@test", "admin": "admin@test", "auditor1": "auditor1@test",
        "auditor2": "auditor2@test", "sm1": "sm1@test", "sm2": "sm2@test",
        "ae1": "ae1@test", "ae2": "ae2@test",
    }.items():
        r = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
        assert r.status_code == 200, r.text
        out[key] = {"Authorization": "Bearer " + r.json()["token"]}
    return out


@pytest.fixture()
def db(client):
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="session")
def user_ids(client):
    db = SessionLocal()
    try:
        return {u.email: u.id for u in db.query(User).all()}
    finally:
        db.close()


def new_id():
    return str(uuid.uuid4())
