"""The auditor checks an auditee's answer: accept it or send it back."""
import uuid

from test_classic_audit_flow import _answer, _checklist, _start


def _raised_issue(client, tokens, db, user_ids):
    audit = _start(client, tokens, _checklist(db, [(1, False)])).json()
    assert _answer(client, tokens, audit, 0, "No").status_code == 200
    rid = audit["responses"][0]["id"]
    r = client.post(f"/api/audits/{audit['id']}/responses/{rid}/issue", headers=tokens["auditor1"],
                    json={"assignee_id": user_ids["ae1@test"], "priority": "High"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _resolve(client, tokens, iid):
    r = client.put(f"/api/issues/{iid}", headers=tokens["ae1"],
                   json={"status": "Resolved", "action_taken": "Fixed it"})
    assert r.status_code == 200, r.text


def _review(client, headers, iid, decision, note=""):
    return client.post(f"/api/issues/{iid}/review", headers=headers,
                       json={"decision": decision, "note": note})


def test_auditor_accepts_and_it_stays_resolved_for_the_manager(client, tokens, db, user_ids):
    iid = _raised_issue(client, tokens, db, user_ids)
    _resolve(client, tokens, iid)

    r = _review(client, tokens["auditor1"], iid, "accept", "Looks right")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "Resolved"
    assert body["meta"]["review"]["decision"] == "accepted"
    assert body["meta"]["history"][-1]["reply"] == "Accepted: Looks right"

    r = client.put(f"/api/issues/{iid}", headers=tokens["manager"], json={"status": "Closed"})
    assert r.status_code == 200 and r.json()["status"] == "Closed"


def test_send_back_reopens_it_with_the_reason_for_the_auditee(client, tokens, db, user_ids):
    iid = _raised_issue(client, tokens, db, user_ids)
    _resolve(client, tokens, iid)

    assert _review(client, tokens["auditor1"], iid, "send_back").status_code == 400
    r = _review(client, tokens["auditor1"], iid, "send_back", "Photo is missing")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "In Progress"

    mine = [i for i in client.get("/api/issues", headers=tokens["ae1"]).json() if i["id"] == iid][0]
    assert mine["meta"]["history"][-1]["reply"] == "Sent back: Photo is missing"
    assert "review" not in mine["meta"]


def test_a_new_status_clears_an_earlier_acceptance(client, tokens, db, user_ids):
    iid = _raised_issue(client, tokens, db, user_ids)
    _resolve(client, tokens, iid)
    assert _review(client, tokens["auditor1"], iid, "accept").status_code == 200

    r = client.put(f"/api/issues/{iid}", headers=tokens["ae1"], json={"status": "In Progress"})
    assert r.status_code == 200, r.text
    assert "review" not in r.json()["meta"]


def test_only_a_resolved_issue_can_be_reviewed(client, tokens, db, user_ids):
    iid = _raised_issue(client, tokens, db, user_ids)
    assert _review(client, tokens["auditor1"], iid, "accept").status_code == 409


def test_review_rules_on_people_and_input(client, tokens, db, user_ids):
    iid = _raised_issue(client, tokens, db, user_ids)
    _resolve(client, tokens, iid)
    assert _review(client, tokens["auditor2"], iid, "accept").status_code == 403
    assert _review(client, tokens["ae1"], iid, "accept").status_code == 403
    assert _review(client, tokens["auditor1"], iid, "maybe").status_code == 400
    assert _review(client, tokens["auditor1"], uuid.uuid4().hex[:8], "accept").status_code == 404
    assert _review(client, tokens["manager"], iid, "accept").status_code == 200
