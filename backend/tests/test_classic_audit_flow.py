"""Classic checklist audits run by an auditor: start, answer, submit, and the
guards around them (answer validation, no double submit, ownership, scoping)."""
import uuid

from app.models import Checklist, ChecklistItem, Issue, Question


def _checklist(db, specs):
    """A checklist of questions; specs are (weight, is_critical) pairs."""
    tag = uuid.uuid4().hex[:6]
    cl = Checklist(name=f"Flow {tag}", is_active=True)
    db.add(cl)
    db.flush()
    for n, (weight, critical) in enumerate(specs):
        q = Question(code=f"F{tag}{n}", text=f"Flow question {tag} {n}",
                     process="Cashiering", weight=weight, is_critical=critical)
        db.add(q)
        db.flush()
        db.add(ChecklistItem(checklist_id=cl.id, question_id=q.id, sort_order=n))
    db.commit()
    return cl.id


def _start(client, tokens, checklist_id, who="auditor1", store="T001"):
    return client.post("/api/audits/start", headers=tokens[who],
                       json={"store_id": store, "checklist_id": checklist_id})


def _answer(client, tokens, audit, n, answer, who="auditor1", **extra):
    rid = audit["responses"][n]["id"]
    return client.put(f"/api/audits/{audit['id']}/responses/{rid}",
                      headers=tokens[who], json={"answer": answer, **extra})


def test_start_creates_an_ongoing_audit_with_the_questions(client, tokens, db, user_ids):
    cl = _checklist(db, [(1, False), (2, False), (1, True)])
    r = _start(client, tokens, cl)
    assert r.status_code == 200, r.text
    a = r.json()
    assert a["status"] == "Ongoing"
    assert a["auditor_id"] == user_ids["auditor1@test"]
    assert a["audit_type"] == "Checklist based Audit"
    assert a["scheduled_at"]
    assert len(a["responses"]) == 3
    assert a["progress"] == {"answered": 0, "total": 3}


def test_start_is_idempotent_per_store_and_checklist(client, tokens, db):
    cl = _checklist(db, [(1, False)])
    first = _start(client, tokens, cl).json()
    again = _start(client, tokens, cl).json()
    assert again["id"] == first["id"]
    assert len(again["responses"]) == 1
    other_store = _start(client, tokens, cl, store="T002").json()
    assert other_store["id"] != first["id"]
    other_auditor = _start(client, tokens, cl, who="auditor2").json()
    assert other_auditor["id"] != first["id"]


def test_start_validates_input_and_role(client, tokens, db):
    cl = _checklist(db, [(1, False)])
    assert _start(client, tokens, cl, store="NOPE").status_code == 404
    assert _start(client, tokens, "nochecklist").status_code == 404
    db.get(Checklist, cl).is_active = False
    db.commit()
    assert _start(client, tokens, cl).status_code == 404
    db.get(Checklist, cl).is_active = True
    db.commit()
    for who in ("manager", "admin", "sm1"):
        assert _start(client, tokens, cl, who=who).status_code == 403, who


def test_answer_validation(client, tokens, db):
    cl = _checklist(db, [(1, False)])
    a = _start(client, tokens, cl).json()
    assert _answer(client, tokens, a, 0, "Maybe").status_code == 422
    assert _answer(client, tokens, a, 0, "Yes", risk="Severe").status_code == 422
    for ok in ("Yes", "No", "Partial", "NA"):
        assert _answer(client, tokens, a, 0, ok).status_code == 200, ok
    for risk in ("None", "Low", "Medium", "High", "Critical", ""):
        assert _answer(client, tokens, a, 0, "Yes", risk=risk).status_code == 200, risk
    r = _answer(client, tokens, a, 0, "")
    assert r.status_code == 200 and r.json()["answer"] == ""
    r = _answer(client, tokens, a, 0, None)
    assert r.status_code == 200 and r.json()["answer"] is None


def test_first_answer_moves_planned_to_ongoing(client, tokens, db, user_ids):
    cl = _checklist(db, [(1, False), (1, False)])
    r = client.post("/api/audits", headers=tokens["manager"], json={
        "store_id": "T001", "checklist_id": cl, "scheduled_at": "2034-05-01T09:00:00",
        "auditor_id": user_ids["auditor1@test"]})
    assert r.status_code == 201, r.text
    aid = r.json()["id"]
    audit = client.get(f"/api/audits/{aid}", headers=tokens["auditor1"]).json()
    assert audit["status"] == "Planned" and len(audit["responses"]) == 2
    assert _answer(client, tokens, audit, 0, "Yes").status_code == 200
    got = client.get(f"/api/audits/{aid}", headers=tokens["auditor1"]).json()
    assert got["status"] == "Ongoing"


def test_submit_scores_with_weights_and_ignores_na(client, tokens, db):
    cl = _checklist(db, [(2, False), (1, False)])
    a = _start(client, tokens, cl).json()
    _answer(client, tokens, a, 0, "Yes")
    _answer(client, tokens, a, 1, "No")
    r = client.post(f"/api/audits/{a['id']}/submit", headers=tokens["auditor1"])
    assert r.status_code == 200, r.text
    assert r.json()["audit"]["score"] == 66.67
    assert r.json()["audit"]["status"] == "Completed"

    cl = _checklist(db, [(1, False), (1, False), (2, False)])
    a = _start(client, tokens, cl).json()
    _answer(client, tokens, a, 0, "Partial")
    _answer(client, tokens, a, 1, "Yes")
    _answer(client, tokens, a, 2, "NA")
    r = client.post(f"/api/audits/{a['id']}/submit", headers=tokens["auditor1"])
    assert r.json()["audit"]["score"] == 75.0


def test_submit_needs_every_answer(client, tokens, db):
    cl = _checklist(db, [(1, False), (1, False)])
    a = _start(client, tokens, cl).json()
    _answer(client, tokens, a, 0, "Yes")
    r = client.post(f"/api/audits/{a['id']}/submit", headers=tokens["auditor1"])
    assert r.status_code == 400
    assert r.json()["count"] == 1


def test_critical_no_raises_exactly_one_issue_and_resubmit_is_409(client, tokens, db):
    cl = _checklist(db, [(1, True), (1, False)])
    a = _start(client, tokens, cl).json()
    _answer(client, tokens, a, 0, "No")
    _answer(client, tokens, a, 1, "Yes")
    first = client.post(f"/api/audits/{a['id']}/submit", headers=tokens["auditor1"])
    assert first.status_code == 200 and first.json()["issues_raised"] == 1
    second = client.post(f"/api/audits/{a['id']}/submit", headers=tokens["auditor1"])
    assert second.status_code == 409
    db.expire_all()
    assert db.query(Issue).filter_by(audit_id=a["id"]).count() == 1


def test_auditor_cannot_touch_someone_elses_audit(client, tokens, db):
    cl = _checklist(db, [(1, False)])
    a = _start(client, tokens, cl).json()
    assert _answer(client, tokens, a, 0, "Yes", who="auditor2").status_code == 403
    assert client.get(f"/api/audits/{a['id']}", headers=tokens["auditor2"]).status_code == 403
    r = client.post(f"/api/audits/{a['id']}/submit", headers=tokens["auditor2"])
    assert r.status_code == 404 or r.status_code == 403
    got = client.get(f"/api/audits/{a['id']}", headers=tokens["auditor1"]).json()
    assert got["status"] == "Ongoing" and got["responses"][0]["answer"] is None


def test_list_items_carry_progress(client, tokens, db):
    cl = _checklist(db, [(1, False), (1, False), (1, False)])
    a = _start(client, tokens, cl).json()
    _answer(client, tokens, a, 0, "Yes")
    _answer(client, tokens, a, 1, "No")
    _answer(client, tokens, a, 1, "")
    _answer(client, tokens, a, 2, "NA")
    rows = client.get("/api/audits", headers=tokens["auditor1"]).json()
    row = next(x for x in rows if x["id"] == a["id"])
    assert row["progress"] == {"answered": 2, "total": 3}
    # the manager's list carries it too
    rows = client.get("/api/audits", headers=tokens["manager"]).json()
    assert all("progress" in x for x in rows)


def test_sop_list_items_carry_progress(client, tokens):
    rows = client.get("/api/sop-audits", headers=tokens["manager"]).json()
    for row in rows:
        assert set(row["progress"]) == {"answered", "total"}


def test_auditor_only_sees_issues_from_their_own_audits(client, tokens, db):
    cl = _checklist(db, [(1, True)])
    mine = _start(client, tokens, cl, who="auditor1").json()
    theirs = _start(client, tokens, cl, who="auditor2").json()
    for audit, who in ((mine, "auditor1"), (theirs, "auditor2")):
        _answer(client, tokens, audit, 0, "No", who=who)
        r = client.post(f"/api/audits/{audit['id']}/submit", headers=tokens[who])
        assert r.status_code == 200, r.text
    loose = client.post("/api/issues", headers=tokens["manager"],
                        json={"title": "Not from an audit", "store_id": "T001"}).json()

    ids = {i["id"] for i in client.get("/api/issues", headers=tokens["auditor1"]).json()}
    audit_ids = {i["audit_id"] for i in client.get("/api/issues", headers=tokens["auditor1"]).json()}
    assert mine["id"] in audit_ids
    assert theirs["id"] not in audit_ids
    assert loose["id"] not in ids
    manager_ids = {i["id"] for i in client.get("/api/issues", headers=tokens["manager"]).json()}
    assert loose["id"] in manager_ids
