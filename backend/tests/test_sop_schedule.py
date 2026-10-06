"""SOP scheduling: manager books a tool for an auditor, the auditor sees it,
the first save starts it, and a manager can reschedule or cancel while it is
still Planned. Also the classic audit PATCH / cancel endpoints."""
import datetime as dt
import itertools

from app.models import AuditLog, AuditorAvailability, User

# Every test books on its own day so tests cannot clash with each other.
_DAYS = itertools.count(0)


def _day():
    return dt.date(2032, 1, 1) + dt.timedelta(days=next(_DAYS))


def _when(day, hour=10):
    return dt.datetime.combine(day, dt.time(hour)).isoformat()


def _schedule(client, tokens, user_ids, day, store="T001", auditor="auditor1@test",
              code="CASH", hour=10, **extra):
    body = {"template_code": code, "store_id": store,
            "auditor_id": user_ids[auditor], "scheduled_at": _when(day, hour)}
    body.update(extra)
    return client.post("/api/sop-schedule", headers=tokens["manager"], json=body)


def _classic(client, tokens, user_ids, day, store="T001", auditor="auditor1@test"):
    return client.post("/api/audits", headers=tokens["manager"], json={
        "store_id": store, "scheduled_at": _when(day),
        "auditor_id": user_ids[auditor]})


def test_schedule_creates_planned_audit(client, tokens, user_ids):
    day = _day()
    r = _schedule(client, tokens, user_ids, day, notes="Bring the till report")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "Planned"
    assert body["scheduled_at"].startswith(day.isoformat())
    assert body["notes"] == "Bring the till report"
    assert body["template_code"] == "CASH" and body["created_by"] == "Manager"
    assert body["auditor_id"] == user_ids["auditor1@test"]


def test_only_manager_can_schedule(client, tokens, user_ids):
    r = client.post("/api/sop-schedule", headers=tokens["auditor1"], json={
        "template_code": "CASH", "store_id": "T001",
        "auditor_id": user_ids["auditor1@test"], "scheduled_at": _when(_day())})
    assert r.status_code == 403


def test_unknown_inputs_are_rejected(client, tokens, user_ids):
    assert _schedule(client, tokens, user_ids, _day(), code="NOPE").status_code == 422
    assert _schedule(client, tokens, user_ids, _day(), store="ZZZ").status_code == 422
    # a store manager is not an auditor
    r = _schedule(client, tokens, user_ids, _day(), auditor="sm1@test")
    assert r.status_code == 422
    r = client.post("/api/sop-schedule", headers=tokens["manager"], json={
        "template_code": "CASH", "store_id": "T001",
        "auditor_id": user_ids["auditor1@test"], "scheduled_at": "not a date"})
    assert r.status_code == 422


def test_inactive_auditor_is_rejected(client, tokens, user_ids, db):
    user = db.get(User, user_ids["auditor2@test"])
    user.active = False
    db.commit()
    try:
        r = _schedule(client, tokens, user_ids, _day(), auditor="auditor2@test")
        assert r.status_code == 422
    finally:
        user.active = True
        db.commit()


def test_unavailable_auditor_is_409(client, tokens, user_ids, db):
    day = _day()
    block = AuditorAvailability(auditor_id=user_ids["auditor1@test"],
                                from_date=day, to_date=day, reason="Leave")
    db.add(block)
    db.commit()
    try:
        r = _schedule(client, tokens, user_ids, day)
        assert r.status_code == 409
        assert r.json()["error"] == "auditor unavailable"
    finally:
        db.delete(block)
        db.commit()


def test_booked_sop_vs_sop_is_409_but_same_store_is_fine(client, tokens, user_ids):
    day = _day()
    first = _schedule(client, tokens, user_ids, day, store="T001", code="CASH")
    assert first.status_code == 200
    clash = _schedule(client, tokens, user_ids, day, store="T002", code="FMCG")
    assert clash.status_code == 409
    detail = clash.json()
    assert detail["error"] == "auditor already booked"
    assert detail["audit_id"] == first.json()["id"] and detail["kind"] == "sop"
    # same store, same day: Cash and FMCG in one visit
    assert _schedule(client, tokens, user_ids, day, store="T001",
                     code="FMCG").status_code == 200
    # another auditor is free
    assert _schedule(client, tokens, user_ids, day, store="T002",
                     auditor="auditor2@test").status_code == 200


def test_booked_across_kinds(client, tokens, user_ids):
    day = _day()
    classic = _classic(client, tokens, user_ids, day, store="T001")
    assert classic.status_code == 201, classic.text
    r = _schedule(client, tokens, user_ids, day, store="T002")
    assert r.status_code == 409 and r.json()["kind"] == "legacy"

    day2 = _day()
    sop = _schedule(client, tokens, user_ids, day2, store="T001")
    assert sop.status_code == 200
    r = _classic(client, tokens, user_ids, day2, store="T002")
    assert r.status_code == 409 and r.json()["kind"] == "sop"


def test_conflicts_endpoint(client, tokens, user_ids):
    day = _day()
    sop = _schedule(client, tokens, user_ids, day, store="T001").json()
    url = "/api/sop-schedule/conflicts"
    params = {"auditor_id": user_ids["auditor1@test"], "date": day.isoformat(),
              "store_id": "T002"}
    r = client.get(url, headers=tokens["manager"], params=params)
    assert r.status_code == 200
    assert r.json()["conflict"]["audit_id"] == sop["id"]
    params["store_id"] = "T001"
    assert client.get(url, headers=tokens["manager"], params=params).json() == {
        "conflict": None}
    params.update(store_id="T002", exclude_sop_id=sop["id"])
    assert client.get(url, headers=tokens["manager"], params=params).json() == {
        "conflict": None}
    assert client.get(url, headers=tokens["auditor1"], params=params).status_code == 403


def test_auditor_sees_planned_and_first_save_starts_it(client, tokens, user_ids, cash):
    day = _day()
    audit = _schedule(client, tokens, user_ids, day).json()
    mine = client.get("/api/sop-audits", headers=tokens["auditor1"]).json()
    assert audit["id"] in [a["id"] for a in mine]
    planned = client.get("/api/sop-audits?status=Planned",
                         headers=tokens["auditor1"]).json()
    found = [a for a in planned if a["id"] == audit["id"]]
    assert found and found[0]["scheduled_at"].startswith(day.isoformat())
    # another auditor does not see it
    other = client.get("/api/sop-audits", headers=tokens["auditor2"]).json()
    assert audit["id"] not in [a["id"] for a in other]

    crit = cash["criteria"][0]
    r = client.put(f"/api/sop-audits/{audit['id']}", headers=tokens["auditor1"], json={
        "template_id": audit["template_id"], "store_id": "T001",
        "scores": [{"criterion_id": crit.id, "score": crit.marks}]})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "Draft"


def test_store_manager_cannot_see_planned(client, tokens, user_ids):
    audit = _schedule(client, tokens, user_ids, _day(), store="T001").json()
    rows = client.get("/api/sop-audits", headers=tokens["sm1"]).json()
    assert audit["id"] not in [a["id"] for a in rows]
    assert client.get(f"/api/sop-audits/{audit['id']}",
                      headers=tokens["sm1"]).status_code == 404


def test_reschedule_and_reassign(client, tokens, user_ids):
    day, later = _day(), _day()
    audit = _schedule(client, tokens, user_ids, day).json()
    url = f"/api/sop-schedule/{audit['id']}"

    # moving within the same day does not clash with the audit itself
    r = client.patch(url, headers=tokens["manager"],
                     json={"scheduled_at": _when(day, 15)})
    assert r.status_code == 200, r.text
    assert r.json()["scheduled_at"].startswith(f"{day.isoformat()}T15")

    r = client.patch(url, headers=tokens["manager"], json={
        "scheduled_at": _when(later), "auditor_id": user_ids["auditor2@test"],
        "notes": "moved"})
    assert r.status_code == 200
    body = r.json()
    assert body["auditor_id"] == user_ids["auditor2@test"]
    assert body["scheduled_at"].startswith(later.isoformat()) and body["notes"] == "moved"

    # the old auditor no longer sees it, the new one does
    old = client.get("/api/sop-audits", headers=tokens["auditor1"]).json()
    new = client.get("/api/sop-audits", headers=tokens["auditor2"]).json()
    assert audit["id"] not in [a["id"] for a in old]
    assert audit["id"] in [a["id"] for a in new]

    # reassigning onto a booked day is refused
    busy = _schedule(client, tokens, user_ids, later, store="T002",
                     auditor="auditor1@test").json()
    r = client.patch(url, headers=tokens["manager"], json={
        "auditor_id": user_ids["auditor1@test"], "store_id": "T001"})
    assert r.status_code == 409 and r.json()["audit_id"] == busy["id"]
    assert client.patch(url, headers=tokens["auditor2"],
                        json={"notes": "x"}).status_code == 403


def test_cancel_rules(client, tokens, user_ids, cash):
    planned = _schedule(client, tokens, user_ids, _day()).json()
    r = client.post(f"/api/sop-schedule/{planned['id']}/cancel", headers=tokens["manager"])
    assert r.status_code == 200 and r.json()["status"] == "Cancelled"
    # already cancelled
    assert client.post(f"/api/sop-schedule/{planned['id']}/cancel",
                       headers=tokens["manager"]).status_code == 409
    # the auditor cannot save onto a cancelled audit
    r = client.put(f"/api/sop-audits/{planned['id']}", headers=tokens["auditor1"], json={
        "template_id": planned["template_id"], "store_id": "T001", "scores": []})
    assert r.status_code == 409
    # and a cancelled audit no longer blocks the day
    again = _schedule(client, tokens, user_ids,
                      dt.date.fromisoformat(planned["scheduled_at"][:10]), store="T002")
    assert again.status_code == 200

    draft = _schedule(client, tokens, user_ids, _day()).json()
    crit = cash["criteria"][0]
    client.put(f"/api/sop-audits/{draft['id']}", headers=tokens["auditor1"], json={
        "template_id": draft["template_id"], "store_id": "T001",
        "scores": [{"criterion_id": crit.id, "score": crit.marks}]})
    assert client.post(f"/api/sop-schedule/{draft['id']}/cancel",
                       headers=tokens["manager"]).status_code == 409
    assert client.patch(f"/api/sop-schedule/{draft['id']}", headers=tokens["manager"],
                        json={"notes": "late"}).status_code == 409
    assert client.post("/api/sop-schedule/missing/cancel",
                       headers=tokens["manager"]).status_code == 404


def test_dashboard_ignores_planned_and_cancelled(client, tokens, user_ids):
    before = client.get("/api/sop-dashboard", headers=tokens["manager"]).json()
    a = _schedule(client, tokens, user_ids, _day()).json()
    b = _schedule(client, tokens, user_ids, _day()).json()
    client.post(f"/api/sop-schedule/{b['id']}/cancel", headers=tokens["manager"])
    after = client.get("/api/sop-dashboard", headers=tokens["manager"]).json()
    assert len(after["audits"]) == len(before["audits"])
    ids = {x["id"] for x in after["audits"]}
    assert a["id"] not in ids and b["id"] not in ids


def test_scheduling_is_logged(client, tokens, user_ids, db):
    audit = _schedule(client, tokens, user_ids, _day()).json()
    client.post(f"/api/sop-schedule/{audit['id']}/cancel", headers=tokens["manager"])
    actions = {row.action for row in db.query(AuditLog).filter_by(entity_id=audit["id"])}
    assert {"schedule_sop_audit", "cancel_sop_audit"} <= actions


def test_classic_patch_and_cancel(client, tokens, user_ids):
    day, other = _day(), _day()
    audit = _classic(client, tokens, user_ids, day).json()
    url = f"/api/audits/{audit['id']}"
    r = client.patch(url, headers=tokens["manager"], json={
        "scheduled_at": _when(day, 16), "notes": "moved"})
    assert r.status_code == 200 and r.json()["notes"] == "moved"
    r = client.patch(url, headers=tokens["manager"], json={
        "auditor_id": user_ids["auditor2@test"], "scheduled_at": _when(other)})
    assert r.status_code == 200
    assert r.json()["auditor_id"] == user_ids["auditor2@test"]
    assert client.patch(url, headers=tokens["auditor2"],
                        json={"notes": "x"}).status_code == 403

    # clash with an SOP audit of auditor2 on that day
    sop = _schedule(client, tokens, user_ids, other, store="T002",
                    auditor="auditor2@test")
    assert sop.status_code == 409          # the classic audit already holds the day
    sop_day = _day()
    assert _schedule(client, tokens, user_ids, sop_day, store="T002",
                     auditor="auditor2@test").status_code == 200
    r = client.patch(url, headers=tokens["manager"], json={"scheduled_at": _when(sop_day)})
    assert r.status_code == 409 and r.json()["kind"] == "sop"

    r = client.post(f"{url}/cancel", headers=tokens["manager"])
    assert r.status_code == 200 and r.json()["status"] == "Cancelled"
    assert client.post(f"{url}/cancel", headers=tokens["manager"]).status_code == 409
    assert client.patch(url, headers=tokens["manager"],
                        json={"notes": "x"}).status_code == 409
    assert client.post("/api/audits/AUD-0/cancel",
                       headers=tokens["manager"]).status_code == 404

