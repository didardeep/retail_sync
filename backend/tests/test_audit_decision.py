"""The audit manager's verdict from the review page: approve, return for changes
(ticked questions with reasons), or reject."""
from app.models import Notification
from test_classic_audit_flow import _answer, _checklist, _start


def _submitted(client, tokens, db, questions=2):
    audit = _start(client, tokens, _checklist(db, [(1, False)] * questions)).json()
    for n in range(questions):
        assert _answer(client, tokens, audit, n, "Yes").status_code == 200
    r = client.post(f"/api/audits/{audit['id']}/submit", headers=tokens["auditor1"], json={})
    assert r.status_code == 200, r.text
    return audit


def _decide(client, headers, audit, decision, reason="", items=()):
    return client.post(f"/api/audits/{audit['id']}/decision", headers=headers,
                       json={"decision": decision, "reason": reason,
                             "items": [{"response_id": audit["responses"][n]["id"], "note": note,
                                        **({"category": cat} if cat else {})}
                                       for n, note, cat in items]})


def _kinds(db, audit_id):
    return {n.kind for n in db.query(Notification).filter(Notification.title.like(f"%{audit_id}%"))}


def test_approve_marks_every_question_and_the_audit(client, tokens, db):
    audit = _submitted(client, tokens, db)
    r = _decide(client, tokens["manager"], audit, "approve")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "Approved"
    assert {x["review_status"] for x in body["responses"]} == {"approved"}
    assert "audit_approved" in _kinds(db, audit["id"])


def test_approve_is_blocked_while_a_question_is_ticked(client, tokens, db):
    audit = _submitted(client, tokens, db)
    assert _decide(client, tokens["manager"], audit, "approve", items=[(0, "check", None)]).status_code == 400


def test_return_queries_the_ticked_questions_and_sends_the_audit_back(client, tokens, db):
    audit = _submitted(client, tokens, db)
    r = _decide(client, tokens["manager"], audit, "return", "Fix the photos", [(1, "Photo is blurred", "unclear_photo")])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "Changes Requested"
    assert body["decision_note"] == "Fix the photos"
    assert body["responses"][0]["review_status"] is None
    flagged = body["responses"][1]
    assert flagged["review_status"] == "query" and flagged["review_note"] == "Photo is blurred"
    assert flagged["review_category"] == "unclear_photo"
    assert "changes_requested" in _kinds(db, audit["id"])

    # Only the ticked question can be changed; the auditor fixes it and resubmits.
    assert _answer(client, tokens, audit, 0, "No").status_code == 409
    assert _answer(client, tokens, audit, 1, "Yes").status_code == 200
    r = client.post(f"/api/audits/{audit['id']}/submit", headers=tokens["auditor1"], json={})
    assert r.status_code == 200, r.text
    again = client.get(f"/api/audits/{audit['id']}", headers=tokens["manager"]).json()
    assert again["status"] == "Completed" and again["decision_note"] is None
    assert again["responses"][1]["review_status"] == "replied"


def test_return_needs_a_ticked_question_a_reason_for_each_and_an_overall_reason(client, tokens, db):
    audit = _submitted(client, tokens, db)
    assert _decide(client, tokens["manager"], audit, "return", "Fix it").status_code == 400
    assert _decide(client, tokens["manager"], audit, "return", "Fix it", [(0, " ", None)]).status_code == 400
    assert _decide(client, tokens["manager"], audit, "return", "", [(0, "why", None)]).status_code == 400
    assert _decide(client, tokens["manager"], audit, "return", "Fix it", [(0, "why", "bogus")]).status_code == 400
    assert _decide(client, tokens["manager"], audit, "return", "Fix it", [(0, "why", "wrong_answer")]).status_code == 200


def test_reject_needs_a_reason_and_the_audit_stops_counting(client, tokens, db):
    audit = _submitted(client, tokens, db)
    assert _decide(client, tokens["manager"], audit, "reject").status_code == 400
    r = _decide(client, tokens["manager"], audit, "reject", "Wrong store")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "Rejected" and r.json()["decision_note"] == "Wrong store"
    assert "audit_rejected" in _kinds(db, audit["id"])
    # A rejected audit is final.
    assert _decide(client, tokens["manager"], audit, "approve").status_code == 409
    assert _answer(client, tokens, audit, 0, "No").status_code == 409


def test_only_a_submitted_audit_and_only_a_manager_can_decide(client, tokens, db):
    audit = _start(client, tokens, _checklist(db, [(1, False)])).json()
    assert _decide(client, tokens["manager"], audit, "approve").status_code == 409
    done = _submitted(client, tokens, db)
    assert _decide(client, tokens["auditor1"], done, "approve").status_code == 403
    assert _decide(client, tokens["manager"], done, "maybe").status_code == 400


def test_reassigning_an_issue_is_kept_in_its_history(client, tokens, db, user_ids):
    import uuid

    from app.auth import hash_password
    from app.models import ROLE_AUDITEE, User, UserStore
    from test_issue_review import _raised_issue

    iid = _raised_issue(client, tokens, db, user_ids)           # with ae1 at T001
    tag = uuid.uuid4().hex[:6]
    heir = User(name=f"Heir {tag}", email=f"heir{tag}@test", password_hash=hash_password("pass"), role=ROLE_AUDITEE)
    db.add(heir)
    db.flush()
    db.add(UserStore(user_id=heir.id, store_id="T001"))
    db.commit()

    r = client.put(f"/api/issues/{iid}", headers=tokens["manager"], json={"assignee_id": heir.id})
    assert r.status_code == 200, r.text
    assert r.json()["assignee_id"] == heir.id
    assert "Reassigned from" in r.json()["meta"]["history"][-1]["reply"]


def _schedule(client, tokens, **extra):
    return client.post("/api/audits", headers=tokens["manager"], json={
        "store_id": "T001", "scheduled_at": "2030-01-15T10:00:00", **extra})


def test_several_checklists_make_one_audit_with_the_questions_combined(client, tokens, db):
    from app.models import ChecklistItem
    a = _checklist(db, [(1, False), (2, False)])
    b = _checklist(db, [(1, False), (3, True)])
    # b also contains the first question of a: it must appear once.
    shared = db.query(ChecklistItem).filter_by(checklist_id=a, sort_order=0).first().question_id
    db.add(ChecklistItem(checklist_id=b, question_id=shared, sort_order=9))
    db.commit()

    r = _schedule(client, tokens, checklist_ids=[a, b])
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["checklist_ids"] == [a, b] and body["checklist_id"] == a

    audit = client.get(f"/api/audits/{body['id']}", headers=tokens["manager"]).json()
    ids = [x["question_id"] for x in audit["responses"]]
    assert len(ids) == 4 and len(set(ids)) == 4          # 2 + 2 new + 1 shared, shared once


def test_one_checklist_still_works_and_unknown_or_inactive_ones_are_refused(client, tokens, db):
    from app.models import Checklist
    a = _checklist(db, [(1, False)])
    one = _schedule(client, tokens, checklist_id=a)
    assert one.status_code == 201 and one.json()["checklist_ids"] == [a]
    assert _schedule(client, tokens, checklist_ids=[a, "nope"]).status_code == 404
    off = _checklist(db, [(1, False)])
    db.get(Checklist, off).is_active = False
    db.commit()
    assert _schedule(client, tokens, checklist_ids=[off]).status_code == 404
    assert _schedule(client, tokens).json()["checklist_ids"] == []      # no checklist at all
