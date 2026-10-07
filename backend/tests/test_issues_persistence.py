"""Issues: what the Issues page saves must really be stored, and the role
limits (store manager edits status/action only, delete is manager/admin)."""
from app.models import AuditLog


def _create(client, tokens, **extra):
    body = {"title": "Cash short", "store_id": "T001", "priority": "High"}
    body.update(extra)
    r = client.post("/api/issues", headers=tokens["manager"], json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_create_is_persisted_and_listed(client, tokens, user_ids):
    made = _create(client, tokens, description="Till 3 was short",
                   assignee_id=user_ids["sm1@test"], due_date="2033-03-01")
    rows = client.get("/api/issues", headers=tokens["manager"]).json()
    row = next(x for x in rows if x["id"] == made["id"])
    assert row["title"] == "Cash short"
    assert row["store"] == "Test Store 1"
    assert row["assignee_id"] == user_ids["sm1@test"]
    assert row["due_date"] == "2033-03-01"


def test_create_rejects_bad_values_and_store_manager(client, tokens):
    r = client.post("/api/issues", headers=tokens["manager"],
                    json={"title": "x", "store_id": "NOPE"})
    assert r.status_code == 400
    r = client.post("/api/issues", headers=tokens["manager"],
                    json={"title": "x", "priority": "Urgent"})
    assert r.status_code == 400
    r = client.post("/api/issues", headers=tokens["sm1"], json={"title": "x"})
    assert r.status_code == 403


def test_manager_update_persists_every_field(client, tokens, user_ids):
    made = _create(client, tokens)
    url = f"/api/issues/{made['id']}"
    r = client.put(url, headers=tokens["manager"], json={
        "title": "Cash short again", "description": "d2", "priority": "Low",
        "status": "In Progress", "assignee_id": user_ids["sm1@test"],
        "due_date": "2033-04-02", "store_id": "T002"})
    assert r.status_code == 200, r.text
    rows = client.get("/api/issues", headers=tokens["manager"]).json()
    row = next(x for x in rows if x["id"] == made["id"])
    assert row["title"] == "Cash short again"
    assert row["description"] == "d2"
    assert row["priority"] == "Low"
    assert row["status"] == "In Progress"
    assert row["assignee_id"] == user_ids["sm1@test"]
    assert row["due_date"] == "2033-04-02"
    assert row["store_id"] == "T002"


def test_update_rejects_bad_status(client, tokens):
    made = _create(client, tokens)
    r = client.put(f"/api/issues/{made['id']}", headers=tokens["manager"],
                   json={"status": "Done-ish"})
    assert r.status_code == 400


def test_store_manager_can_only_change_status_and_action(client, tokens, user_ids):
    made = _create(client, tokens, assignee_id=user_ids["sm1@test"])
    url = f"/api/issues/{made['id']}"
    r = client.put(url, headers=tokens["sm1"], json={
        "status": "Resolved", "action_taken": "Recounted the till",
        "title": "hacked", "priority": "Low", "store_id": "T002"})
    assert r.status_code == 200, r.text
    got = r.json()
    assert got["status"] == "Resolved"
    assert got["action_taken"] == "Recounted the till"
    assert got["title"] == "Cash short"
    assert got["priority"] == "High"
    assert got["store_id"] == "T001"
    # not their issue
    r = client.put(url, headers=tokens["sm2"], json={"status": "Closed"})
    assert r.status_code == 403


def test_delete_allowed_for_manager_and_logged(client, tokens, db):
    made = _create(client, tokens)
    r = client.delete(f"/api/issues/{made['id']}", headers=tokens["manager"])
    assert r.status_code == 204
    rows = client.get("/api/issues", headers=tokens["manager"]).json()
    assert made["id"] not in [x["id"] for x in rows]
    assert db.query(AuditLog).filter_by(
        action="delete_issue", entity_id=made["id"]).count() == 1
    r = client.delete(f"/api/issues/{made['id']}", headers=tokens["manager"])
    assert r.status_code == 404


def test_delete_refused_for_store_manager_and_auditor(client, tokens, user_ids):
    made = _create(client, tokens, assignee_id=user_ids["sm1@test"])
    url = f"/api/issues/{made['id']}"
    assert client.delete(url, headers=tokens["sm1"]).status_code == 403
    assert client.delete(url, headers=tokens["auditor1"]).status_code == 403
    assert client.delete(url, headers=tokens["admin"]).status_code == 204
