"""Checklist builder (versions on edit) and annexures filed against an audit."""
import uuid

import pytest

from app.routers import annexures
from test_classic_audit_flow import _checklist, _start


def _question_ids(client, tokens, n=2):
    return [q["id"] for q in client.get("/api/questions", headers=tokens["manager"]).json()][:n]


def _new(client, tokens, ids, **extra):
    r = client.post("/api/checklists", headers=tokens["manager"], json={
        "name": f"Build {uuid.uuid4().hex[:6]}", "question_ids": ids, **extra})
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture
def ids(client, tokens, db):
    _checklist(db, [(1, False), (1, False)])
    return _question_ids(client, tokens)


@pytest.fixture(autouse=True)
def annexure_folder(tmp_path, monkeypatch):
    monkeypatch.setattr(annexures, "ANNEXURE_FOLDER", tmp_path)
    return tmp_path


def test_unused_checklist_is_edited_in_place(client, tokens, ids):
    c = _new(client, tokens, ids[:1], conditions={"format": ["COCO"]})
    assert c["conditions"] == {"format": ["COCO"]}
    r = client.put(f"/api/checklists/{c['id']}", headers=tokens["manager"], json={
        "name": c["name"], "question_ids": ids, "conditions": {}})
    assert r.status_code == 200, r.text
    assert r.json()["id"] == c["id"] and r.json()["question_count"] == 2


def test_used_checklist_becomes_a_new_version(client, tokens, db):
    cid = _checklist(db, [(1, False), (1, False)])
    assert _start(client, tokens, cid).status_code == 200
    old = client.get(f"/api/checklists/{cid}", headers=tokens["manager"]).json()
    keep = [old["questions"][0]["id"]]

    r = client.put(f"/api/checklists/{cid}", headers=tokens["manager"], json={
        "name": old["name"], "question_ids": keep})
    assert r.status_code == 200, r.text
    new = r.json()
    assert new["id"] != cid and new["version"] == old["version"] + 1 and new["question_count"] == 1

    again = client.get(f"/api/checklists/{cid}", headers=tokens["manager"]).json()
    assert again["is_active"] is False and len(again["questions"]) == 2


def test_turning_a_used_checklist_off_needs_no_new_version(client, tokens, db):
    cid = _checklist(db, [(1, False)])
    _start(client, tokens, cid)
    old = client.get(f"/api/checklists/{cid}", headers=tokens["manager"]).json()
    r = client.put(f"/api/checklists/{cid}", headers=tokens["manager"], json={
        "name": old["name"], "question_ids": [q["id"] for q in old["questions"]], "is_active": False})
    assert r.json()["id"] == cid and r.json()["is_active"] is False


@pytest.mark.parametrize("body", [
    {"name": " ", "question_ids": ["x"]},
    {"name": "No questions", "question_ids": []},
    {"name": "Unknown", "question_ids": ["nope"]},
])
def test_bad_checklists_are_refused(client, tokens, body):
    assert client.post("/api/checklists", headers=tokens["manager"], json=body).status_code == 422


def test_only_managers_build_checklists(client, tokens, ids):
    body = {"name": "Mine", "question_ids": ids}
    assert client.post("/api/checklists", headers=tokens["auditor1"], json=body).status_code == 403


def _audit(client, tokens, db):
    return _start(client, tokens, _checklist(db, [(1, False)])).json()["id"]


def _file(client, headers, aid, name="receipt.pdf", content=b"%PDF", title="CMS receipt"):
    return client.post(f"/api/audits/{aid}/annexures", headers=headers,
                       data={"title": title}, files={"file": (name, content)})


def test_annexure_is_filed_listed_read_and_removed(client, tokens, db, annexure_folder):
    aid = _audit(client, tokens, db)
    r = _file(client, tokens["auditor1"], aid)
    assert r.status_code == 201, r.text
    row = r.json()
    assert row["title"] == "CMS receipt" and row["uploaded_by"] == "Auditor One"

    assert [a["id"] for a in client.get(f"/api/audits/{aid}/annexures", headers=tokens["manager"]).json()] == [row["id"]]
    got = client.get(f"/api/audits/{aid}/annexures/{row['id']}/file", headers=tokens["manager"])
    assert got.status_code == 200 and got.content == b"%PDF"
    assert "receipt.pdf" in got.headers["content-disposition"]

    assert client.delete(f"/api/audits/{aid}/annexures/{row['id']}", headers=tokens["auditor1"]).status_code == 204
    assert not list(annexure_folder.iterdir())


def test_annexure_rules(client, tokens, db, annexure_folder):
    aid = _audit(client, tokens, db)
    assert _file(client, tokens["auditor1"], aid, name="x.exe").status_code == 422
    assert _file(client, tokens["auditor1"], aid, content=b"").status_code == 422
    assert _file(client, tokens["auditor2"], aid).status_code == 403
    assert _file(client, tokens["ae1"], aid).status_code == 403
    assert not list(annexure_folder.iterdir())


def test_only_the_filer_or_a_manager_removes_an_annexure(client, tokens, db):
    aid = _audit(client, tokens, db)
    row = _file(client, tokens["manager"], aid).json()
    assert client.delete(f"/api/audits/{aid}/annexures/{row['id']}", headers=tokens["auditor1"]).status_code == 403
    assert client.delete(f"/api/audits/{aid}/annexures/{row['id']}", headers=tokens["admin"]).status_code == 204
