"""Behaviour added by the Step 0 groundwork: shared booking rules and the
single migration head."""
import datetime as dt
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from app.models import AuditorAvailability


def test_only_one_migration_head():
    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    cfg.set_main_option("script_location",
                        str(Path(__file__).resolve().parents[1] / "migrations"))
    assert len(ScriptDirectory.from_config(cfg).get_heads()) == 1


def test_booking_rules_refuse_a_second_store_on_the_same_day(client, tokens, user_ids):
    auditor = user_ids["auditor2@test"]
    day = dt.datetime(2031, 4, 7, 9, 0)
    schedule = lambda store: client.post("/api/audits", headers=tokens["manager"], json={
        "store_id": store, "scheduled_at": day.isoformat(), "auditor_id": auditor})

    assert schedule("T001").status_code == 201
    clash = schedule("T002")                       # same day, different store
    assert clash.status_code == 409
    assert clash.json()["error"] == "auditor already booked"
    # the message can say where and when, not just quote an id
    assert clash.json()["store"] == "Test Store 1"
    assert clash.json()["scheduled_at"].startswith("2031-04-07T09:00")
    assert schedule("T001").status_code == 201     # same store, same day: allowed


def test_blocked_dates_are_refused(client, tokens, db, user_ids):
    auditor = user_ids["auditor1@test"]
    db.add(AuditorAvailability(auditor_id=auditor, from_date=dt.date(2031, 5, 1),
                               to_date=dt.date(2031, 5, 3), reason="Leave"))
    db.commit()
    r = client.post("/api/audits", headers=tokens["manager"], json={
        "store_id": "T001", "scheduled_at": "2031-05-02T09:00:00", "auditor_id": auditor})
    assert r.status_code == 409
    assert r.json() == {"error": "auditor unavailable", "reason": "Leave"}


def test_conflict_check_reports_a_clash_without_failing(client, tokens, user_ids):
    auditor = user_ids["auditor1@test"]
    r = client.post("/api/audits", headers=tokens["manager"], json={
        "store_id": "T001", "scheduled_at": "2031-06-02T09:00:00", "auditor_id": auditor})
    assert r.status_code == 201, r.text
    url = f"/api/audits/conflicts?auditor_id={auditor}&date=2031-06-02&store_id=T002"
    got = client.get(url, headers=tokens["manager"])
    assert got.status_code == 200
    assert got.json()["conflict"]["error"] == "auditor already booked"
    same_store = client.get(url.replace("T002", "T001"), headers=tokens["manager"])
    assert same_store.json()["conflict"] is None
    assert client.get(url, headers=tokens["auditor1"]).status_code == 403
