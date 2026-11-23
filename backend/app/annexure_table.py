"""Annexure tables: a small grid the auditor fills in under one question.

The audit manager defines the layout once on the question (stored in
Question.meta["annexure"]):

    {"columns": [{"name": "Opening", "type": "number", "total": true}, {"name": "Notes", "type": "text"}],
     "row_header": "Counter",                       # optional
     "row_labels": ["Cash counter 1", "Cash counter 2"],   # optional
     "default_rows": 3}

The auditor's filled-in copy (AuditResponse.annexure) is:

    {"rows": [{"label": "Cash counter 1", "cells": ["10", "x"]}, ...]}

Cells are kept as the text that was typed. Number columns only accept a number or nothing.
"""
MAX_COLUMNS = 20
MAX_NAME = 60
MAX_LABELS = 50
MAX_DEFAULT_ROWS = 50
MAX_ROWS = 200
MAX_CELL = 500
COLUMN_TYPES = ("text", "number")


def is_number(text):
    """True for an empty string or text that reads as a number."""
    text = text.strip()
    if not text:
        return True
    try:
        float(text.replace(",", ""))
    except ValueError:
        return False
    return True


def clean_template(template):
    """The layout, tidied, or None when there is no annexure. Raises ValueError."""
    if not template:
        return None
    if not isinstance(template, dict):
        raise ValueError("annexure must be an object")
    columns = template.get("columns")
    if not isinstance(columns, list) or not 1 <= len(columns) <= MAX_COLUMNS:
        raise ValueError(f"an annexure needs 1 to {MAX_COLUMNS} columns")
    cleaned = []
    seen = set()
    for col in columns:
        if not isinstance(col, dict):
            raise ValueError("each column must be an object")
        name = str(col.get("name", "")).strip()
        kind = col.get("type", "text")
        if not name or len(name) > MAX_NAME:
            raise ValueError(f"column names are required and at most {MAX_NAME} characters")
        if name.lower() in seen:
            raise ValueError(f"column name '{name}' is used twice")
        if kind not in COLUMN_TYPES:
            raise ValueError("column type must be text or number")
        seen.add(name.lower())
        entry = {"name": name, "type": kind}
        if kind == "number" and col.get("total"):
            entry["total"] = True  # the grid shows the sum of this column
        cleaned.append(entry)

    labels = template.get("row_labels") or []
    if not isinstance(labels, list) or len(labels) > MAX_LABELS:
        raise ValueError(f"at most {MAX_LABELS} row names")
    labels = [str(x).strip()[:MAX_NAME] for x in labels if str(x).strip()]

    try:
        default_rows = int(template.get("default_rows") or 0)
    except (TypeError, ValueError):
        raise ValueError("default rows must be a number")
    if not 0 <= default_rows <= MAX_DEFAULT_ROWS:
        raise ValueError(f"default rows must be 0 to {MAX_DEFAULT_ROWS}")

    out = {"columns": cleaned, "default_rows": default_rows}
    if labels:
        out["row_labels"] = labels
        out["row_header"] = str(template.get("row_header") or "").strip()[:MAX_NAME]
    return out


def clean_data(template, data):
    """The filled-in rows, checked against the layout. Raises ValueError."""
    if not template:
        raise ValueError("this question has no annexure")
    if data is None:
        return None
    rows = data.get("rows") if isinstance(data, dict) else None
    if not isinstance(rows, list) or len(rows) > MAX_ROWS:
        raise ValueError(f"an annexure has at most {MAX_ROWS} rows")
    columns = template["columns"]
    cleaned = []
    for row in rows:
        cells = row.get("cells") if isinstance(row, dict) else None
        if not isinstance(cells, list) or len(cells) != len(columns):
            raise ValueError("each row needs one cell per column")
        cells = ["" if c is None else str(c) for c in cells]
        for cell, col in zip(cells, columns):
            if len(cell) > MAX_CELL:
                raise ValueError(f"a cell is longer than {MAX_CELL} characters")
            if col["type"] == "number" and not is_number(cell):
                raise ValueError(f"'{cell}' is not a number (column {col['name']})")
        cleaned.append({"label": str(row.get("label") or "")[:MAX_NAME], "cells": cells})
    return {"rows": cleaned}
