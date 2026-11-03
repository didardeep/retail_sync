"""Audit manager workflows: onboard a brand and store, link auditors and auditees,
schedule, reassign, ask for changes on a review, and decide issues."""
import uuid

from test_classic_audit_flow import _checklist

PW = "Passw0rd!"


def _tag():
    return uuid.uuid4().hex[:6]


def _titles(client, headers):
    return [n["title"] for n in client.get("/api/notifications", headers=headers).json()]


def _login(client, email):
    r = client.post("/api/auth/login", json={"email": email, "password": PW})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}


def _brand(client, tokens, **extra):
    r = client.post("/api/brands", headers=tokens["manager"],
                    json={"name": f"Brand {_tag()}", **extra})
    assert r.status_code == 201, r.text
    return r.json()


def _store(client, tokens, brand_id, **extra):
    sid = f"S{_tag()}"
    r = client.post("/api/stores", headers=tokens["manager"], json={
        "id": sid, "name": f"Store {sid}", "brand_id": brand_id, "format": "COCO",
        "type": "Standard", **extra})
    assert r.status_code == 201, r.text
    return r.json()


def _person(client, tokens, role, store_ids=(), who="manager"):
    email = f"{role}-{_tag()}@test"
    r = client.post(f"/api/people/{role}s", headers=tokens[who], json={
        "name": f"{role.title()} {email}", "email": email, "password": PW,
        "phone": "98765 43210", "store_ids": list(store_ids)})
    return r, email


def _new_person(client, tokens, role, store_ids=()):
    r, email = _person(client, tokens, role, store_ids)
    assert r.status_code == 201, r.text
    return r.json(), _login(client, email)


def _schedule(client, tokens, store_id, auditor_id, day="2031-03-10", checklist_id=None, **extra):
    return client.post("/api/audits", headers=tokens["manager"], json={
        "store_id": store_id, "auditor_id": auditor_id, "scheduled_at": f"{day}T09:00:00",
        "checklist_id": checklist_id, **extra})


# ---- Brand and store onboarding -------------------------------------------

def test_brand_onboarding_keeps_its_details_and_points_to_the_first_store(client, tokens):
    b = _brand(client, tokens, code="FM", legal_name="FreshMart Retail Pvt Ltd",
               category="Grocery", contact_name="Asha", contact_email="asha@fm.test",
               contact_phone="12345", regions=["North", "North", " West "], notes="Pilot")
    assert b["next_step"] == "add_store"
    assert (b["code"], b["category"], b["status"]) == ("FM", "Grocery", "Active")
    assert b["regions"] == ["North", "West"]

    _store(client, tokens, b["id"])
    got = client.get(f"/api/brands/{b['id']}", headers=tokens["manager"]).json()
    assert got["legal_name"] == "FreshMart Retail Pvt Ltd" and len(got["stores"]) == 1

    r = client.put(f"/api/brands/{b['id']}", headers=tokens["manager"], json={"status": "Paused"})
    assert r.status_code == 400
    r = client.put(f"/api/brands/{b['id']}", headers=tokens["manager"], json={"status": "Inactive"})
    assert r.status_code == 200 and r.json()["status"] == "Inactive"


def test_store_catalog_has_full_forms_and_a_bad_format_is_refused(client, tokens):
    cat = client.get("/api/stores/catalog", headers=tokens["manager"]).json()
    assert {"code": "FOFO", "name": "Franchise Owned, Franchise Operated",
            "note": "A franchisee owns the store and runs it."} in cat["formats"]
    assert {t["code"] for t in cat["types"]} == {"Flagship", "Standard", "Compact", "Kiosk"}

    b = _brand(client, tokens)
    r = client.post("/api/stores", headers=tokens["manager"], json={
        "id": f"S{_tag()}", "name": "Odd", "brand_id": b["id"], "format": "XYZ"})
    assert r.status_code == 400
    s = _store(client, tokens, b["id"])
    assert s["next_steps"] == ["assign_auditor", "add_auditee", "schedule_audit"]


# ---- People ----------------------------------------------------------------

def test_manager_adds_auditors_and_auditees_but_an_auditor_cannot(client, tokens):
    s = _store(client, tokens, _brand(client, tokens)["id"])
    auditor, auditor_h = _new_person(client, tokens, "auditor", [s["id"]])
    assert auditor["role"] == "AUDITOR" and auditor["store_ids"] == [s["id"]]
    assert auditor["phone"] == "98765 43210"
    assert any(t.startswith("Welcome! You were added as auditor") for t in _titles(client, auditor_h))

    r, _ = _person(client, tokens, "auditee")          # an auditee needs a store
    assert r.status_code == 400
    auditee, _ = _new_person(client, tokens, "auditee", [s["id"]])
    assert auditee["role"] == "AUDITEE"

    r, _ = _person(client, tokens, "auditor", who="auditor1")
    assert r.status_code == 403
    r = client.post("/api/people/auditors", headers=tokens["manager"], json={
        "name": "Dup", "email": auditor["email"].upper(), "password": PW})
    assert r.status_code == 409

    people = client.get(f"/api/people?store_id={s['id']}", headers=tokens["manager"]).json()
    assert {p["id"] for p in people} == {auditor["id"], auditee["id"]}


def test_store_view_lists_its_people_and_the_list_counts_them(client, tokens):
    s = _store(client, tokens, _brand(client, tokens)["id"])
    auditor, auditor_h = _new_person(client, tokens, "auditor")
    r = client.post(f"/api/stores/{s['id']}/auditors", headers=tokens["manager"],
                    json={"user_id": auditor["id"]})
    assert r.status_code == 201 and [p["id"] for p in r.json()] == [auditor["id"]]
    assert any("You were added to" in t for t in _titles(client, auditor_h))
    again = client.post(f"/api/stores/{s['id']}/auditors", headers=tokens["manager"],
                        json={"user_id": auditor["id"]})
    assert again.status_code == 409
    wrong = client.post(f"/api/stores/{s['id']}/auditees", headers=tokens["manager"],
                        json={"user_id": auditor["id"]})
    assert wrong.status_code == 422

    view = client.get(f"/api/stores/{s['id']}", headers=tokens["manager"]).json()
    assert view["format_name"] == "Company Owned, Company Operated"
    assert view["type_note"].startswith("A regular full-size store")
    assert [p["id"] for p in view["auditors"]] == [auditor["id"]] and view["auditees"] == []
    assert view["open_issues"] == 0 and view["next_audit"] is None

    row = [x for x in client.get("/api/stores", headers=tokens["manager"]).json()
           if x["id"] == s["id"]][0]
    assert (row["auditor_count"], row["auditee_count"]) == (1, 0)


# ---- Scheduling ------------------------------------------------------------

def test_scheduling_suggests_the_stores_auditor_and_can_link_one(client, tokens):
    s = _store(client, tokens, _brand(client, tokens)["id"])
    sug = client.get(f"/api/audits/suggestions?store_id={s['id']}", headers=tokens["manager"]).json()
    assert sug["suggested_auditor_id"] is None and sug["store_auditors"] == []
    assert "No auditor assigned to this store" in sug["warnings"]

    auditor, auditor_h = _new_person(client, tokens, "auditor")
    r = _schedule(client, tokens, s["id"], auditor["id"], assign_to_store=True)
    assert r.status_code == 201, r.text
    assert any(t.startswith(f"New audit {r.json()['id']}") for t in _titles(client, auditor_h))

    sug = client.get(f"/api/audits/suggestions?store_id={s['id']}", headers=tokens["manager"]).json()
    assert sug["suggested_auditor_id"] == auditor["id"]
    assert auditor["id"] not in {a["id"] for a in sug["other_auditors"]}

    # Only an active auditor can be booked.
    auditee, _ = _new_person(client, tokens, "auditee", [s["id"]])
    assert _schedule(client, tokens, s["id"], auditee["id"]).status_code == 422


def test_newly_scheduled_audit_is_listed_first(client, tokens):
    s = _store(client, tokens, _brand(client, tokens)["id"])
    auditor, _ = _new_person(client, tokens, "auditor")
    # Booked last but for the earliest date: still first in the list.
    newest = _schedule(client, tokens, s["id"], auditor["id"], day="2020-01-01").json()
    assert client.get("/api/audits", headers=tokens["manager"]).json()[0]["id"] == newest["id"]


# ---- Reassign and remove ---------------------------------------------------

def test_reassign_keeps_answers_and_tells_both_auditors(client, tokens, db):
    s = _store(client, tokens, _brand(client, tokens)["id"])
    one, one_h = _new_person(client, tokens, "auditor")
    two, two_h = _new_person(client, tokens, "auditor")
    audit = _schedule(client, tokens, s["id"], one["id"],
                      checklist_id=_checklist(db, [(1, False), (1, False)])).json()
    full = client.get(f"/api/audits/{audit['id']}", headers=one_h).json()
    rid = full["responses"][0]["id"]
    assert client.put(f"/api/audits/{audit['id']}/responses/{rid}", headers=one_h,
                      json={"answer": "Yes"}).status_code == 200

    r = client.post(f"/api/audits/{audit['id']}/reassign", headers=tokens["manager"],
                    json={"auditor_id": two["id"], "reason": "On leave"})
    assert r.status_code == 200 and r.json()["auditor_id"] == two["id"]
    kept = client.get(f"/api/audits/{audit['id']}", headers=two_h).json()
    assert kept["status"] == "Ongoing" and kept["responses"][0]["answer"] == "Yes"
    assert any("was taken off you: On leave" in t for t in _titles(client, one_h))
    assert any("is now yours: On leave" in t for t in _titles(client, two_h))

    r = client.post(f"/api/audits/{audit['id']}/reassign", headers=tokens["manager"],
                    json={"auditor_id": None})
    assert r.status_code == 200 and r.json()["auditor_id"] is None
    assert client.post(f"/api/audits/{audit['id']}/reassign", headers=tokens["auditor1"],
                       json={"auditor_id": one["id"]}).status_code == 403


def test_removing_an_auditor_from_a_store_moves_their_planned_audits(client, tokens):
    s = _store(client, tokens, _brand(client, tokens)["id"])
    one, _ = _new_person(client, tokens, "auditor", [s["id"]])
    two, two_h = _new_person(client, tokens, "auditor")
    audit = _schedule(client, tokens, s["id"], one["id"], day="2031-04-01").json()

    r = client.post(f"/api/stores/{s['id']}/auditors/{one['id']}/remove", headers=tokens["manager"],
                    json={"reassign_to": two["id"]})
    assert r.status_code == 200, r.text
    assert r.json()["planned_audits_moved"] == 1
    assert client.get(f"/api/audits/{audit['id']}", headers=tokens["manager"]).json()[
        "auditor_id"] == two["id"]
    assert client.get(f"/api/stores/{s['id']}", headers=tokens["manager"]).json()["auditors"] == []
    assert any(f"Audit {audit['id']}" in t for t in _titles(client, two_h))


def test_removing_an_auditee_with_open_issues_needs_someone_to_take_them(client, tokens, db):
    s = _store(client, tokens, _brand(client, tokens)["id"])
    auditor, auditor_h = _new_person(client, tokens, "auditor", [s["id"]])
    first, _ = _new_person(client, tokens, "auditee", [s["id"]])
    second, second_h = _new_person(client, tokens, "auditee", [s["id"]])
    audit = _schedule(client, tokens, s["id"], auditor["id"], day="2031-05-01",
                      checklist_id=_checklist(db, [(1, False)])).json()
    rid = client.get(f"/api/audits/{audit['id']}", headers=auditor_h).json()["responses"][0]["id"]
    client.put(f"/api/audits/{audit['id']}/responses/{rid}", headers=auditor_h, json={"answer": "No"})
    issue = client.post(f"/api/audits/{audit['id']}/responses/{rid}/issue", headers=auditor_h,
                        json={"assignee_id": first["id"]}).json()

    url = f"/api/stores/{s['id']}/auditees/{first['id']}/remove"
    r = client.post(url, headers=tokens["manager"], json={})
    assert r.status_code == 409 and r.json()["count"] == 1
    r = client.post(url, headers=tokens["manager"], json={"move_issues_to": first["id"]})
    assert r.status_code == 422
    r = client.post(url, headers=tokens["manager"], json={"move_issues_to": second["id"]})
    assert r.status_code == 200 and r.json()["issues_moved"] == 1
    moved = [i for i in client.get("/api/issues", headers=second_h).json() if i["id"] == issue["id"]]
    assert moved and moved[0]["meta"]["history"][-1]["reply"] == f"Moved to {second['name']}"


def test_deactivating_someone_with_open_work_hands_it_over(client, tokens):
    s = _store(client, tokens, _brand(client, tokens)["id"])
    leaving, _ = _new_person(client, tokens, "auditor")
    taking, _ = _new_person(client, tokens, "auditor")
    audit = _schedule(client, tokens, s["id"], leaving["id"], day="2031-06-01").json()

    r = client.patch(f"/api/people/{leaving['id']}", headers=tokens["manager"], json={"active": False})
    assert r.status_code == 409 and r.json()["count"] == 1
    r = client.patch(f"/api/people/{leaving['id']}", headers=tokens["manager"],
                     json={"active": False, "hand_over_to": taking["id"]})
    assert r.status_code == 200 and r.json()["active"] is False and r.json()["handed_over"] == 1
    assert client.get(f"/api/audits/{audit['id']}", headers=tokens["manager"]).json()[
        "auditor_id"] == taking["id"]


# ---- Review: ask for changes -----------------------------------------------

def test_request_changes_then_resubmit_then_approve(client, tokens, db):
    s = _store(client, tokens, _brand(client, tokens)["id"])
    auditor, auditor_h = _new_person(client, tokens, "auditor", [s["id"]])
    _, auditee_h = _new_person(client, tokens, "auditee", [s["id"]])
    audit = _schedule(client, tokens, s["id"], auditor["id"], day="2031-07-01",
                      checklist_id=_checklist(db, [(1, False), (1, False)])).json()
    aid = audit["id"]
    rids = [r["id"] for r in client.get(f"/api/audits/{aid}", headers=auditor_h).json()["responses"]]
    for rid in rids:
        client.put(f"/api/audits/{aid}/responses/{rid}", headers=auditor_h, json={"answer": "Yes"})
    assert client.post(f"/api/audits/{aid}/submit", headers=auditor_h).status_code == 200

    m = tokens["manager"]
    assert client.post(f"/api/audits/{aid}/request-changes", headers=m, json={}).status_code == 400
    r = client.post(f"/api/audits/{aid}/responses/{rids[0]}/review", headers=m,
                    json={"decision": "query", "note": "Photo of the safe is missing",
                          "category": "missing_evidence"})
    assert r.status_code == 200
    assert any("Photo of the safe is missing" in t for t in _titles(client, auditee_h))
    client.post(f"/api/audits/{aid}/responses/{rids[1]}/review", headers=m, json={"decision": "approve"})

    r = client.post(f"/api/audits/{aid}/request-changes", headers=m, json={"note": "Please fix"})
    assert r.status_code == 200 and r.json()["status"] == "Changes Requested"
    assert any(t.startswith(f"Changes requested on audit {aid}") for t in _titles(client, auditor_h))

    # Only the queried question can change.
    assert client.put(f"/api/audits/{aid}/responses/{rids[1]}", headers=auditor_h,
                      json={"answer": "No"}).status_code == 409
    assert client.put(f"/api/audits/{aid}/responses/{rids[0]}", headers=auditor_h,
                      json={"answer": "No", "remarks": "Safe photo added"}).status_code == 200
    r = client.post(f"/api/audits/{aid}/submit", headers=auditor_h)
    assert r.status_code == 200 and r.json()["audit"]["status"] == "Completed"
    resp = {x["id"]: x for x in client.get(f"/api/audits/{aid}", headers=m).json()["responses"]}
    assert resp[rids[0]]["review_status"] == "replied"
    assert resp[rids[0]]["review_category"] == "missing_evidence"

    r = client.post(f"/api/audits/{aid}/responses/{rids[0]}/review", headers=m, json={"decision": "approve"})
    assert r.json()["status"] == "Approved"
    assert any(f"Audit {aid} was approved" in t for t in _titles(client, auditee_h))


# ---- Action Taken Tracking: approve or deny --------------------------------

def test_manager_denies_with_reason_and_evidence_then_approves(client, tokens, db):
    s = _store(client, tokens, _brand(client, tokens)["id"])
    auditor, auditor_h = _new_person(client, tokens, "auditor", [s["id"]])
    auditee, auditee_h = _new_person(client, tokens, "auditee", [s["id"]])
    audit = _schedule(client, tokens, s["id"], auditor["id"], day="2031-08-01",
                      checklist_id=_checklist(db, [(1, False)])).json()
    rid = client.get(f"/api/audits/{audit['id']}", headers=auditor_h).json()["responses"][0]["id"]
    client.put(f"/api/audits/{audit['id']}/responses/{rid}", headers=auditor_h, json={"answer": "No"})
    iid = client.post(f"/api/audits/{audit['id']}/responses/{rid}/issue", headers=auditor_h,
                      json={"assignee_id": auditee["id"]}).json()["id"]
    assert any(t.startswith("New issue at") for t in _titles(client, auditee_h))

    url = f"/api/issues/{iid}/decision"
    m = tokens["manager"]
    assert client.post(url, headers=m, json={"decision": "approve"}).status_code == 409  # no action yet
    client.put(f"/api/issues/{iid}", headers=auditee_h,
               json={"status": "Resolved", "action_taken": "Cleaned the shelf"})

    assert client.post(url, headers=m, json={"decision": "deny"}).status_code == 400
    photo = {"type": "photo", "url": "/api/evidence/x.jpg", "name": "shelf.jpg"}
    r = client.post(url, headers=m, json={"decision": "deny", "reason": "Shelf still dusty",
                                          "evidence": [photo]})
    assert r.status_code == 200 and r.json()["status"] == "Open"
    meta = r.json()["meta"]
    assert meta["decisions"][-1] == {**meta["decisions"][-1], "decision": "denied",
                                     "reason": "Shelf still dusty", "evidence": [photo]}
    assert any("was denied: Shelf still dusty" in t for t in _titles(client, auditee_h))
    assert client.post(url, headers=auditor_h, json={"decision": "approve"}).status_code == 403

    r = client.post(url, headers=m, json={"decision": "approve"})
    assert r.status_code == 200 and r.json()["status"] == "Closed"
    assert [d["decision"] for d in r.json()["meta"]["decisions"]] == ["denied", "approved"]
    assert client.post(url, headers=m, json={"decision": "approve"}).status_code == 409
