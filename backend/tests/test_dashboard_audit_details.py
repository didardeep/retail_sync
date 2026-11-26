"""The dashboard's audit details: start, approval and send-back times for the
Execution view, and answer counts for the Findings view."""
from app.models import Question
from test_audit_decision import _decide
from test_classic_audit_flow import _answer, _checklist, _start


def _details(client, headers, *ids):
    return client.post("/api/dashboard/audit-details", headers=headers, json={"audit_ids": list(ids)})


def _high(db, audit, n):
    q = db.get(Question, audit["responses"][n]["question_id"])
    q.set_criticality("High")
    db.commit()


def test_details_count_answers_by_process_and_flag_critical_failures(client, tokens, db):
    audit = _start(client, tokens, _checklist(db, [(1, False)] * 3)).json()
    _high(db, audit, 1)
    assert _answer(client, tokens, audit, 0, "Yes").status_code == 200
    assert _answer(client, tokens, audit, 1, "No").status_code == 200
    assert _answer(client, tokens, audit, 2, "NA").status_code == 200

    # Not submitted yet: timing is known, but no findings.
    body = _details(client, tokens["manager"], audit["id"]).json()
    assert body["timing"][audit["id"]]["started_at"]
    assert body["by_process"] == [] and body["critical_failures"] == []

    assert client.post(f"/api/audits/{audit['id']}/submit", headers=tokens["auditor1"], json={}).status_code == 200
    body = _details(client, tokens["manager"], audit["id"]).json()
    assert body["by_process"] == [{"process": "Cashiering", "yes": 1, "no": 1, "na": 1}]
    [crit] = body["critical_failures"]
    assert crit["audit_id"] == audit["id"] and crit["question_code"] == audit["responses"][1]["question_code"]
    [failed] = body["failed_questions"]
    assert failed["no"] == 1 and failed["answered"] == 1 and failed["stores"] == 1


def test_details_record_returns_and_approval(client, tokens, db):
    audit = _start(client, tokens, _checklist(db, [(1, False)] * 2)).json()
    for n in range(2):
        assert _answer(client, tokens, audit, n, "Yes").status_code == 200
    submit = lambda: client.post(f"/api/audits/{audit['id']}/submit", headers=tokens["auditor1"], json={})
    assert submit().status_code == 200
    assert _decide(client, tokens["manager"], audit, "return", "Check", [(1, "Recheck", None)]).status_code == 200
    assert _answer(client, tokens, audit, 1, "Yes").status_code == 200
    assert submit().status_code == 200
    assert _decide(client, tokens["manager"], audit, "approve").status_code == 200

    t = _details(client, tokens["manager"], audit["id"]).json()["timing"][audit["id"]]
    assert t["returns"] == 1 and t["approved_at"]


def test_details_are_for_managers_only(client, tokens):
    assert _details(client, tokens["auditor1"]).status_code == 403
    assert _details(client, tokens["manager"]).json()["timing"] == {}
