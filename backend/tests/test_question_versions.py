"""Question version control: who changed what and why, compare, restore, and
which audits used which version. See docs/decisions-question-versions.md."""
from app.models import AuditResponse, ChecklistItem, Question
from test_classic_audit_flow import _checklist, _start


def _edit(client, tokens, qid, who="manager", **body):
    return client.put(f"/api/questions/{qid}", headers=tokens[who], json=body)


def _versions(client, tokens, code):
    r = client.get(f"/api/questions/{code}/versions", headers=tokens["manager"])
    assert r.status_code == 200, r.text
    return r.json()


def _new_question(client, tokens, text="Is the cash counted?"):
    r = client.post("/api/questions", headers=tokens["manager"],
                    json={"text": text, "process": "Cashiering", "meta": {"tags": ["cash"]}})
    assert r.status_code == 201, r.text
    return r.json()


def test_each_version_records_who_why_and_only_what_really_changed(client, tokens):
    q = _new_question(client, tokens)
    # The page sends the whole form; only the criticality really changes here.
    r = _edit(client, tokens, q["id"], text=q["text"], process="Cashiering",
              criticality="High", meta={"tags": ["cash"]}, change_note="Cash gaps are serious")
    assert r.status_code == 200, r.text
    v2 = r.json()
    assert v2["version"] == 2
    assert v2["edited_by"] == "Manager"
    assert v2["change_note"] == "Cash gaps are serious"

    history = _versions(client, tokens, q["code"])
    assert [v["version"] for v in history] == [2, 1]
    assert history[0]["changes"] == {"criticality": ["Low", "High"]}
    assert history[1]["changes"] == {}


def test_saving_with_nothing_changed_makes_no_version(client, tokens):
    q = _new_question(client, tokens, "Is the safe locked?")
    r = _edit(client, tokens, q["id"], text=q["text"], meta={"tags": ["cash"]})
    assert r.status_code == 200, r.text
    assert r.json()["id"] == q["id"]
    assert r.json()["version"] == 1
    assert len(_versions(client, tokens, q["code"])) == 1


def test_editing_a_version_someone_else_replaced_is_refused(client, tokens):
    q = _new_question(client, tokens, "Is the float correct?")
    assert _edit(client, tokens, q["id"], text="Is the opening float correct?").status_code == 200
    # A second manager still has the old version open.
    r = _edit(client, tokens, q["id"], who="admin", text="Is the float right?")
    assert r.status_code == 409, r.text
    assert "changed by Manager" in r.text
    assert len(_versions(client, tokens, q["code"])) == 2


def test_edit_keeps_fields_the_form_does_not_send(client, tokens, db):
    q = _new_question(client, tokens, "Is the CCTV working?")
    row = db.get(Question, q["id"])
    row.photo_video_enablement, row.annex = "Yes", "Annex C1"
    db.commit()
    new = _edit(client, tokens, q["id"], text="Is every CCTV camera working?").json()
    db.expire_all()
    saved = db.get(Question, new["id"])
    assert (saved.photo_video_enablement, saved.annex) == ("Yes", "Annex C1")


def test_restore_saves_the_old_content_as_a_new_version_and_checklists_follow(client, tokens, db):
    cl = _checklist(db, [(1, False)])
    v1_id = db.query(ChecklistItem).filter(ChecklistItem.checklist_id == cl).one().question_id
    code = db.get(Question, v1_id).code
    v2 = _edit(client, tokens, v1_id, text="Reworded question").json()

    r = client.post(f"/api/questions/{v1_id}/restore", headers=tokens["manager"], json={})
    assert r.status_code == 200, r.text
    v3 = r.json()
    assert v3["version"] == 3 and v3["text"] == db.get(Question, v1_id).text
    assert v3["change_note"] == "Restored from v1"

    db.expire_all()
    assert db.query(ChecklistItem).filter(ChecklistItem.checklist_id == cl).one().question_id == v3["id"]
    assert [v["version"] for v in _versions(client, tokens, code)] == [3, 2, 1]
    assert not db.get(Question, v2["id"]).is_current

    # Restoring something identical to the current version does nothing.
    again = client.post(f"/api/questions/{v1_id}/restore", headers=tokens["manager"], json={})
    assert again.status_code == 400


def test_history_counts_audits_and_lists_them_per_version(client, tokens, db):
    cl = _checklist(db, [(1, False)])
    audit = _start(client, tokens, cl).json()
    v1_id = audit["responses"][0]["question_id"]
    assert audit["responses"][0]["question_version"] == 1
    v2 = _edit(client, tokens, v1_id, text="A newer wording").json()

    history = {v["version"]: v for v in _versions(client, tokens, v2["code"])}
    assert history[1]["audit_count"] == 1
    assert history[2]["audit_count"] == 0

    used = client.get(f"/api/questions/{v1_id}/audits", headers=tokens["manager"]).json()
    assert [a["id"] for a in used] == [audit["id"]]
    assert used[0]["store_id"] == "T001"


def test_change_history_lists_edits_across_questions(client, tokens, user_ids):
    q = _new_question(client, tokens, "Is the cash book signed?")
    _edit(client, tokens, q["id"], who="admin", text="Is the cash book signed daily?",
          change_note="Daily, not weekly")
    r = client.get("/api/questions/changes", headers=tokens["manager"],
                   params={"code": q["code"], "days": 7})
    assert r.status_code == 200, r.text
    entries = r.json()
    assert [e["version"] for e in entries] == [2, 1]
    assert entries[0]["change_note"] == "Daily, not weekly"
    assert entries[0]["changes"]["text"] == ["Is the cash book signed?", "Is the cash book signed daily?"]

    mine = client.get("/api/questions/changes", headers=tokens["manager"],
                      params={"code": q["code"], "user_id": user_ids["admin@test"]}).json()
    assert [e["version"] for e in mine] == [2]


def test_only_managers_see_version_history(client, tokens):
    q = _new_question(client, tokens, "Is the till drawer closed?")
    for path in (f"/api/questions/{q['code']}/versions", "/api/questions/changes",
                 f"/api/questions/{q['id']}/audits"):
        assert client.get(path, headers=tokens["auditor1"]).status_code == 403, path
    r = client.post(f"/api/questions/{q['id']}/restore", headers=tokens["auditor1"], json={})
    assert r.status_code == 403


def _schedule(client, tokens, checklist_id, when):
    r = client.post("/api/audits", headers=tokens["manager"], json={
        "store_id": "T001", "scheduled_at": when, "checklist_id": checklist_id})
    assert r.status_code == 201, r.text
    return client.get(f"/api/audits/{r.json()['id']}", headers=tokens["manager"]).json()


def test_planned_audits_nobody_started_follow_an_edit_but_started_ones_do_not(client, tokens, db):
    cl = _checklist(db, [(1, False)])
    untouched = _schedule(client, tokens, cl, "2034-03-01T09:00:00")
    touched = _schedule(client, tokens, cl, "2034-03-02T09:00:00")
    ongoing = _start(client, tokens, cl).json()
    v1_id = untouched["responses"][0]["question_id"]
    # Planned, but an answer is already in: it keeps its wording.
    resp = db.get(AuditResponse, touched["responses"][0]["id"])
    resp.answer = "Yes"
    db.commit()

    v2 = _edit(client, tokens, v1_id, text="Newer wording").json()

    def qid(audit):
        return client.get(f"/api/audits/{audit['id']}", headers=tokens["manager"]).json()["responses"][0]["question_id"]
    assert qid(untouched) == v2["id"]
    assert qid(touched) == v1_id
    assert qid(ongoing) == v1_id
