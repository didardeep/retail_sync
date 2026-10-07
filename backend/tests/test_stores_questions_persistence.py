"""Store and question-bank actions must persist, and be refused for the wrong role."""
from app.models import AuditLog, Question


def test_store_create_and_update_persist(client, tokens):
    r = client.post("/api/stores", headers=tokens["manager"], json={
        "id": "PX001", "name": "Persist Store", "city": "Goa", "region": "West India",
        "format": "COCO", "type": "Kiosk"})
    assert r.status_code == 201, r.text
    assert r.json()["name"] == "Persist Store"
    dup = client.post("/api/stores", headers=tokens["manager"], json={"id": "PX001", "name": "Again"})
    assert dup.status_code == 409

    r = client.put("/api/stores/PX001", headers=tokens["manager"], json={"city": "Panaji"})
    assert r.status_code == 200 and r.json()["city"] == "Panaji"
    r = client.put("/api/stores/PX001", headers=tokens["admin"], json={"status": "Dehired"})
    assert r.status_code == 200

    rows = client.get("/api/stores", headers=tokens["manager"]).json()
    saved = next(s for s in rows if s["id"] == "PX001")
    assert (saved["city"], saved["status"], saved["format"]) == ("Panaji", "Dehired", "COCO")


def test_store_changes_refused_for_auditor_and_store_manager(client, tokens):
    for who in ("auditor1", "sm1"):
        body = {"id": "PX900", "name": "Nope"}
        assert client.post("/api/stores", headers=tokens[who], json=body).status_code == 403
        assert client.put("/api/stores/T001", headers=tokens[who], json={"city": "X"}).status_code == 403
    assert all(s["id"] != "PX900" for s in client.get("/api/stores", headers=tokens["manager"]).json())


def test_question_create_edit_toggle_and_soft_delete_persist(client, tokens, db):
    r = client.post("/api/questions", headers=tokens["manager"], json={
        "text": "Persist me", "process": "Cashiering", "audit_type": "Store Visit",
        "weight": 2, "meta": {"tags": ["a"]}})
    assert r.status_code == 201, r.text
    q1 = r.json()
    assert q1["approval_status"] == "APPROVED"

    r = client.put(f"/api/questions/{q1['id']}", headers=tokens["manager"],
                   json={"text": "Persist me, edited", "weight": 4})
    assert r.status_code == 200, r.text
    q2 = r.json()
    assert q2["code"] == q1["code"] and q2["version"] == 2 and q2["weight"] == 4

    r = client.put(f"/api/questions/{q2['id']}", headers=tokens["admin"], json={"active": False})
    assert r.status_code == 200 and r.json()["active"] is False
    q3 = r.json()

    r = client.put(f"/api/questions/{q3['id']}", headers=tokens["manager"], json={"active": True})
    q4 = r.json()
    assert q4["active"] is True

    r = client.delete(f"/api/questions/{q4['id']}", headers=tokens["manager"])
    assert r.status_code == 200 and r.json()["active"] is False

    listed = [q for q in client.get("/api/questions", headers=tokens["manager"]).json()
              if q["code"] == q1["code"]]
    assert len(listed) == 1
    assert listed[0]["text"] == "Persist me, edited" and listed[0]["active"] is False
    # the old wording is kept as a non-current version
    assert db.query(Question).filter_by(code=q1["code"]).count() == 4
    actions = {a.action for a in db.query(AuditLog).filter_by(entity_type="question").all()}
    assert {"edit_question", "deactivate_question"} <= actions


def test_auditor_question_is_pending_and_manager_can_decide(client, tokens):
    r = client.post("/api/questions", headers=tokens["auditor1"], json={"text": "Auditor idea", "process": "EHS"})
    assert r.status_code == 201 and r.json()["approval_status"] == "PENDING"
    qid = r.json()["id"]
    r = client.post(f"/api/questions/{qid}/approve", headers=tokens["manager"], json={"decision": "REJECTED"})
    assert r.status_code == 200 and r.json()["approval_status"] == "REJECTED"


def test_auditor_refused_on_manager_only_question_actions(client, tokens):
    qid = client.post("/api/questions", headers=tokens["manager"],
                      json={"text": "Guarded", "process": "EHS"}).json()["id"]
    h = tokens["auditor1"]
    assert client.put(f"/api/questions/{qid}", headers=h, json={"active": False}).status_code == 403
    assert client.delete(f"/api/questions/{qid}", headers=h).status_code == 403
    assert client.post(f"/api/questions/{qid}/approve", headers=h, json={"decision": "APPROVED"}).status_code == 403
    still = [q for q in client.get("/api/questions", headers=tokens["manager"]).json() if q["id"] == qid]
    assert still and still[0]["active"] is True
