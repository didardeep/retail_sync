"""The unified PATCH /api/audits/{id} (manager or admin edit) and ADMIN access
to the SOP endpoints. These cover the places where the assistant/admin work and
the SOP scheduling work meet."""
import datetime as dt

from conftest import new_id


def _classic_audit(client, tokens, user_ids, when, store="T001"):
    r = client.post("/api/audits", headers=tokens["manager"], json={
        "store_id": store, "scheduled_at": when, "auditor_id": user_ids["auditor1@test"]})
    assert r.status_code == 201, r.text
    return r.json()


def test_status_edit_with_unchanged_date_and_auditor_is_accepted(client, tokens, user_ids):
    """The Audit Status edit form always sends status, date and auditor."""
    audit = _classic_audit(client, tokens, user_ids, "2033-02-01T09:00:00")
    url = f"/api/audits/{audit['id']}"
    r = client.patch(url, headers=tokens["manager"], json={
        "status": "Ongoing", "scheduled_at": "2033-02-01T09:00",
        "auditor_id": user_ids["auditor1@test"]})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "Ongoing"
    # now started: the same form with the same date and auditor must still work
    r = client.patch(url, headers=tokens["manager"], json={
        "status": "Completed", "scheduled_at": "2033-02-01T09:00",
        "auditor_id": user_ids["auditor1@test"]})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "Completed"


def test_old_status_words_are_rejected(client, tokens, user_ids):
    audit = _classic_audit(client, tokens, user_ids, "2033-02-02T09:00:00")
    url = f"/api/audits/{audit['id']}"
    for bad in ("In Progress", "Overdue", "whatever"):
        r = client.patch(url, headers=tokens["manager"], json={"status": bad})
        assert r.status_code == 422, (bad, r.text)
    assert client.get(url, headers=tokens["manager"]).json()["status"] == "Planned"


def test_date_and_auditor_only_change_while_planned(client, tokens, user_ids):
    audit = _classic_audit(client, tokens, user_ids, "2033-02-03T09:00:00")
    url = f"/api/audits/{audit['id']}"
    moved = client.patch(url, headers=tokens["manager"], json={"scheduled_at": "2033-02-04T09:00:00"})
    assert moved.status_code == 200 and moved.json()["scheduled_at"].startswith("2033-02-04")
    client.patch(url, headers=tokens["manager"], json={"status": "Ongoing"})
    r = client.patch(url, headers=tokens["manager"], json={"scheduled_at": "2033-02-05T09:00:00"})
    assert r.status_code == 409
    r = client.patch(url, headers=tokens["manager"], json={"auditor_id": user_ids["auditor2@test"]})
    assert r.status_code == 409


def test_an_auditor_can_be_unassigned_while_planned(client, tokens, user_ids):
    audit = _classic_audit(client, tokens, user_ids, "2033-02-06T09:00:00")
    r = client.patch(f"/api/audits/{audit['id']}", headers=tokens["manager"], json={"auditor_id": ""})
    assert r.status_code == 200 and r.json()["auditor_id"] is None


def test_only_managers_and_admins_can_edit_audits(client, tokens, user_ids):
    audit = _classic_audit(client, tokens, user_ids, "2033-02-07T09:00:00")
    url = f"/api/audits/{audit['id']}"
    for who in ("auditor1", "sm1"):
        assert client.patch(url, headers=tokens[who], json={"status": "Ongoing"}).status_code == 403
    assert client.patch(url, headers=tokens["admin"], json={"status": "Ongoing"}).status_code == 200


def test_admin_can_cancel_a_planned_audit(client, tokens, user_ids):
    audit = _classic_audit(client, tokens, user_ids, "2033-02-08T09:00:00")
    r = client.post(f"/api/audits/{audit['id']}/cancel", headers=tokens["admin"])
    assert r.status_code == 200 and r.json()["status"] == "Cancelled"


def test_admin_can_schedule_and_cancel_sop_audits(client, tokens, user_ids):
    r = client.post("/api/sop-schedule", headers=tokens["admin"], json={
        "template_code": "CASH", "store_id": "T001", "auditor_id": user_ids["auditor2@test"],
        "scheduled_at": "2033-03-01T09:00:00"})
    assert r.status_code in (200, 201), r.text
    audit = r.json()
    assert audit["status"] == "Planned"
    # an admin can open any SOP audit
    assert client.get(f"/api/sop-audits/{audit['id']}", headers=tokens["admin"]).status_code == 200
    cancelled = client.post(f"/api/sop-schedule/{audit['id']}/cancel", headers=tokens["admin"])
    assert cancelled.status_code == 200 and cancelled.json()["status"] == "Cancelled"


def test_admin_can_use_the_dashboard_and_the_tool_editor(client, tokens):
    assert client.get("/api/sop-dashboard", headers=tokens["admin"]).status_code == 200
    tools = client.get("/api/sop-admin/tools", headers=tokens["admin"])
    assert tools.status_code == 200
    assert {t["code"] for t in tools.json()} >= {"CASH", "FMCG"}
    # still closed to everyone else
    for who in ("auditor1", "sm1"):
        assert client.get("/api/sop-dashboard", headers=tokens[who]).status_code == 403
        assert client.get("/api/sop-admin/tools", headers=tokens[who]).status_code == 403


def test_admin_cannot_start_an_audit_as_an_auditor(client, tokens, db):
    """Running an audit stays an auditor job (it is owned by the person doing it)."""
    from app.models import SopTemplate
    tpl = db.query(SopTemplate).filter_by(code="CASH", is_current=True).one()
    r = client.put(f"/api/sop-audits/{new_id()}", headers=tokens["admin"], json={
        "template_id": tpl.id, "store_id": "T001", "scores": []})
    assert r.status_code == 403


def test_chat_turns_table_is_created_by_the_migrations(db):
    """The assistant logs to chat_turns; a migrated database must have the table."""
    from app.models import ChatTurn
    assert db.query(ChatTurn).count() == 0
    db.add(ChatTurn(conversation_id="c1", question="q", reply="r"))
    db.commit()
    assert db.query(ChatTurn).count() == 1
    db.query(ChatTurn).delete()
    db.commit()


def test_admin_can_use_the_original_manager_pages(client, tokens, user_ids):
    """ADMIN sees every page in the frontend, so the original manager routes must accept it."""
    assert client.get("/api/audit-logs", headers=tokens["admin"]).status_code == 200
    audit = _classic_audit(client, tokens, user_ids, "2033-04-01T09:00:00")
    sched = client.post("/api/audits", headers=tokens["admin"], json={
        "store_id": "T002", "scheduled_at": "2033-04-02T09:00:00",
        "auditor_id": user_ids["auditor1@test"]})
    assert sched.status_code == 201, sched.text
    block = client.post("/api/availability", headers=tokens["admin"], json={
        "auditor_id": user_ids["auditor2@test"], "from_date": "2033-05-01",
        "to_date": "2033-05-02", "reason": "Leave"})
    assert block.status_code in (200, 201), block.text
    assert block.json()["auditor_id"] == user_ids["auditor2@test"]     # admin may set it for someone else
    q = client.post("/api/questions", headers=tokens["admin"], json={
        "text": "Admin-created question", "process": "Cash", "weight": 1})
    assert q.status_code in (200, 201), q.text
    assert q.json()["approval_status"] == "APPROVED"                          # same as a manager's
    assert audit["id"]


def test_the_audit_log_stays_closed_to_other_roles(client, tokens):
    for who in ("auditor1", "sm1"):
        assert client.get("/api/audit-logs", headers=tokens[who]).status_code == 403
