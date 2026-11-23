"""Annexure tables: the manager defines the layout on a question, the auditor fills it in."""
import pytest

from app.annexure_table import clean_data, clean_template
from app.models import Question
from test_classic_audit_flow import _checklist, _start

LAYOUT = {
    "columns": [{"name": "Opening", "type": "number"}, {"name": "Notes", "type": "text"}],
    "row_header": "Counter",
    "row_labels": ["Counter 1", "Counter 2"],
    "default_rows": 3,
}


def _audit_with_annexure(client, tokens, db):
    cl = _checklist(db, [(1, False), (1, False)])
    audit = _start(client, tokens, cl).json()
    first = db.get(Question, audit["responses"][0]["question_id"])
    first.meta = {"annexure": clean_template(LAYOUT)}
    db.commit()
    return audit


def _save(client, tokens, audit, n, data, who="auditor1"):
    return client.put(f"/api/audits/{audit['id']}/responses/{audit['responses'][n]['id']}",
                      headers=tokens[who], json={"annexure": data})


def test_only_number_columns_can_show_a_total():
    t = clean_template({"columns": [{"name": "A", "type": "number", "total": True},
                                    {"name": "B", "type": "text", "total": True},
                                    {"name": "C", "type": "number"}]})
    assert t["columns"][0].get("total") is True
    assert "total" not in t["columns"][1]
    assert "total" not in t["columns"][2]


def test_template_is_tidied():
    t = clean_template({**LAYOUT, "columns": [{"name": "  Opening ", "type": "number"}]})
    assert t["columns"] == [{"name": "Opening", "type": "number"}]
    assert t["row_labels"] == ["Counter 1", "Counter 2"]
    assert clean_template(None) is None
    assert clean_template({}) is None


@pytest.mark.parametrize("bad", [
    {"columns": []},
    {"columns": [{"name": "", "type": "text"}]},
    {"columns": [{"name": "A", "type": "text"}, {"name": "a", "type": "text"}]},
    {"columns": [{"name": "A", "type": "date"}]},
    {"columns": [{"name": "A", "type": "text"}], "default_rows": 999},
    {"columns": [{"name": f"c{n}", "type": "text"} for n in range(21)]},
])
def test_bad_templates_are_refused(bad):
    with pytest.raises(ValueError):
        clean_template(bad)


def test_data_must_match_the_layout():
    t = clean_template(LAYOUT)
    assert clean_data(t, {"rows": [{"label": "Counter 1", "cells": ["1,500", "ok"]}]})["rows"][0]["cells"] == ["1,500", "ok"]
    assert clean_data(t, {"rows": [{"label": "", "cells": ["", ""]}]})
    with pytest.raises(ValueError):
        clean_data(t, {"rows": [{"label": "", "cells": ["abc", ""]}]})
    with pytest.raises(ValueError):
        clean_data(t, {"rows": [{"label": "", "cells": ["1"]}]})
    with pytest.raises(ValueError):
        clean_data(None, {"rows": []})


def test_manager_sets_the_layout_on_a_question_and_it_is_checked(client, tokens):
    r = client.post("/api/questions", headers=tokens["manager"],
                    json={"text": "Count the cash", "meta": {"annexure": LAYOUT}})
    assert r.status_code == 201, r.text
    assert r.json()["meta"]["annexure"]["columns"][0]["name"] == "Opening"

    r = client.post("/api/questions", headers=tokens["manager"],
                    json={"text": "Bad", "meta": {"annexure": {"columns": []}}})
    assert r.status_code == 422


def test_editing_keeps_the_old_version_layout(client, tokens):
    q = client.post("/api/questions", headers=tokens["manager"],
                    json={"text": "Count the cash", "meta": {"annexure": LAYOUT}}).json()
    new_layout = {"columns": [{"name": "Total", "type": "number"}], "default_rows": 1}
    r = client.put(f"/api/questions/{q['id']}", headers=tokens["manager"], json={"meta": {"annexure": new_layout}})
    assert r.status_code == 200, r.text
    assert r.json()["meta"]["annexure"]["columns"] == [{"name": "Total", "type": "number"}]
    assert r.json()["version"] == 2


def test_auditor_saves_the_table_and_it_comes_back_with_the_layout(client, tokens, db):
    audit = _audit_with_annexure(client, tokens, db)
    data = {"rows": [{"label": "Counter 1", "cells": ["100", "ok"]}, {"label": "", "cells": ["", ""]}]}
    r = _save(client, tokens, audit, 0, data)
    assert r.status_code == 200, r.text
    assert r.json()["annexure"]["rows"][0]["cells"] == ["100", "ok"]
    assert r.json()["annexure_template"]["default_rows"] == 3

    got = client.get(f"/api/audits/{audit['id']}", headers=tokens["auditor1"]).json()
    assert got["responses"][0]["annexure"]["rows"][0]["label"] == "Counter 1"


def test_number_column_refuses_text(client, tokens, db):
    audit = _audit_with_annexure(client, tokens, db)
    r = _save(client, tokens, audit, 0, {"rows": [{"label": "", "cells": ["lots", ""]}]})
    assert r.status_code == 422


def test_question_without_a_layout_refuses_a_table(client, tokens, db):
    audit = _audit_with_annexure(client, tokens, db)
    r = _save(client, tokens, audit, 1, {"rows": []})
    assert r.status_code == 422


def test_another_auditor_cannot_save_it(client, tokens, db):
    audit = _audit_with_annexure(client, tokens, db)
    r = _save(client, tokens, audit, 0, {"rows": []}, who="auditor2")
    assert r.status_code == 403
