"""Behaviour added by the Step 0 groundwork: planned audits, shared booking
rules, versioned templates, and the status gates on the SOP audit endpoints."""
import datetime as dt
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from app.models import (
    AuditorAvailability, SopAudit, SopCriterion, SopSection, SopTemplate,
)
from conftest import new_id

DAY = dt.datetime(2031, 3, 3, 10, 0)


def _planned(db, auditor_id, store_id, template, when=DAY, status="Planned"):
    audit = SopAudit(id=new_id(), template_id=template.id, store_id=store_id,
                     auditor_id=auditor_id, status=status, scheduled_at=when)
    db.add(audit)
    db.commit()
    return audit


def _put(client, headers, audit_id, template, store_id, scores=()):
    return client.put(f"/api/sop-audits/{audit_id}", headers=headers, json={
        "template_id": template.id, "store_id": store_id,
        "scores": [{"criterion_id": c.id, "score": c.marks} for c in scores],
    })


def test_only_one_migration_head():
    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    cfg.set_main_option("script_location",
                        str(Path(__file__).resolve().parents[1] / "migrations"))
    assert len(ScriptDirectory.from_config(cfg).get_heads()) == 1


def test_template_list_returns_current_versions_only(client, tokens, db):
    v1 = db.query(SopTemplate).filter_by(code="FMCG", version=1).one()
    v2 = SopTemplate(code="FMCG", name=v1.name, version=2, is_current=True,
                     total_marks=v1.total_marks, min_rule=v1.min_rule)
    v1.is_current = False
    db.add(v2)
    db.commit()
    try:
        rows = client.get("/api/sop-audits/templates", headers=tokens["auditor1"]).json()
        fmcg = [t for t in rows if t["code"] == "FMCG"]
        assert len(fmcg) == 1 and fmcg[0]["version"] == 2 and fmcg[0]["is_current"]
        # an old version can still be fetched by id (finished audits and drafts need it)
        assert client.get(f"/api/sop-audits/templates/{v1.id}",
                          headers=tokens["auditor1"]).status_code == 200
    finally:
        db.delete(v2)
        v1.is_current = True
        db.commit()


def test_audit_started_on_a_superseded_version_still_syncs(client, tokens, db, cash):
    tpl = cash["template"]
    tpl.is_current = False
    db.commit()
    try:
        r = _put(client, tokens["auditor1"], new_id(), tpl, "T001", cash["criteria"][:1])
        assert r.status_code == 200, r.text
    finally:
        tpl.is_current = True
        db.commit()


def test_planned_audit_becomes_draft_on_first_save(client, tokens, db, user_ids, cash):
    audit = _planned(db, user_ids["auditor1@test"], "T001", cash["template"])
    r = _put(client, tokens["auditor1"], audit.id, cash["template"], "T001", cash["criteria"][:2])
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "Draft"
    assert r.json()["scheduled_at"].startswith("2031-03-03")
    assert len(r.json()["scores"]) == 2


def test_someone_else_cannot_start_a_planned_audit(client, tokens, db, user_ids, cash):
    audit = _planned(db, user_ids["auditor1@test"], "T001", cash["template"])
    r = _put(client, tokens["auditor2"], audit.id, cash["template"], "T001")
    assert r.status_code == 403


def test_cancelled_and_submitted_audits_cannot_be_changed(client, tokens, db, user_ids, cash):
    for status in ("Cancelled", "Submitted", "Approved"):
        audit = _planned(db, user_ids["auditor1@test"], "T001", cash["template"], status=status)
        r = _put(client, tokens["auditor1"], audit.id, cash["template"], "T001", cash["criteria"][:1])
        assert r.status_code == 409, (status, r.text)
        assert r.json()["status"] == status


def test_planned_audit_may_keep_another_version_of_the_same_tool(client, tokens, db, user_ids, cash):
    tpl = cash["template"]
    audit = _planned(db, user_ids["auditor1@test"], "T001", tpl)
    other = SopTemplate(code="CASH", name=tpl.name, version=9, is_current=False,
                        total_marks=tpl.total_marks, min_rule=tpl.min_rule)
    db.add(other)
    db.commit()
    try:
        r = _put(client, tokens["auditor1"], audit.id, other, "T001")
        assert r.status_code == 200, r.text
        assert r.json()["template_id"] == tpl.id          # the server's version wins
        fmcg = db.query(SopTemplate).filter_by(code="FMCG").first()
        again = _planned(db, user_ids["auditor1@test"], "T001", tpl)
        assert _put(client, tokens["auditor1"], again.id, fmcg, "T001").status_code == 422
    finally:
        db.delete(other)
        db.commit()


def test_submit_blocked_for_cancelled_audit(client, tokens, db, user_ids, cash):
    audit = _planned(db, user_ids["auditor1@test"], "T001", cash["template"], status="Cancelled")
    r = client.post(f"/api/sop-audits/{audit.id}/submit", headers=tokens["auditor1"], json={})
    assert r.status_code == 409


def test_attachment_criterion_must_belong_to_the_audit_tool(client, tokens, db, user_ids, cash):
    audit = _planned(db, user_ids["auditor1@test"], "T001", cash["template"])
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 40
    own = cash["criteria"][0].id
    foreign = (db.query(SopCriterion).join(SopSection).join(SopTemplate)
               .filter(SopTemplate.code == "FMCG").first().id)
    bad = client.post(f"/api/sop-audits/{audit.id}/attachments", headers=tokens["auditor1"],
                      data={"id": new_id(), "criterion_id": foreign},
                      files={"file": ("p.png", png, "image/png")})
    assert bad.status_code == 422
    ok = client.post(f"/api/sop-audits/{audit.id}/attachments", headers=tokens["auditor1"],
                     data={"id": new_id(), "criterion_id": own},
                     files={"file": ("p.png", png, "image/png")})
    assert ok.status_code == 201, ok.text
    db.refresh(audit)
    assert audit.status == "Planned"      # a photo alone does not start the audit


def test_store_manager_sees_only_finished_audits(client, tokens, db, user_ids, cash):
    planned = _planned(db, user_ids["auditor1@test"], "T001", cash["template"])
    draft = _planned(db, user_ids["auditor1@test"], "T001", cash["template"], status="Draft")
    done = _planned(db, user_ids["auditor1@test"], "T001", cash["template"], status="Submitted")
    for audit, expected in ((planned, 404), (draft, 404), (done, 200)):
        r = client.get(f"/api/sop-audits/{audit.id}", headers=tokens["sm1"])
        assert r.status_code == expected, (audit.status, r.status_code)
    listed = {a["id"] for a in client.get("/api/sop-audits", headers=tokens["sm1"]).json()}
    assert done.id in listed and planned.id not in listed and draft.id not in listed
    # a store manager of another store sees none of them
    assert client.get(f"/api/sop-audits/{done.id}", headers=tokens["sm2"]).status_code == 404


def test_retired_criterion_flag_endpoint_is_gone(client, tokens, cash):
    r = client.patch(f"/api/sop-audits/criteria/{cash['criteria'][0].id}",
                     headers=tokens["manager"], json={"requires_photo": True})
    assert r.status_code in (404, 405)


def test_booking_rules_are_shared_between_classic_and_sop_audits(client, tokens, db, user_ids, cash):
    auditor = user_ids["auditor2@test"]
    day = dt.datetime(2031, 4, 7, 9, 0)
    schedule = lambda store: client.post("/api/audits", headers=tokens["manager"], json={
        "store_id": store, "scheduled_at": day.isoformat(), "auditor_id": auditor})

    _planned(db, auditor, "T001", cash["template"], when=day)
    clash = schedule("T002")                       # same day, different store
    assert clash.status_code == 409
    assert clash.json()["error"] == "auditor already booked" and clash.json()["kind"] == "sop"
    assert schedule("T001").status_code == 201     # same store, same day: allowed

    again = schedule("T002")                       # now also clashes with the classic audit
    assert again.status_code == 409


def test_blocked_dates_are_refused(client, tokens, db, user_ids):
    auditor = user_ids["auditor1@test"]
    db.add(AuditorAvailability(auditor_id=auditor, from_date=dt.date(2031, 5, 1),
                               to_date=dt.date(2031, 5, 3), reason="Leave"))
    db.commit()
    r = client.post("/api/audits", headers=tokens["manager"], json={
        "store_id": "T001", "scheduled_at": "2031-05-02T09:00:00", "auditor_id": auditor})
    assert r.status_code == 409
    assert r.json() == {"error": "auditor unavailable", "reason": "Leave"}
