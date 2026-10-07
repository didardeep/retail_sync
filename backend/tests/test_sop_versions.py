"""Questionnaire versioning: publishing a tool as a new version, what stays on
the old version, and how the dashboard follows a question across versions.

Every test works on its own tool code (created by `make_tool`), and the
fixture removes it afterwards, so CASH and FMCG are left as they were."""
import copy

import pytest
from openpyxl import Workbook

from app.models import SopAudit, SopTemplate
from app.sop_versions import diff_tree, publish_version, tree_of, validate_tree
from conftest import new_id
from import_sop import import_sop, upsert_template


def _crit(title, marks, **extra):
    return {"key": None, "title": title, "marks": marks, "max_text": "Always",
            "avg_text": "Sometimes", "min_text": "Never", "default_na": False,
            "requires_comment": False, "requires_photo": False, **extra}


def base_tree(code="X"):
    return {"code": code, "name": f"{code} tool", "min_rule": "zero", "sections": [
        {"key": None, "code": "A", "name": "Cash", "criteria": [
            _crit("Count the till", 4), _crit("Lock the safe", 2)]},
        {"key": None, "code": "B", "name": "Stock", "criteria": [
            _crit("Check the shelves", 2)]},
    ]}


@pytest.fixture()
def make_tool(client, db):
    """make_tool(code) -> current v1 template of a new tool; removed afterwards."""
    codes = []

    def make(code):
        codes.append(code)
        return publish_version(db, code, base_tree(code)).template

    make.track = codes.append
    yield make
    db.expire_all()
    for tpl in db.query(SopTemplate).filter(SopTemplate.code.in_(codes)).all():
        for audit in db.query(SopAudit).filter_by(template_id=tpl.id).all():
            db.delete(audit)
    db.commit()
    for tpl in db.query(SopTemplate).filter(SopTemplate.code.in_(codes)).all():
        db.delete(tpl)
    db.commit()


def publish(client, tokens, code, tree, base, note="change", who="manager"):
    return client.post(f"/api/sop-admin/tools/{code}/publish", headers=tokens[who],
                       json={"tree": tree, "base_version": base, "change_note": note})


def current_tree(client, tokens, code):
    r = client.get(f"/api/sop-admin/tools/{code}/current", headers=tokens["manager"])
    assert r.status_code == 200, r.text
    return copy.deepcopy(r.json()["tree"]), r.json()["base_version"]


def answer_and_submit(client, tokens, template, store="T001", who="auditor1",
                      scores=None, submit=True):
    """Audit every criterion of `template` (full marks unless `scores` maps a
    criterion title to a score) and submit it; returns the audit id."""
    aid = new_id()
    items = []
    for sec in template.sections:
        for c in sec.criteria:
            value = (scores or {}).get(c.title, c.marks)
            items.append({"criterion_id": c.id, "score": value})
    r = client.put(f"/api/sop-audits/{aid}", headers=tokens[who], json={
        "template_id": template.id, "store_id": store, "scores": items})
    assert r.status_code == 200, r.text
    if submit:
        r = client.post(f"/api/sop-audits/{aid}/submit", headers=tokens[who], json={})
        assert r.status_code == 200, r.text
    return aid


# --------------------------------------------------------------------------
def test_publish_creates_next_version_and_leaves_the_old_one_alone(client, tokens, db, make_tool):
    v1 = make_tool("TVA")
    v1_id, before = v1.id, tree_of(v1, with_ids=True)
    tree, base = current_tree(client, tokens, "TVA")
    tree["sections"][0]["criteria"][0]["marks"] = 5
    tree["sections"][0]["criteria"][0]["requires_photo"] = True
    r = publish(client, tokens, "TVA", tree, base, "More marks for the till")
    assert r.status_code == 200, r.text
    assert r.json()["version"] == 2 and r.json()["unchanged"] is False

    db.expire_all()
    old = db.get(SopTemplate, v1_id)
    assert old.is_current is False and old.version == 1
    assert tree_of(old, with_ids=True) == before          # untouched, ids included
    new = db.query(SopTemplate).filter_by(code="TVA", version=2).one()
    assert new.is_current is True and new.id != v1_id
    assert new.change_note == "More marks for the till" and new.created_by_id
    assert new.published_at is not None
    assert new.total_marks == 9
    first = new.sections[0].criteria[0]
    assert first.marks == 5 and first.requires_photo is True
    assert {c.id for s in new.sections for c in s.criteria}.isdisjoint(
        {c.id for s in old.sections for c in s.criteria})
    assert [s.code for s in new.sections] == ["A", "B"]


def test_old_audit_keeps_its_score_after_marks_change(client, tokens, db, make_tool):
    v1 = make_tool("TVB")
    aid = answer_and_submit(client, tokens, v1, scores={"Count the till": 2})
    first = client.get(f"/api/sop-audits/{aid}", headers=tokens["manager"]).json()["summary"]
    assert (first["score"], first["max_score"]) == (6, 8)

    tree, base = current_tree(client, tokens, "TVB")
    tree["sections"][0]["criteria"][0]["marks"] = 10
    tree["sections"][0]["criteria"][1]["title"] = "Lock the safe every night"
    assert publish(client, tokens, "TVB", tree, base).status_code == 200

    again = client.get(f"/api/sop-audits/{aid}", headers=tokens["manager"]).json()
    assert (again["summary"]["score"], again["summary"]["max_score"]) == (6, 8)
    detail_titles = [c["title"] for c in
                     client.get(f"/api/sop-audits/templates/{v1.id}",
                                headers=tokens["manager"]).json()["sections"][0]["criteria"]]
    assert detail_titles == ["Count the till", "Lock the safe"]


def test_template_list_shows_only_the_new_version(client, tokens, db, make_tool):
    v1 = make_tool("TVC")
    tree, base = current_tree(client, tokens, "TVC")
    tree["name"] = "Renamed tool"
    publish(client, tokens, "TVC", tree, base)
    rows = [t for t in client.get("/api/sop-audits/templates", headers=tokens["auditor1"]).json()
            if t["code"] == "TVC"]
    assert len(rows) == 1 and rows[0]["version"] == 2 and rows[0]["id"] != v1.id
    assert rows[0]["name"] == "Renamed tool"


def test_draft_on_the_old_version_can_still_finish(client, tokens, db, make_tool):
    v1 = make_tool("TVD")
    aid = answer_and_submit(client, tokens, v1, submit=False)       # a Draft on v1
    tree, base = current_tree(client, tokens, "TVD")
    tree["sections"][0]["criteria"][0]["marks"] = 6
    publish(client, tokens, "TVD", tree, base)

    crit = v1.sections[0].criteria[0]
    r = client.put(f"/api/sop-audits/{aid}", headers=tokens["auditor1"], json={
        "template_id": v1.id, "store_id": "T001",
        "scores": [{"criterion_id": crit.id, "score": 1}]})
    assert r.status_code == 200 and r.json()["template_id"] == v1.id
    done = client.post(f"/api/sop-audits/{aid}/submit", headers=tokens["auditor1"], json={})
    assert done.status_code == 200 and done.json()["status"] == "Submitted"
    assert done.json()["summary"]["max_score"] == 8      # still the v1 marks


def test_new_audit_on_a_superseded_version_is_still_accepted(client, tokens, db, make_tool):
    v1 = make_tool("TVE")
    tree, base = current_tree(client, tokens, "TVE")
    tree["sections"][1]["criteria"][0]["marks"] = 3
    publish(client, tokens, "TVE", tree, base)
    aid = answer_and_submit(client, tokens, v1)       # D21: an offline audit must sync
    got = client.get(f"/api/sop-audits/{aid}", headers=tokens["manager"]).json()
    assert got["template_id"] == v1.id and got["template_version"] == 1


def test_planned_audits_move_unless_started(client, tokens, db, user_ids, make_tool):
    v1 = make_tool("TVF")
    idle = SopAudit(id=new_id(), template_id=v1.id, store_id="T001",
                    auditor_id=user_ids["auditor1@test"], status="Planned")
    started = SopAudit(id=new_id(), template_id=v1.id, store_id="T001",
                       auditor_id=user_ids["auditor1@test"], status="Planned")
    draft = SopAudit(id=new_id(), template_id=v1.id, store_id="T001",
                     auditor_id=user_ids["auditor1@test"], status="Draft")
    db.add_all([idle, started, draft])
    db.commit()
    # the auditor saved a score, then the status was put back to Planned
    r = client.put(f"/api/sop-audits/{started.id}", headers=tokens["auditor1"], json={
        "template_id": v1.id, "store_id": "T001",
        "scores": [{"criterion_id": v1.sections[0].criteria[0].id, "score": 1}]})
    assert r.status_code == 200
    started.status = "Planned"
    db.commit()

    tree, base = current_tree(client, tokens, "TVF")
    tree["sections"][0]["name"] = "Cash handling"
    resp = publish(client, tokens, "TVF", tree, base)
    assert resp.status_code == 200 and resp.json()["moved_audits"] == 1

    db.expire_all()
    v2 = db.query(SopTemplate).filter_by(code="TVF", version=2).one()
    assert db.get(SopAudit, idle.id).template_id == v2.id
    assert db.get(SopAudit, started.id).template_id == v1.id      # has scores
    assert db.get(SopAudit, draft.id).template_id == v1.id        # not Planned
    assert db.get(SopAudit, idle.id).store_id == "T001"


def test_unchanged_publish_is_a_no_op(client, tokens, db, make_tool):
    make_tool("TVG")
    tree, base = current_tree(client, tokens, "TVG")
    r = publish(client, tokens, "TVG", tree, base, "nothing")
    assert r.status_code == 200
    assert r.json()["unchanged"] is True and r.json()["version"] == 1
    assert db.query(SopTemplate).filter_by(code="TVG").count() == 1


def test_stale_base_version_is_a_conflict(client, tokens, db, make_tool):
    make_tool("TVH")
    tree, base = current_tree(client, tokens, "TVH")
    tree["name"] = "Second"
    assert publish(client, tokens, "TVH", tree, base).status_code == 200
    tree["name"] = "Third"
    r = publish(client, tokens, "TVH", tree, base)            # base is now stale
    assert r.status_code == 409
    assert r.json()["current_version"] == 2 and r.json()["error"]
    assert db.query(SopTemplate).filter_by(code="TVH").count() == 2


def test_invalid_tree_lists_every_problem(client, tokens, db, make_tool):
    make_tool("TVI")
    tree, base = current_tree(client, tokens, "TVI")
    tree["sections"][0]["criteria"][0]["marks"] = 0
    tree["sections"][0]["criteria"][1]["marks"] = 1.25
    tree["sections"][0]["criteria"][1]["title"] = "  "
    tree["sections"][1]["criteria"] = []
    tree["sections"][1]["code"] = "A"
    r = publish(client, tokens, "TVI", tree, base)
    assert r.status_code == 422
    errors = r.json()["errors"]
    assert len(errors) >= 5
    text = " | ".join(errors)
    assert "marks must be above 0" in text and "question text is required" in text
    assert "at least one question" in text and "used twice" in text
    assert db.query(SopTemplate).filter_by(code="TVI").count() == 1


def test_validate_tree_rules():
    ok = base_tree()
    assert validate_tree(ok) == []
    assert validate_tree({**ok, "sections": []}) == ["A tool needs at least one section"]
    t = copy.deepcopy(ok)
    t["sections"][0]["criteria"][0]["max_text"] = ""
    assert any("Best text" in e for e in validate_tree(t))
    t["sections"][0]["criteria"][0]["default_na"] = True        # N/A by default: no rubric needed
    assert validate_tree(t) == []
    t["sections"][0]["criteria"][1]["key"] = "k"
    t["sections"][1]["criteria"][0]["key"] = "k"
    assert any("key k is used twice" in e for e in validate_tree(t))


def test_only_managers_may_use_the_admin_endpoints(client, tokens, make_tool):
    make_tool("TVJ")
    tree = base_tree("TVJ")
    for who in ("auditor1", "sm1"):
        assert client.get("/api/sop-admin/tools", headers=tokens[who]).status_code == 403
        assert client.get("/api/sop-admin/tools/TVJ/current", headers=tokens[who]).status_code == 403
        assert publish(client, tokens, "TVJ", tree, 1, who=who).status_code == 403
    assert client.get("/api/sop-admin/tools").status_code in (401, 403)
    assert publish(client, tokens, "NOPE", tree, 1).status_code == 404


def test_keys_follow_kept_questions_and_new_ones_get_fresh_keys(client, tokens, db, make_tool):
    v1 = make_tool("TVK")
    old = tree_of(v1)
    tree, base = current_tree(client, tokens, "TVK")
    tree["sections"][0]["criteria"].reverse()                     # reorder within section
    tree["sections"][0]["criteria"].append(_crit("A brand new question", 1))
    tree["sections"].append({"key": None, "code": "", "name": "New section",
                             "criteria": [_crit("In the new section", 2)]})
    r = publish(client, tokens, "TVK", tree, base)
    assert r.status_code == 200, r.text
    db.expire_all()
    new = tree_of(db.query(SopTemplate).filter_by(code="TVK", version=2).one())
    old_keys = {c["key"] for s in old["sections"] for c in s["criteria"]}
    kept = new["sections"][0]["criteria"]
    assert [c["title"] for c in kept] == ["Lock the safe", "Count the till", "A brand new question"]
    assert kept[0]["key"] == old["sections"][0]["criteria"][1]["key"]
    assert kept[1]["key"] == old["sections"][0]["criteria"][0]["key"]
    assert kept[2]["key"] not in old_keys and kept[2]["key"]
    assert new["sections"][0]["key"] == old["sections"][0]["key"]
    assert new["sections"][2]["key"] not in {s["key"] for s in old["sections"]}
    assert new["sections"][2]["code"] == "C"                      # blank code -> next letter
    diff = diff_tree(old, new)
    assert diff["summary"]["added"] == 3 and diff["summary"]["reordered"] == 2


def test_diff_reports_field_changes(client, tokens, db, make_tool):
    old = tree_of(make_tool("TVL"))
    new = copy.deepcopy(old)
    new["sections"][0]["criteria"][0]["marks"] = 3
    new["sections"][1]["criteria"][0]["requires_comment"] = True
    removed = new["sections"][0]["criteria"].pop(1)
    diff = diff_tree(old, new)
    assert diff["summary"] == {"added": 0, "removed": 1, "changed": 2,
                               "reordered": 0, "total": 3}
    assert diff["removed"][0]["label"] == removed["title"]
    fields = {f["field"] for ch in diff["changed"] for f in ch["fields"]}
    assert fields == {"marks", "requires_comment"}


def test_tool_list_and_version_views(client, tokens, db, make_tool):
    v1 = make_tool("TVM")
    answer_and_submit(client, tokens, v1)
    tree, base = current_tree(client, tokens, "TVM")
    tree["name"] = "TVM renamed"
    publish(client, tokens, "TVM", tree, base, "rename")
    tools = {t["code"]: t for t in client.get("/api/sop-admin/tools", headers=tokens["manager"]).json()}
    tool = tools["TVM"]
    assert tool["current"]["version"] == 2 and tool["current"]["change_note"] == "rename"
    assert [v["version"] for v in tool["versions"]] == [2, 1]
    assert tool["versions"][1]["audit_count"] == 1 and tool["versions"][0]["audit_count"] == 0
    assert {"CASH", "FMCG"} <= set(tools)
    one = client.get("/api/sop-admin/tools/TVM/versions/1", headers=tokens["manager"]).json()
    assert one["tree"]["name"] == "TVM tool" and one["tree"]["sections"][0]["id"]
    assert client.get("/api/sop-admin/tools/TVM/versions/9", headers=tokens["manager"]).status_code == 404


def test_dashboard_follows_a_question_across_versions(client, tokens, db, make_tool):
    v1 = make_tool("TVN")
    first = answer_and_submit(client, tokens, v1, store="T002",
                              scores={"Count the till": 2})          # 6 of 8
    tree, base = current_tree(client, tokens, "TVN")
    till_key = tree["sections"][0]["criteria"][0]["key"]
    tree["sections"][0]["criteria"][0]["marks"] = 6
    publish(client, tokens, "TVN", tree, base)
    v2 = db.query(SopTemplate).filter_by(code="TVN", version=2).one()
    second = answer_and_submit(client, tokens, v2, store="T002",
                               scores={"Count the till": 3})         # 7 of 10

    data = client.get("/api/sop-dashboard", headers=tokens["manager"]).json()
    tools = [t for t in data["tools"] if t["code"] == "TVN"]
    assert len(tools) == 1 and tools[0]["id"] == v2.id and tools[0]["total_marks"] == 10
    crit = [c for c in data["criteria"] if c["template_code"] == "TVN"]
    assert len(crit) == 3 and till_key in {c["key"] for c in crit}      # one entry per question
    assert next(c for c in crit if c["key"] == till_key)["marks"] == 6  # newest version wins

    rows = [r for r in data["criterion_scores"] if r["audit_id"] in (first, second)]
    till = sorted((r["marks"], r["score"]) for r in rows if r["criterion_key"] == till_key)
    assert till == [(4, 2), (6, 3)]                                     # each audit's own marks
    assert all(r["criterion_id"] for r in rows)

    audits = {a["id"]: a for a in data["audits"]}
    assert audits[first]["prev_percent"] is None
    assert audits[second]["prev_percent"] == audits[first]["percent"] == 75.0
    assert audits[second]["template_version"] == 2


def _sheet(first_marks=4):
    ws = Workbook().active
    ws.title = "Import Test Tool"
    ws.append(["title"])
    ws.append(["columns"])
    ws.append(["Section A: Cash | note", None, None, None, None])
    ws.append(["Count the till", first_marks, "Always", "Sometimes", "Never"])
    ws.append(["Lock the safe", 2, "Always", "NA", "Never"])
    ws.append(["Section B: Stock", None, None, None, None])
    ws.append(["Check the shelves (N/A)", 2, None, None, None])
    return ws


def test_import_twice_publishes_once_and_keeps_proof_flags(client, db, make_tool):
    make_tool.track("TVO")
    tpl, n_sec, n_crit, published = upsert_template(db, _sheet(), "TVO", "third")
    assert published and tpl.version == 1 and (n_sec, n_crit) == (2, 3)
    assert tpl.total_marks == 6 and tpl.sections[0].criteria[0].min_points == 1.33

    again = upsert_template(db, _sheet(), "TVO", "third")
    assert again[3] is False and again[0].id == tpl.id

    # a manager turns on photo proof (a publish); the sheet has no say in that
    tree = tree_of(tpl)
    tree["sections"][0]["criteria"][0]["requires_photo"] = True
    v2 = publish_version(db, "TVO", tree, None, 1).template
    assert v2.version == 2
    third = upsert_template(db, _sheet(), "TVO", "third")
    assert third[3] is False and third[0].id == v2.id
    assert v2.sections[0].criteria[0].requires_photo is True

    # a real change in the sheet publishes v3 and keeps keys and flags
    fourth = upsert_template(db, _sheet(first_marks=5), "TVO", "third")
    assert fourth[3] is True and fourth[0].version == 3
    kept = fourth[0].sections[0].criteria[0]
    assert kept.requires_photo is True and kept.marks == 5
    assert kept.stable_key == v2.sections[0].criteria[0].stable_key


def test_seeded_tools_are_not_republished_by_import(client, db):
    before = db.query(SopTemplate).filter(SopTemplate.code.in_(["CASH", "FMCG"])).count()
    import_sop()
    import_sop()
    after = db.query(SopTemplate).filter(SopTemplate.code.in_(["CASH", "FMCG"])).count()
    assert after == before
