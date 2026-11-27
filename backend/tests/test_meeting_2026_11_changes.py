"""Changes agreed in the review meeting of November 2026: question criticality
drives the score, a No needs remarks and evidence, photos carry where they were
taken, and checklists are versioned per store type or store."""
import pytest

from app.models import CRITICALITY_WEIGHT, Checklist, ChecklistItem, Question, criticality_for
from app.routers import evidence
from test_checklists_and_annexures import _new, _question_ids
from test_classic_audit_flow import _answer, _checklist, _start


# --------------------------------------------------------------------------
# Criticality and scoring
# --------------------------------------------------------------------------
def _question(client, tokens, **body):
    return client.post("/api/questions", headers=tokens["manager"],
                       json={"text": "Criticality check", "process": "Cashiering", **body})


@pytest.mark.parametrize("level", ["High", "Medium", "Low"])
def test_criticality_sets_weight_and_critical_flag(client, tokens, level):
    r = _question(client, tokens, criticality=level)
    assert r.status_code == 201, r.text
    q = r.json()
    assert q["criticality"] == level
    assert q["weight"] == CRITICALITY_WEIGHT[level]
    assert q["is_critical"] is (level == "High")


def test_unknown_criticality_is_refused(client, tokens):
    assert _question(client, tokens, criticality="Severe").status_code == 422


def test_old_clients_sending_weight_or_critical_still_get_a_level(client, tokens):
    assert _question(client, tokens, is_critical=True).json()["criticality"] == "High"
    assert _question(client, tokens, weight=4).json()["criticality"] == "Medium"
    assert _question(client, tokens, weight=1).json()["criticality"] == "Low"


def test_editing_keeps_criticality_unless_changed(client, tokens):
    q = _question(client, tokens, criticality="High").json()
    edited = client.put(f"/api/questions/{q['id']}", headers=tokens["manager"],
                        json={"text": "Reworded"}).json()
    assert edited["criticality"] == "High" and edited["weight"] == 3
    lowered = client.put(f"/api/questions/{edited['id']}", headers=tokens["manager"],
                         json={"criticality": "Low"}).json()
    assert lowered["criticality"] == "Low" and lowered["weight"] == 1 and lowered["is_critical"] is False


@pytest.mark.parametrize("level, weight, critical, expected", [
    ("High", None, False, "High"), ("medium", None, False, "Medium"), ("L", None, False, "Low"),
    ("Critical", None, False, "High"), (None, 5, False, "High"), (None, 3, False, "Medium"),
    (None, 2, False, "Low"), (None, None, True, "High"), ("", None, False, "Low"),
])
def test_criticality_read_from_a_checklist_file(level, weight, critical, expected):
    assert criticality_for(level, weight, critical) == expected


def test_score_is_weighted_by_criticality(client, tokens, db):
    cl = _checklist(db, [(1, False), (1, False)])
    for item, level in zip(db.query(ChecklistItem).filter_by(checklist_id=cl).order_by(ChecklistItem.sort_order),
                           ("High", "Low")):
        db.get(Question, item.question_id).set_criticality(level)
    db.commit()
    a = _start(client, tokens, cl).json()
    by_level = {r["criticality"]: i for i, r in enumerate(a["responses"])}
    _answer(client, tokens, a, by_level["High"], "Yes")
    _answer(client, tokens, a, by_level["Low"], "No")
    r = client.post(f"/api/audits/{a['id']}/submit", headers=tokens["auditor1"])
    assert r.status_code == 200, r.text
    # High (3) earned out of High + Low (3 + 1).
    assert r.json()["audit"]["score"] == 75.0


# --------------------------------------------------------------------------
# A No needs remarks and evidence
# --------------------------------------------------------------------------
PHOTO = [{"type": "photo", "url": "/api/evidence/x.jpg"}]


@pytest.mark.parametrize("given, missing", [
    ({"remarks": "", "evidence": []}, ["remarks", "evidence"]),
    ({"remarks": "Till short", "evidence": []}, ["evidence"]),
    ({"remarks": "   ", "evidence": PHOTO}, ["remarks"]),
])
def test_no_without_remarks_or_evidence_blocks_submit(client, tokens, db, given, missing):
    cl = _checklist(db, [(1, False), (1, False)])
    a = _start(client, tokens, cl).json()
    _answer(client, tokens, a, 0, "Yes")
    _answer(client, tokens, a, 1, "No", **given)
    r = client.post(f"/api/audits/{a['id']}/submit", headers=tokens["auditor1"])
    assert r.status_code == 400, r.text
    detail = r.json()
    assert detail["code"] == "no_without_proof" and detail["count"] == 1
    assert detail["questions"][0]["id"] == a["responses"][1]["id"]
    assert detail["questions"][0]["missing"] == missing

    _answer(client, tokens, a, 1, "No", remarks="Till short by 200", evidence=PHOTO)
    r = client.post(f"/api/audits/{a['id']}/submit", headers=tokens["auditor1"])
    assert r.status_code == 200, r.text


def test_na_needs_a_reason_but_no_evidence_and_yes_needs_neither(client, tokens, db):
    cl = _checklist(db, [(1, False), (1, False)])
    a = _start(client, tokens, cl).json()
    _answer(client, tokens, a, 0, "Yes")
    _answer(client, tokens, a, 1, "NA", remarks="")
    r = client.post(f"/api/audits/{a['id']}/submit", headers=tokens["auditor1"])
    assert r.status_code == 400, r.text
    detail = r.json()
    assert detail["code"] == "no_without_proof"
    assert detail["questions"][0]["missing"] == ["remarks"]

    _answer(client, tokens, a, 1, "NA", remarks="The store has no cash counter")
    assert client.post(f"/api/audits/{a['id']}/submit", headers=tokens["auditor1"]).status_code == 200


# --------------------------------------------------------------------------
# Photos carry where they were taken
# --------------------------------------------------------------------------
@pytest.fixture
def evidence_folder(tmp_path, monkeypatch):
    monkeypatch.setattr(evidence, "EVIDENCE_FOLDER", tmp_path)
    return tmp_path


def _upload(client, headers, **form):
    return client.post("/api/evidence", headers=headers,
                       files={"file": ("shelf.jpg", b"fake-image")}, data=form)


def test_photo_keeps_its_location(client, tokens, evidence_folder):
    r = _upload(client, tokens["auditor1"], lat="28.6139", lng="77.2090", accuracy="12.5",
                captured_at="2026-11-23T10:15:00Z")
    assert r.status_code == 201, r.text
    geo = r.json()["geo"]
    assert geo["lat"] == 28.6139 and geo["lng"] == 77.209 and geo["accuracy"] == 12.5
    assert geo["captured_at"].startswith("2026-11-23T10:15:00")


def test_photo_without_location_has_no_geo(client, tokens, evidence_folder):
    r = _upload(client, tokens["auditor1"])
    assert r.status_code == 201 and "geo" not in r.json()


@pytest.mark.parametrize("form", [
    {"lat": "95", "lng": "77"}, {"lat": "28.6"}, {"lat": "28.6", "lng": "200"},
    {"lat": "28.6", "lng": "77.2", "captured_at": "yesterday"},
])
def test_bad_location_is_refused(client, tokens, evidence_folder, form):
    assert _upload(client, tokens["auditor1"], **form).status_code == 422


# --------------------------------------------------------------------------
# Checklist versions per store type or store
# --------------------------------------------------------------------------
@pytest.fixture
def qids(client, tokens, db):
    _checklist(db, [(1, False), (1, False)])
    return _question_ids(client, tokens)


def test_conditions_keep_store_type_and_stores_and_drop_unknown_keys(client, tokens, qids):
    c = _new(client, tokens, qids[:1], conditions={
        "format": ["COCO", "COCO"], "type": ["Flagship"], "stores": ["T001"], "colour": ["red"]})
    assert c["conditions"] == {"format": ["COCO"], "type": ["Flagship"], "stores": ["T001"]}


def test_unknown_store_in_conditions_is_refused(client, tokens, qids):
    r = client.post("/api/checklists", headers=tokens["manager"], json={
        "name": "Bad stores", "question_ids": qids[:1], "conditions": {"stores": ["NOPE"]}})
    assert r.status_code == 422


def test_new_version_on_request_can_keep_the_previous_in_use(client, tokens, db, qids):
    v1 = _new(client, tokens, qids[:1], conditions={"type": ["Flagship"]})
    body = {"name": v1["name"], "question_ids": qids, "conditions": {"type": ["Express"]},
            "new_version": True, "retire_previous": False}
    r = client.put(f"/api/checklists/{v1['id']}", headers=tokens["manager"], json=body)
    assert r.status_code == 200, r.text
    v2 = r.json()
    assert v2["id"] != v1["id"] and v2["version"] == v1["version"] + 1
    assert v2["conditions"] == {"type": ["Express"]} and v2["question_count"] == 2
    db.expire_all()
    old = db.get(Checklist, v1["id"])
    assert old.is_active is True and old.conditions == {"type": ["Flagship"]}

    # Retiring: the edited version is switched off.
    r = client.put(f"/api/checklists/{v2['id']}", headers=tokens["manager"],
                   json={**body, "retire_previous": True})
    v3 = r.json()
    assert v3["version"] == v2["version"] + 1
    db.expire_all()
    assert db.get(Checklist, v2["id"]).is_active is False
