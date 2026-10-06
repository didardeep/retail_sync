"""
Imports the SOP audit tools (Cash, FMCG) from docs/SOP_Audit_Checklists.xlsx
into the sop_* tables. Idempotent: re-running updates text/marks in place and
keeps ids stable (matched by section code + position), so existing audits and
manager-set proof flags (requires_comment / requires_photo) are preserved.

    python import_sop.py
    python import_sop.py path/to/other.xlsx
"""
import re
import sys
from pathlib import Path

from openpyxl import load_workbook

from app.db import SessionLocal, init_db
from app.models import SopCriterion, SopSection, SopTemplate

DEFAULT_FILE = Path(__file__).parent.parent / "docs" / "SOP_Audit_Checklists.xlsx"

# sheet title prefix -> (template code, how the sheet defines the Minimum level)
TOOLS = {
    "cash": ("CASH", "zero"),
    "fmcg": ("FMCG", "third"),
}

SECTION_RE = re.compile(r"^Section\s+([A-Z]):\s*(.*?)\s*(?:\|.*)?$", re.S)


def _text(value):
    """Cell -> stripped string, or None for empty / 'NA'."""
    if value is None:
        return None
    s = str(value).strip()
    if not s or s.upper() == "NA":
        return None
    return s


def _tool_for(sheet_title):
    key = sheet_title.strip().split()[0].lower()
    return TOOLS.get(key)


def parse_sheet(ws):
    """Return a list of sections: {code, name, criteria:[{...}]}."""
    sections = []
    current = None
    for row in ws.iter_rows(min_row=3, values_only=True):
        first, marks = row[0], row[1]
        if first is None:
            continue
        title = str(first).strip()
        m = SECTION_RE.match(title)
        if marks is None and m:
            current = {"code": m.group(1), "name": m.group(2), "criteria": []}
            sections.append(current)
            continue
        if current is None or marks is None:
            continue
        current["criteria"].append({
            "title": title,
            "marks": float(marks),
            "max_text": _text(row[2]),
            "avg_text": _text(row[3]),
            "min_text": _text(row[4]),
            "default_na": "(N/A)" in title,
        })
    return sections


def _min_points(rule, marks):
    return round(marks / 3, 2) if rule == "third" else 0.0


def upsert_template(db, ws, code, rule):
    sections = parse_sheet(ws)
    name = ws.title.strip()
    tpl = db.query(SopTemplate).filter_by(code=code).first()
    if tpl is None:
        tpl = SopTemplate(code=code, name=name, min_rule=rule)
        db.add(tpl)
        db.flush()
    tpl.name, tpl.min_rule, tpl.is_active = name, rule, True

    existing_sections = {s.code: s for s in tpl.sections}
    total = 0.0
    n_criteria = 0
    for s_idx, sec in enumerate(sections):
        row = existing_sections.get(sec["code"])
        if row is None:
            row = SopSection(template_id=tpl.id, code=sec["code"],
                             name=sec["name"])
            db.add(row)
            db.flush()
        row.name, row.sort_order = sec["name"], s_idx

        existing_crit = {c.sort_order: c for c in row.criteria}
        for c_idx, crit in enumerate(sec["criteria"]):
            c = existing_crit.get(c_idx)
            if c is None:
                c = SopCriterion(section_id=row.id, title=crit["title"],
                                 marks=crit["marks"])
                db.add(c)
            c.sort_order = c_idx
            c.title = crit["title"]
            c.marks = crit["marks"]
            c.max_text = crit["max_text"]
            c.avg_text = crit["avg_text"]
            c.min_text = crit["min_text"]
            c.min_points = _min_points(rule, crit["marks"])
            c.default_na = crit["default_na"]
            n_criteria += 1
            if not crit["default_na"]:
                total += crit["marks"]
    tpl.total_marks = total
    return tpl, len(sections), n_criteria


def import_sop(path=DEFAULT_FILE):
    wb = load_workbook(str(path), data_only=True)
    init_db()
    db = SessionLocal()
    try:
        for ws in wb.worksheets:
            tool = _tool_for(ws.title)
            if tool is None:
                print(f"  skipped sheet (unknown tool): {ws.title!r}")
                continue
            tpl, n_sec, n_crit = upsert_template(db, ws, *tool)
            print(f"  {tpl.code}: {n_sec} sections, {n_crit} criteria, "
                  f"{tpl.total_marks:g} marks")
        db.commit()
    finally:
        db.close()
        wb.close()


if __name__ == "__main__":
    print("Importing SOP audit tools...")
    import_sop(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_FILE)
    print("Done.")
