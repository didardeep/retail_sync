"""Auditees linked to stores, the auditor's per-question choice to raise an
issue for one of the store's auditees, and the store sheet upload."""
import io
import uuid

from openpyxl import Workbook

from app.models import (
    Checklist, ChecklistItem, Issue, Question, Store,
)
from app.routers.uploads import UPLOAD_FOLDER


def _checklist(db, count=2):
    tag = uuid.uuid4().hex[:6]
    cl = Checklist(name=f"Auditee flow {tag}", is_active=True)
    db.add(cl)
    db.flush()
    for n in range(count):
        q = Question(code=f"B{tag}{n}", text=f"Auditee question {tag} {n}", process="Cashiering")
        db.add(q)
        db.flush()
        db.add(ChecklistItem(checklist_id=cl.id, question_id=q.id, sort_order=n))
    db.commit()
    return cl.id


def _audit(client, tokens, db, store="T001", answers=("No", "Yes")):
    audit = client.post("/api/audits/start", headers=tokens["auditor1"],
                        json={"store_id": store, "checklist_id": _checklist(db, len(answers))}).json()
    for resp, answer in zip(audit["responses"], answers):
        r = client.put(f"/api/audits/{audit['id']}/responses/{resp['id']}",
                       headers=tokens["auditor1"], json={"answer": answer})
        assert r.status_code == 200, r.text
    return audit


def _raise(client, tokens, audit, n, assignee, who="auditor1", **extra):
    rid = audit["responses"][n]["id"]
    return client.post(f"/api/audits/{audit['id']}/responses/{rid}/issue",
                       headers=tokens[who], json={"assignee_id": assignee, **extra})


# ---- auditees -------------------------------------------------------------
def test_admin_creates_an_auditee_linked_to_stores(client, tokens):
    r = client.post("/api/admin/users", headers=tokens["admin"], json={
        "name": "New Auditee", "email": "ae.new@test", "password": "pw-12345",
        "role": "AUDITEE", "store_ids": ["T001", "T002"]})
    assert r.status_code == 201, r.text
    assert r.json()["store_ids"] == ["T001", "T002"]
    uid = r.json()["id"]

    bad = client.post("/api/admin/users", headers=tokens["admin"], json={
        "name": "Bad", "email": "ae.bad@test", "password": "pw-12345",
        "role": "AUDITEE", "store_ids": ["NOPE"]})
    assert bad.status_code == 404

    r = client.patch(f"/api/admin/users/{uid}", headers=tokens["admin"], json={"store_ids": ["T002"]})
    assert r.status_code == 200 and r.json()["store_ids"] == ["T002"]
    assert [u["store_ids"] for u in client.get("/api/admin/users?role=AUDITEE", headers=tokens["admin"]).json()
            if u["id"] == uid] == [["T002"]]

    # many auditees per store
    auditees = client.get("/api/stores/T002/auditees", headers=tokens["auditor1"]).json()
    assert {a["name"] for a in auditees} >= {"Auditee Two", "New Auditee"}


def test_auditee_sees_only_their_stores_and_no_audit_data(client, tokens):
    stores = client.get("/api/stores", headers=tokens["ae1"]).json()
    assert [s["id"] for s in stores] == ["T001"]
    for path in ("/api/audits", "/api/observations", "/api/store-scores", "/api/questions"):
        assert client.get(path, headers=tokens["ae1"]).status_code == 403, path
    assert client.post("/api/chat", headers=tokens["ae1"], json={"messages": []}).status_code == 403


# ---- raising an issue -----------------------------------------------------
def test_raising_an_issue_is_the_auditors_choice_and_not_automatic(client, tokens, db):
    audit = _audit(client, tokens, db)
    client.post(f"/api/audits/{audit['id']}/submit", headers=tokens["auditor1"])
    db.expire_all()
    assert db.query(Issue).filter_by(audit_id=audit["id"]).count() == 0


def test_assignee_must_be_an_auditee_linked_to_the_audits_store(client, tokens, db, user_ids):
    audit = _audit(client, tokens, db, store="T001")
    # linked to the other store only
    r = _raise(client, tokens, audit, 0, user_ids["ae2@test"])
    assert r.status_code == 422 and "linked" in r.json()["error"]
    # not an auditee at all
    assert _raise(client, tokens, audit, 0, user_ids["sm1@test"]).status_code == 422
    assert _raise(client, tokens, audit, 0, user_ids["auditor2@test"]).status_code == 422
    assert _raise(client, tokens, audit, 0, "nobody").status_code == 422
    # nothing was created by the rejected attempts
    got = client.get(f"/api/audits/{audit['id']}", headers=tokens["auditor1"]).json()
    assert got["responses"][0]["issue_id"] is None

    ok = _raise(client, tokens, audit, 0, user_ids["ae1@test"], priority="High")
    assert ok.status_code == 201, ok.text
    body = ok.json()
    assert body["assignee_id"] == user_ids["ae1@test"] and body["store_id"] == "T001"
    assert body["answer"] == "No" and body["question"] == audit["responses"][0]["question_text"]
    assert body["audit_id"] == audit["id"] and body["priority"] == "High"
    got = client.get(f"/api/audits/{audit['id']}", headers=tokens["auditor1"]).json()
    assert got["responses"][0]["issue_id"] == body["id"]
    assert got["responses"][0]["issue_assignee"] == "Auditee One"

    # one issue per question
    assert _raise(client, tokens, audit, 0, user_ids["ae1@test"]).status_code == 409


def test_raise_issue_guards(client, tokens, db, user_ids):
    audit = _audit(client, tokens, db, answers=("No", "Yes"))
    # unanswered question
    fresh = client.post("/api/audits/start", headers=tokens["auditor2"],
                        json={"store_id": "T001", "checklist_id": _checklist(db, 1)}).json()
    r = _raise(client, tokens, fresh, 0, user_ids["ae1@test"], who="auditor2")
    assert r.status_code == 409
    # someone else's audit; roles that may not raise
    assert _raise(client, tokens, audit, 0, user_ids["ae1@test"], who="auditor2").status_code == 403
    assert _raise(client, tokens, audit, 0, user_ids["ae1@test"], who="sm1").status_code == 403
    assert _raise(client, tokens, audit, 0, user_ids["ae1@test"], who="ae1").status_code == 403
    assert _raise(client, tokens, audit, 1, user_ids["ae1@test"], priority="Urgent").status_code == 422
    # any answer may be followed up, not only No
    assert _raise(client, tokens, audit, 1, user_ids["ae1@test"]).status_code == 201


def test_generic_issue_create_also_checks_auditee_links(client, tokens, user_ids):
    r = client.post("/api/issues", headers=tokens["manager"], json={
        "title": "Manual", "store_id": "T001", "assignee_id": user_ids["ae2@test"]})
    assert r.status_code == 400
    r = client.post("/api/issues", headers=tokens["manager"], json={
        "title": "Manual", "store_id": "T001", "assignee_id": user_ids["ae1@test"]})
    assert r.status_code == 201


# ---- the auditee's side ---------------------------------------------------
def test_auditee_sees_and_works_on_only_their_issues(client, tokens, db, user_ids):
    audit = _audit(client, tokens, db, store="T001", answers=("No",))
    mine = _raise(client, tokens, audit, 0, user_ids["ae1@test"]).json()
    theirs = client.post("/api/issues", headers=tokens["manager"], json={
        "title": "Other store", "store_id": "T002", "assignee_id": user_ids["ae2@test"]}).json()

    rows = client.get("/api/issues", headers=tokens["ae1"]).json()
    ids = {i["id"] for i in rows}
    assert mine["id"] in ids and theirs["id"] not in ids
    row = next(i for i in rows if i["id"] == mine["id"])
    assert row["question"] and row["answer"] == "No" and row["audit_id"] == audit["id"]

    url = f"/api/issues/{mine['id']}"
    r = client.put(url, headers=tokens["ae1"], json={
        "status": "In Progress", "action_taken": "Fixed the till, photo to follow",
        "priority": "Low", "assignee_id": user_ids["ae2@test"], "title": "hacked"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "In Progress"
    assert r.json()["action_taken"] == "Fixed the till, photo to follow"
    # priority, assignee and title are not the auditee's to change
    assert r.json()["priority"] != "Low" and r.json()["assignee_id"] == user_ids["ae1@test"]
    assert r.json()["title"] != "hacked"

    assert client.put(url, headers=tokens["ae1"], json={"status": "Closed"}).status_code == 400
    assert client.put(url, headers=tokens["ae2"], json={"status": "Resolved"}).status_code == 403
    assert client.put(f"/api/issues/{theirs['id']}", headers=tokens["ae1"],
                      json={"status": "Resolved"}).status_code == 403
    assert client.delete(url, headers=tokens["ae1"]).status_code == 403
    assert client.post("/api/issues", headers=tokens["ae1"], json={"title": "x"}).status_code == 403

    assert client.put(url, headers=tokens["ae1"], json={"status": "Resolved"}).status_code == 200
    # the audit manager sees the status change and the reply history
    seen = next(i for i in client.get("/api/issues", headers=tokens["manager"]).json() if i["id"] == mine["id"])
    assert seen["status"] == "Resolved"
    history = seen["meta"]["history"]
    assert [h["status"] for h in history] == ["In Progress", "Resolved"] and history[0]["by"] == "Auditee One"
    assert client.put(url, headers=tokens["manager"], json={"status": "Closed"}).status_code == 200

    # an auditee cannot open the audit itself
    assert client.get(f"/api/audits/{audit['id']}", headers=tokens["ae1"]).status_code == 403


def test_store_manager_sees_issues_at_their_store(client, tokens, user_ids):
    made = client.post("/api/issues", headers=tokens["manager"], json={
        "title": "At sm1 store, assigned to an auditee", "store_id": "T001",
        "assignee_id": user_ids["ae1@test"]}).json()
    ids = {i["id"] for i in client.get("/api/issues", headers=tokens["sm1"]).json()}
    assert made["id"] in ids
    assert made["id"] not in {i["id"] for i in client.get("/api/issues", headers=tokens["sm2"]).json()}
    r = client.put(f"/api/issues/{made['id']}", headers=tokens["sm1"], json={"status": "In Progress"})
    assert r.status_code == 200


# ---- Excel upload ---------------------------------------------------------
def test_store_upload_creates_and_updates_stores(client, tokens, db):
    wb = Workbook()
    ws = wb.active
    ws.append(["Store ID", "Name", "City"])
    ws.append(["TU1", "Upload One", "Agra"])
    ws.append(["TU2", "Upload Two", "Surat"])
    ws.append(["T001", "Test Store 1", None])                # existing store, blank city
    buf = io.BytesIO()
    wb.save(buf)

    r = client.post("/api/upload", headers=tokens["manager"], data={"section": "stores"},
                    files={"file": ("stores_upload_test.xlsx", buf.getvalue())})
    (UPLOAD_FOLDER / "stores_upload_test.xlsx").unlink(missing_ok=True)   # the upload keeps a copy
    assert r.status_code == 201, r.text
    assert r.json()["records"] == 3
    db.expire_all()
    assert db.get(Store, "TU1").city == "Agra"
    assert db.get(Store, "TU2").city == "Surat"
    assert db.get(Store, "T001").city == "Delhi"             # blank cell leaves it alone
