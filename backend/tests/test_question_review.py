"""The audit manager reviews a submitted audit question by question."""
from app.models import Notification
from test_classic_audit_flow import _answer, _checklist, _start


def _submitted(client, tokens, db, questions=2):
    audit = _start(client, tokens, _checklist(db, [(1, False)] * questions)).json()
    for n in range(questions):
        assert _answer(client, tokens, audit, n, "Yes").status_code == 200
    r = client.post(f"/api/audits/{audit['id']}/submit", headers=tokens["auditor1"], json={})
    assert r.status_code == 200, r.text
    return audit


def _review(client, headers, audit, n, decision, note=""):
    rid = audit["responses"][n]["id"]
    return client.post(f"/api/audits/{audit['id']}/responses/{rid}/review", headers=headers,
                       json={"decision": decision, "note": note})


def _reply(client, headers, audit, n, note):
    rid = audit["responses"][n]["id"]
    return client.post(f"/api/audits/{audit['id']}/responses/{rid}/reply", headers=headers, json={"note": note})


def test_audit_is_approved_when_the_last_question_is(client, tokens, db):
    audit = _submitted(client, tokens, db)
    r = _review(client, tokens["manager"], audit, 0, "approve")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "Completed"
    assert r.json()["responses"][0]["review_status"] == "approved"
    assert r.json()["responses"][0]["reviewed_by"] == "Manager"

    r = _review(client, tokens["manager"], audit, 1, "approve")
    assert r.json()["status"] == "Approved"


def test_a_query_goes_to_the_auditor_who_replies_then_it_can_be_approved(client, tokens, db):
    audit = _submitted(client, tokens, db, questions=1)
    assert _review(client, tokens["manager"], audit, 0, "query").status_code == 400

    r = _review(client, tokens["manager"], audit, 0, "query", "Where is the receipt?")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "Completed"
    assert r.json()["responses"][0]["review_note"] == "Where is the receipt?"
    assert db.query(Notification).filter(Notification.kind == "review_query").count() >= 1

    assert _reply(client, tokens["auditor1"], audit, 0, " ").status_code == 400
    r = _reply(client, tokens["auditor1"], audit, 0, "Attached in annexures")
    assert r.status_code == 200, r.text
    row = r.json()["responses"][0]
    assert row["review_status"] == "replied" and row["review_reply"] == "Attached in annexures"

    assert _review(client, tokens["manager"], audit, 0, "approve").json()["status"] == "Approved"


def test_a_query_blocks_approval_of_the_audit(client, tokens, db):
    audit = _submitted(client, tokens, db)
    _review(client, tokens["manager"], audit, 0, "query", "Check this")
    assert _review(client, tokens["manager"], audit, 1, "approve").json()["status"] == "Completed"


def test_review_needs_a_submitted_audit_and_a_manager(client, tokens, db):
    open_audit = _start(client, tokens, _checklist(db, [(1, False)])).json()
    assert _review(client, tokens["manager"], open_audit, 0, "approve").status_code == 409

    audit = _submitted(client, tokens, db)
    assert _review(client, tokens["auditor1"], audit, 0, "approve").status_code == 403
    assert _review(client, tokens["manager"], audit, 0, "maybe").status_code == 400


def test_only_the_audits_auditor_replies_and_only_to_a_query(client, tokens, db):
    audit = _submitted(client, tokens, db)
    assert _reply(client, tokens["auditor1"], audit, 0, "Nothing asked").status_code == 409
    _review(client, tokens["manager"], audit, 0, "query", "Check this")
    assert _reply(client, tokens["auditor2"], audit, 0, "Not mine").status_code == 403


def test_an_approved_audit_is_closed_to_review(client, tokens, db):
    audit = _submitted(client, tokens, db, questions=1)
    _review(client, tokens["manager"], audit, 0, "approve")
    assert _review(client, tokens["manager"], audit, 0, "query", "Too late").status_code == 409
