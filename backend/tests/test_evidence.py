"""Photo and video evidence: upload, read back, the file checks, and the
auditor's evidence reaching the auditee through the issue."""
import pytest

from app.routers import evidence
from test_classic_audit_flow import _answer, _checklist, _start


@pytest.fixture(autouse=True)
def evidence_folder(tmp_path, monkeypatch):
    monkeypatch.setattr(evidence, "EVIDENCE_FOLDER", tmp_path)
    return tmp_path


def _upload(client, headers, name="shelf.jpg", content=b"fake-image"):
    return client.post("/api/evidence", headers=headers, files={"file": (name, content)})


def test_uploaded_photo_can_be_read_back(client, tokens):
    r = _upload(client, tokens["auditor1"])
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["type"] == "photo"
    assert body["name"] == "shelf.jpg"

    got = client.get(body["url"], headers=tokens["ae1"])
    assert got.status_code == 200
    assert got.content == b"fake-image"
    assert got.headers["content-type"] == "image/jpeg"
    assert got.headers["x-content-type-options"] == "nosniff"


def test_video_is_typed_as_video(client, tokens):
    r = _upload(client, tokens["auditor1"], name="WALK.MP4")
    assert r.status_code == 201, r.text
    assert r.json()["type"] == "video"


def test_upload_and_read_need_a_login(client, tokens):
    assert _upload(client, {}).status_code == 401
    url = _upload(client, tokens["auditor1"]).json()["url"]
    assert client.get(url).status_code == 401


@pytest.mark.parametrize("name", ["virus.exe", "page.html", "logo.svg", "noextension"])
def test_other_file_types_are_refused(client, tokens, evidence_folder, name):
    assert _upload(client, tokens["auditor1"], name=name).status_code == 422
    assert not list(evidence_folder.iterdir())


def test_empty_and_oversized_files_leave_nothing_behind(client, tokens, evidence_folder, monkeypatch):
    assert _upload(client, tokens["auditor1"], content=b"").status_code == 422
    monkeypatch.setattr(evidence, "MAX_BYTES", 4)
    assert _upload(client, tokens["auditor1"], content=b"12345").status_code == 413
    assert not list(evidence_folder.iterdir())


@pytest.mark.parametrize("name", ["secret.jpg", "0" * 32 + ".exe", "0" * 32 + ".jpg"])
def test_only_stored_files_can_be_read(client, tokens, evidence_folder, name):
    (evidence_folder / "secret.jpg").write_bytes(b"not an upload")
    assert client.get(f"/api/evidence/{name}", headers=tokens["manager"]).status_code == 404


def test_auditee_sees_the_auditors_evidence_and_adds_their_own(client, tokens, db, user_ids):
    file = _upload(client, tokens["auditor1"]).json()
    audit = _start(client, tokens, _checklist(db, [(1, False)])).json()
    r = _answer(client, tokens, audit, 0, "No", evidence=[file])
    assert r.status_code == 200, r.text

    rid = audit["responses"][0]["id"]
    issue = client.post(f"/api/audits/{audit['id']}/responses/{rid}/issue", headers=tokens["auditor1"],
                        json={"assignee_id": user_ids["ae1@test"], "priority": "High"})
    assert issue.status_code == 201, issue.text
    assert issue.json()["response_evidence"] == [file]

    reply = _upload(client, tokens["ae1"], name="fixed.png").json()
    r = client.put(f"/api/issues/{issue.json()['id']}", headers=tokens["ae1"], json={"evidence": [reply]})
    assert r.status_code == 200, r.text
    assert r.json()["evidence"] == [reply]
    assert r.json()["response_evidence"] == [file]
