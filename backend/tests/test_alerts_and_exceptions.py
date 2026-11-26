"""Reminders and escalations, data exceptions, and read-only roles."""
import datetime as dt
import uuid

import pytest

from app.auth import hash_password
from app.models import (
    ROLE_CLUSTER_HEAD, ROLE_HO_OPERATIONS, Audit, CashDepositPickup, CashReconciliation,
    ExpiredInventory, Issue, Notification, Store, User,
)
from app.services import alerts, next_audit_id
from app.services.alerts import run_alerts
from app.services.exceptions import store_exceptions


def _person(db, role, region=None, notify_email=None):
    name = uuid.uuid4().hex[:8]
    u = User(name=name, email=name, role=role, region=region, active=True, notify_email=notify_email,
             password_hash=hash_password("pw"))
    db.add(u)
    db.commit()
    return u


def _issue(db, user_ids, due, priority="Medium", status="Open"):
    i = Issue(id=f"T-{uuid.uuid4().hex[:6]}", store_id="T001", title="Fix it", priority=priority,
              status=status, assignee_id=user_ids["ae1@test"], due_date=due)
    db.add(i)
    db.commit()
    return i


def _notes(db, key):
    return db.query(Notification).filter(Notification.dedupe_key.contains(key)).all()


def _login(client, user):
    r = client.post("/api/auth/login", json={"email": user.email, "password": "pw"})
    return {"Authorization": "Bearer " + r.json()["token"]}


def test_critical_overdue_escalates_to_the_region_head_and_only_once(client, db, user_ids):
    store = db.get(Store, "T001")
    store.region = "North India"
    db.commit()
    head = _person(db, ROLE_CLUSTER_HEAD, "North India")
    other = _person(db, ROLE_CLUSTER_HEAD, "South India")
    ho = _person(db, ROLE_HO_OPERATIONS)
    issue = _issue(db, user_ids, dt.date.today() - dt.timedelta(days=3), "Critical")

    run_alerts(db)
    sent = {n.user_id for n in _notes(db, f"escalate:{issue.id}")}
    assert {head.id, ho.id, user_ids["manager@test"]} <= sent
    assert other.id not in sent
    db.refresh(issue)
    assert "Escalated to" in issue.meta["history"][-1]["reply"]

    before = len(_notes(db, issue.id))
    run_alerts(db)
    assert len(_notes(db, issue.id)) == before


def test_medium_overdue_goes_to_the_manager_only(client, db, user_ids):
    ho = _person(db, ROLE_HO_OPERATIONS)
    issue = _issue(db, user_ids, dt.date.today() - dt.timedelta(days=1))
    run_alerts(db)
    sent = {n.user_id for n in _notes(db, f"escalate:{issue.id}")}
    assert user_ids["manager@test"] in sent and ho.id not in sent


def test_assignee_is_reminded_before_and_after_the_due_date(client, db, user_ids):
    issue = _issue(db, user_ids, dt.date.today() + dt.timedelta(days=1))
    run_alerts(db)
    assert [n.user_id for n in _notes(db, f"issue:{issue.id}")] == [user_ids["ae1@test"]]
    run_alerts(db, today=dt.date.today() + dt.timedelta(days=3))
    assert len(_notes(db, f"issue:{issue.id}")) == 2


def test_finished_and_far_off_issues_stay_quiet(client, db, user_ids):
    late = dt.date.today() - dt.timedelta(days=5)
    done = _issue(db, user_ids, late, "Critical", status="Resolved")
    far = _issue(db, user_ids, dt.date.today() + dt.timedelta(days=30))
    run_alerts(db)
    assert not _notes(db, done.id) and not _notes(db, far.id)


def test_upcoming_audit_reminds_the_auditor_and_store_manager(client, db, user_ids):
    aid = next_audit_id(db)
    db.add(Audit(id=aid, store_id="T001", auditor_id=user_ids["auditor1@test"], status="Planned",
                 scheduled_at=dt.datetime.now() + dt.timedelta(days=1)))
    db.commit()
    run_alerts(db)
    sent = {n.user_id for n in _notes(db, f"audit:{aid}")}
    assert sent == {user_ids["auditor1@test"], db.get(Store, "T001").manager_id}


def test_mail_goes_out_only_to_people_with_an_address(client, db, user_ids, monkeypatch):
    mailed = []
    monkeypatch.setenv("SMTP_HOST", "mail.test")
    monkeypatch.setattr(alerts.smtplib, "SMTP", lambda *a, **k: _FakeSmtp(mailed))
    with_mail = _person(db, ROLE_HO_OPERATIONS, notify_email="ho@example.com")
    _person(db, ROLE_HO_OPERATIONS)
    issue = _issue(db, user_ids, dt.date.today() - dt.timedelta(days=1), "Critical")
    run_alerts(db)
    assert {m["To"] for m in mailed} == {"ho@example.com"}
    assert [n for n in _notes(db, issue.id) if n.user_id == with_mail.id][0].emailed_at


class _FakeSmtp:
    def __init__(self, mailed):
        self.mailed = mailed

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self):
        pass

    def send_message(self, msg):
        self.mailed.append(msg)


def test_failed_mail_does_not_stop_the_alert(client, db, user_ids, monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "mail.test")

    def boom(*a, **k):
        raise OSError("no route")

    monkeypatch.setattr(alerts.smtplib, "SMTP", boom)
    u = _person(db, ROLE_HO_OPERATIONS, notify_email="ho2@example.com")
    issue = _issue(db, user_ids, dt.date.today() - dt.timedelta(days=1), "Critical")
    run_alerts(db)
    note = [n for n in _notes(db, issue.id) if n.user_id == u.id][0]
    assert note.emailed_at is None


def test_bell_lists_my_alerts_and_read_clears_them(client, db, tokens, user_ids):
    _issue(db, user_ids, dt.date.today() + dt.timedelta(days=1))
    r = client.post("/api/notifications/run", headers=tokens["manager"])
    assert r.status_code == 200, r.text
    mine = client.get("/api/notifications", headers=tokens["ae1"]).json()
    assert mine
    nid = mine[0]["id"]
    assert client.post(f"/api/notifications/{nid}/read", headers=tokens["ae2"]).status_code == 404
    assert client.post(f"/api/notifications/{nid}/read", headers=tokens["ae1"]).status_code == 204
    assert nid not in [n["id"] for n in client.get("/api/notifications", headers=tokens["ae1"]).json()]


def test_only_managers_can_run_alerts(client, tokens):
    assert client.post("/api/notifications/run", headers=tokens["auditor1"]).status_code == 403


def test_cluster_head_sees_their_region_read_only(client, db, tokens, user_ids):
    store = db.get(Store, "T001")
    store.region = "North India"
    db.commit()
    issue = _issue(db, user_ids, dt.date.today())
    near = _login(client, _person(db, ROLE_CLUSTER_HEAD, "North India"))
    far = _login(client, _person(db, ROLE_CLUSTER_HEAD, "South India"))

    assert issue.id in [i["id"] for i in client.get("/api/issues", headers=near).json()]
    assert issue.id not in [i["id"] for i in client.get("/api/issues", headers=far).json()]
    r = client.put(f"/api/issues/{issue.id}", headers=near, json={"status": "Closed"})
    assert r.status_code == 403


def test_exceptions_find_the_rule_breakers_only(client, db):
    review = dt.date(2026, 6, 1)
    db.add_all([
        CashReconciliation(store_id="T002", difference=-2500, remarks="Short at tills"),
        CashReconciliation(store_id="T002", difference=0),
        CashReconciliation(store_id="T002", difference=200),
        CashDepositPickup(store_id="T002", handover_delay_days=4, difference=0),
        CashDepositPickup(store_id="T002", handover_delay_days=2, difference=0),
        ExpiredInventory(store_id="T002", article_description="Milk", expiry_date=dt.date(2026, 5, 1),
                         review_date=review, quantity=6),
        ExpiredInventory(store_id="T002", article_description="Rice", expiry_date=dt.date(2026, 9, 1),
                         review_date=review, quantity=6),
    ])
    db.commit()
    rows = store_exceptions(db, {"T002"})
    assert [r["title"] for r in rows] == [
        "Cash difference of Rs. 2,500", "Expired stock: Milk",
        "Cash handed over 4 days late", "Cash difference of Rs. 200"]
    assert rows[0]["severity"] == "High" and rows[0]["detail"] == "Short at tills"
    assert store_exceptions(db, {"T003-none"}) == []


def test_exceptions_are_scoped_by_role(client, db, tokens):
    db.add(CashReconciliation(store_id="T001", difference=500))
    db.commit()
    assert client.get("/api/exceptions?store_id=T001", headers=tokens["sm1"]).json()
    assert client.get("/api/exceptions?store_id=T001", headers=tokens["sm2"]).json() == []
    assert client.get("/api/exceptions", headers=tokens["ae1"]).status_code == 403


@pytest.mark.parametrize("role", [ROLE_CLUSTER_HEAD, ROLE_HO_OPERATIONS])
def test_admin_can_create_the_new_roles(client, tokens, role):
    name = uuid.uuid4().hex[:8]
    r = client.post("/api/admin/users", headers=tokens["admin"], json={
        "name": name, "email": name, "password": "pw", "role": role, "notify_email": "a@b.co"})
    assert r.status_code == 201, r.text
    assert r.json()["notify_email"] == "a@b.co"
