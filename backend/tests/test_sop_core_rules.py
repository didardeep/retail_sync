"""The ORIGINAL SOP audit rules (docs/SOP_Audit_Requirements.md), pinned by tests so
later work cannot quietly break them: scoring totals, N/A handling, validation,
required proof, idempotent replays, who can see what, and the audit log."""
import datetime as dt

from app.models import (
    AuditLog, SopAttachment, SopAudit, SopAuditScore, SopCriterion, SopSection,
    SopTemplate,
)
from conftest import new_id

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 40


def _put(client, headers, audit_id, template, scores, store="T001"):
    return client.put(f"/api/sop-audits/{audit_id}", headers=headers, json={
        "template_id": template.id, "store_id": store, "scores": scores})


def _full(criteria):
    """Full marks on every question that applies."""
    return [{"criterion_id": c.id, "score": c.marks} for c in criteria if not c.default_na]


def _tool(db, code):
    tpl = db.query(SopTemplate).filter_by(code=code, is_current=True).one()
    return tpl, [c for s in tpl.sections for c in s.criteria]


def _photo(client, headers, audit_id, criterion_id, att_id=None):
    return client.post(f"/api/sop-audits/{audit_id}/attachments", headers=headers,
                       data={"id": att_id or new_id(), "criterion_id": criterion_id},
                       files={"file": ("p.png", PNG, "image/png")})


# ---------------------------------------------------------------- the tools

def test_cash_and_fmcg_totals_match_the_spreadsheet(db):
    cash, cash_q = _tool(db, "CASH")
    fmcg, fmcg_q = _tool(db, "FMCG")
    assert (cash.total_marks, len(cash.sections), len(cash_q)) == (77, 5, 21)
    assert (fmcg.total_marks, len(fmcg.sections), len(fmcg_q)) == (92, 5, 23)
    # the total is the sum of the questions that apply (the "(N/A)" ones are excluded)
    assert sum(c.marks for c in fmcg_q if not c.default_na) == 92
    assert sum(c.marks for c in cash_q if not c.default_na) == 77


def test_na_tagged_questions_default_to_not_applicable(db):
    _, fmcg_q = _tool(db, "FMCG")
    default_na = {c.title.split("(")[0].strip() for c in fmcg_q if c.default_na}
    assert any(t.startswith("Live More Day") for t in default_na)
    assert any(t.startswith("WBC") for t in default_na)
    assert all("(N/A)" in c.title for c in fmcg_q if c.default_na)


def test_guide_points_follow_each_tools_minimum_rule(db):
    cash, cash_q = _tool(db, "CASH")
    fmcg, fmcg_q = _tool(db, "FMCG")
    assert all(c.min_points == 0 for c in cash_q)                       # Cash: minimum is zero
    assert all(abs(c.min_points - round(c.marks / 3, 2)) < 1e-9 for c in fmcg_q)  # FMCG: one third


# ---------------------------------------------------------------- scoring

def test_na_questions_leave_the_maximum(client, tokens, db):
    fmcg, fmcg_q = _tool(db, "FMCG")
    empty = _put(client, tokens["auditor1"], new_id(), fmcg, [])
    assert empty.json()["summary"]["max_score"] == 92          # default N/A already excluded
    cash, cash_q = _tool(db, "CASH")
    na = cash_q[0]
    r = _put(client, tokens["auditor1"], new_id(), cash, [
        {"criterion_id": na.id, "is_na": True},
        {"criterion_id": cash_q[1].id, "score": cash_q[1].marks}])
    summary = r.json()["summary"]
    assert summary["max_score"] == 77 - na.marks
    assert summary["score"] == cash_q[1].marks and summary["answered"] == 1


def test_scores_must_be_in_range_and_half_steps(client, tokens, db):
    cash, cash_q = _tool(db, "CASH")
    q = cash_q[0]
    aid = new_id()
    send = lambda value: _put(client, tokens["auditor1"], aid, cash, [{"criterion_id": q.id, "score": value}])
    assert send(q.marks + 1).status_code == 422                # above the marks
    assert send(-1).status_code == 422                         # below zero
    assert send(1.3).status_code == 422                        # not a half step
    assert send(1.5).status_code == 200
    assert send(0).status_code == 200


def test_submit_needs_every_applicable_question_answered(client, tokens, db):
    cash, cash_q = _tool(db, "CASH")
    aid = new_id()
    _put(client, tokens["auditor1"], aid, cash, _full(cash_q)[:5])
    r = client.post(f"/api/sop-audits/{aid}/submit", headers=tokens["auditor1"], json={})
    assert r.status_code == 422
    assert len(r.json()["problems"]) == 16
    assert {p["problem"] for p in r.json()["problems"]} == {"unanswered"}


def test_submit_scores_and_locks_the_audit(client, tokens, db):
    cash, cash_q = _tool(db, "CASH")
    aid = new_id()
    _put(client, tokens["auditor1"], aid, cash, _full(cash_q))
    r = client.post(f"/api/sop-audits/{aid}/submit", headers=tokens["auditor1"],
                    json={"overall_remarks": "all good"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["status"], body["score"], body["max_score"], body["percent"]) == ("Submitted", 77, 77, 100)
    assert body["overall_remarks"] == "all good" and body["submitted_at"]
    # replay is safe and changes nothing; the audit is now locked
    again = client.post(f"/api/sop-audits/{aid}/submit", headers=tokens["auditor1"], json={})
    assert again.status_code == 200 and again.json()["submitted_at"] == body["submitted_at"]
    assert _put(client, tokens["auditor1"], aid, cash, _full(cash_q)[:1]).status_code == 409


# ---------------------------------------------------------------- required proof

def test_required_proof_blocks_submit_until_provided(client, tokens, db):
    cash, cash_q = _tool(db, "CASH")
    comment_q, photo_q = cash_q[1], cash_q[2]
    comment_q.requires_comment = True
    photo_q.requires_photo = True
    db.commit()
    try:
        aid = new_id()
        _put(client, tokens["auditor1"], aid, cash, _full(cash_q))
        r = client.post(f"/api/sop-audits/{aid}/submit", headers=tokens["auditor1"], json={})
        assert r.status_code == 422
        found = {(p["criterion_id"], p["problem"]) for p in r.json()["problems"]}
        assert found == {(comment_q.id, "comment required"), (photo_q.id, "photo required")}

        scores = _full(cash_q)
        scores[1]["comment"] = "counted and matched"
        _put(client, tokens["auditor1"], aid, cash, scores)
        assert _photo(client, tokens["auditor1"], aid, photo_q.id).status_code == 201
        assert client.post(f"/api/sop-audits/{aid}/submit", headers=tokens["auditor1"],
                           json={}).status_code == 200
    finally:
        comment_q.requires_comment = False
        photo_q.requires_photo = False
        db.commit()


# ---------------------------------------------------------------- idempotent replays

def test_saving_the_same_audit_twice_does_not_duplicate_anything(client, tokens, db):
    cash, cash_q = _tool(db, "CASH")
    aid = new_id()
    scores = _full(cash_q)[:4]
    first = _put(client, tokens["auditor1"], aid, cash, scores).json()
    second = _put(client, tokens["auditor1"], aid, cash, scores).json()
    assert len(first["scores"]) == len(second["scores"]) == 4
    assert db.query(SopAudit).filter_by(id=aid).count() == 1


def test_photo_upload_replay_and_authenticated_download(client, tokens, db):
    cash, cash_q = _tool(db, "CASH")
    aid, att = new_id(), new_id()
    _put(client, tokens["auditor1"], aid, cash, [])
    assert _photo(client, tokens["auditor1"], aid, cash_q[0].id, att).status_code == 201
    assert _photo(client, tokens["auditor1"], aid, cash_q[0].id, att).status_code in (200, 201)
    assert db.query(SopAttachment).filter_by(id=att).count() == 1
    url = f"/api/sop-audits/attachments/{att}"
    assert client.get(url).status_code == 401                                   # no login
    assert client.get(url, headers=tokens["auditor2"]).status_code == 404       # someone else's
    own = client.get(url, headers=tokens["auditor1"])
    assert own.status_code == 200 and own.content == PNG
    assert client.get(url, headers=tokens["manager"]).status_code == 200
    # deleting twice is fine
    for _ in range(2):
        assert client.delete(f"/api/sop-audits/{aid}/attachments/{att}",
                             headers=tokens["auditor1"]).status_code == 200


# ---------------------------------------------------------------- who can see and do what

def test_auditors_only_see_and_change_their_own_audits(client, tokens, db):
    cash, cash_q = _tool(db, "CASH")
    aid = new_id()
    _put(client, tokens["auditor1"], aid, cash, _full(cash_q)[:2])
    assert client.get(f"/api/sop-audits/{aid}", headers=tokens["auditor2"]).status_code == 404
    mine = {a["id"] for a in client.get("/api/sop-audits", headers=tokens["auditor1"]).json()}
    theirs = {a["id"] for a in client.get("/api/sop-audits", headers=tokens["auditor2"]).json()}
    assert aid in mine and aid not in theirs
    assert client.post(f"/api/sop-audits/{aid}/submit", headers=tokens["auditor2"], json={}).status_code == 403
    assert _photo(client, tokens["auditor2"], aid, cash_q[0].id).status_code == 403
    for who in ("manager", "admin"):
        assert client.get(f"/api/sop-audits/{aid}", headers=tokens[who]).status_code == 200


def test_managers_and_store_managers_cannot_run_audits(client, tokens, db):
    cash, cash_q = _tool(db, "CASH")
    for who in ("manager", "sm1"):
        assert _put(client, tokens[who], new_id(), cash, []).status_code == 403
    aid = new_id()
    _put(client, tokens["auditor1"], aid, cash, _full(cash_q))
    client.post(f"/api/sop-audits/{aid}/submit", headers=tokens["auditor1"], json={})
    assert client.post(f"/api/sop-audits/{aid}/submit", headers=tokens["sm1"], json={}).status_code == 403
    assert client.get(f"/api/sop-audits/{aid}", headers=tokens["sm1"]).status_code == 200   # read only


# ---------------------------------------------------------------- audit log

def test_create_and_submit_are_written_to_the_audit_log(client, tokens, db):
    cash, cash_q = _tool(db, "CASH")
    aid = new_id()
    _put(client, tokens["auditor1"], aid, cash, _full(cash_q))
    client.post(f"/api/sop-audits/{aid}/submit", headers=tokens["auditor1"], json={})
    client.post(f"/api/sop-audits/{aid}/submit", headers=tokens["auditor1"], json={})   # replay
    actions = [r.action for r in db.query(AuditLog).filter_by(entity_type="sop_audit", entity_id=aid)]
    assert sorted(actions) == ["create_sop_audit", "submit_sop_audit"]     # once each, not on replay


# ------------------------------------------------- old question ids after a re-publish

def test_answers_keyed_by_an_older_version_of_the_question_still_sync(client, tokens, db, user_ids):
    """A phone downloaded a planned audit, then the tool was re-published and the audit moved to
    the new version. The phone still sends the old ids; the server maps them by stable key."""
    t1 = SopTemplate(code="KEYT", name="Key test", version=1, is_current=False, total_marks=4, min_rule="zero")
    s1 = SopSection(template=t1, code="A", name="Section", sort_order=0, stable_key="sec-a")
    q1 = SopCriterion(section=s1, title="Q1", marks=4, sort_order=0, min_points=0, stable_key="key-q1")
    t2 = SopTemplate(code="KEYT", name="Key test", version=2, is_current=True, total_marks=5, min_rule="zero")
    s2 = SopSection(template=t2, code="A", name="Section", sort_order=0, stable_key="sec-a")
    q2 = SopCriterion(section=s2, title="Q1 reworded", marks=5, sort_order=0, min_points=0, stable_key="key-q1")
    db.add_all([t1, t2])
    db.commit()
    aid = new_id()
    db.add(SopAudit(id=aid, template_id=t2.id, store_id="T001", auditor_id=user_ids["auditor1@test"],
                    status="Planned", scheduled_at=dt.datetime(2034, 1, 5, 9, 0)))
    db.commit()
    try:
        r = _put(client, tokens["auditor1"], aid, t1, [{"criterion_id": q1.id, "score": 3}])
        assert r.status_code == 200, r.text
        assert r.json()["template_id"] == t2.id and r.json()["status"] == "Draft"
        assert [s["criterion_id"] for s in r.json()["scores"]] == [q2.id]    # stored on the new version
        assert r.json()["summary"]["max_score"] == 5                          # scored against the new marks
        # a score above the OLD marks but within the new ones is judged by the new marks
        assert _put(client, tokens["auditor1"], aid, t1, [{"criterion_id": q1.id, "score": 5}]).status_code == 200
        # photos keyed by the old id are accepted too
        up = _photo(client, tokens["auditor1"], aid, q1.id)
        assert up.status_code == 201 and up.json()["criterion_id"] == q2.id
        # a question from a different tool is still refused
        other = _tool(db, "CASH")[1][0]
        assert _put(client, tokens["auditor1"], aid, t1, [{"criterion_id": other.id, "score": 1}]).status_code == 422
    finally:
        db.query(SopAttachment).filter_by(audit_id=aid).delete()
        db.query(SopAuditScore).filter_by(audit_id=aid).delete()
        db.query(SopAudit).filter_by(id=aid).delete()
        db.delete(db.get(SopTemplate, t1.id))
        db.delete(db.get(SopTemplate, t2.id))
        db.commit()
