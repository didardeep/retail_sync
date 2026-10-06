"""Versioned SOP audit tools: validate, diff and publish a new version.

A tool is edited as a "tree" (plain dicts, the same shape the editor sends):

    {code, name, min_rule, sections: [
        {key, code, name, criteria: [
            {key, title, marks, max_text, avg_text, min_text,
             default_na, requires_comment, requires_photo}]}]}

`key` is the stable key that follows a section or question through versions
(None for an item that is new). Publishing never edits a version in place: it
copies the tree into a new sop_templates row (version + 1), so audits done on
the old version keep the marks and wording they were scored with
(docs/SOP_Audit_Decisions.md, D21). The import script publishes through here
as well, so there is one code path that creates template rows.
"""
import datetime as dt
import string
from collections import namedtuple

from sqlalchemy.exc import IntegrityError

from .models import SopAudit, SopCriterion, SopSection, SopTemplate, _uid
from .services import SOP_PLANNED, log_action

MIN_RULES = ("zero", "third")

CRITERION_FIELDS = (
    "title", "marks", "max_text", "avg_text", "min_text",
    "default_na", "requires_comment", "requires_photo",
)
_TEXT_FIELDS = ("max_text", "avg_text", "min_text")
_FLAG_FIELDS = ("default_na", "requires_comment", "requires_photo")

PublishResult = namedtuple("PublishResult", "template unchanged diff moved_audits")


class StaleVersion(Exception):
    """The editor started from a version that is no longer the current one."""

    def __init__(self, current_version):
        super().__init__(f"tool is now at version {current_version}")
        self.current_version = current_version


class InvalidTree(Exception):
    def __init__(self, errors):
        super().__init__("; ".join(errors))
        self.errors = errors


# --------------------------------------------------------------------------
# Tree <-> ORM
# --------------------------------------------------------------------------
def tree_of(template, with_ids=False):
    """The tree for one stored version, with stable keys (and row ids)."""
    sections = []
    for sec in template.sections:
        s = {"key": sec.stable_key, "code": sec.code, "name": sec.name,
             "criteria": []}
        if with_ids:
            s["id"] = sec.id
        for c in sec.criteria:
            item = {
                "key": c.stable_key, "title": c.title, "marks": c.marks,
                "max_text": c.max_text, "avg_text": c.avg_text,
                "min_text": c.min_text, "default_na": bool(c.default_na),
                "requires_comment": bool(c.requires_comment),
                "requires_photo": bool(c.requires_photo),
            }
            if with_ids:
                item["id"] = c.id
            s["criteria"].append(item)
        sections.append(s)
    return {"code": template.code, "name": template.name,
            "min_rule": template.min_rule, "sections": sections}


def _blank(value):
    return value is None or not str(value).strip()


def _clean_text(value):
    return None if _blank(value) else str(value).strip()


def normalize_tree(tree):
    """A cleaned copy: stripped text, blank optional text -> None, booleans,
    and blank section codes filled with the first unused letter A, B, C..."""
    sections = []
    used = {str(s.get("code")).strip() for s in tree.get("sections") or []
            if not _blank(s.get("code"))}
    spare = (ch for ch in string.ascii_uppercase if ch not in used)
    for sec in tree.get("sections") or []:
        code = "" if _blank(sec.get("code")) else str(sec["code"]).strip()
        if not code:
            code = next(spare, "")
        criteria = []
        for c in sec.get("criteria") or []:
            item = {"key": c.get("key") or None,
                    "title": str(c.get("title") or "").strip()}
            marks = c.get("marks")
            item["marks"] = float(marks) if isinstance(marks, (int, float)) \
                and not isinstance(marks, bool) else marks
            for f in _TEXT_FIELDS:
                item[f] = _clean_text(c.get(f))
            for f in _FLAG_FIELDS:
                item[f] = bool(c.get(f))
            criteria.append(item)
        sections.append({"key": sec.get("key") or None, "code": code,
                         "name": str(sec.get("name") or "").strip(),
                         "criteria": criteria})
    return {"code": tree.get("code"), "name": str(tree.get("name") or "").strip(),
            "min_rule": tree.get("min_rule") or "zero", "sections": sections}


def marks_ok(marks):
    """Marks must be a number above 0 in steps of 0.5."""
    if isinstance(marks, bool) or not isinstance(marks, (int, float)):
        return False
    return marks > 0 and abs(marks * 2 - round(marks * 2)) < 1e-9


def validate_tree(tree):
    """Problems that block publishing, as readable strings (empty = valid)."""
    errors = []
    name = tree.get("name")
    if _blank(name):
        errors.append("Tool name is required")
    if (tree.get("min_rule") or "zero") not in MIN_RULES:
        errors.append("Minimum rule must be 'zero' or 'third'")
    sections = tree.get("sections") or []
    if not sections:
        errors.append("A tool needs at least one section")
    codes, section_keys, criterion_keys = set(), set(), set()
    for s_idx, sec in enumerate(sections):
        label = f"Section {sec.get('code') or s_idx + 1}"
        if _blank(sec.get("name")):
            errors.append(f"{label}: name is required")
        code = None if _blank(sec.get("code")) else str(sec["code"]).strip()
        if code is not None:
            if code in codes:
                errors.append(f"{label}: section code {code} is used twice")
            codes.add(code)
        key = sec.get("key")
        if key:
            if key in section_keys:
                errors.append(f"{label}: section key {key} is used twice")
            section_keys.add(key)
        criteria = sec.get("criteria") or []
        if not criteria:
            errors.append(f"{label}: add at least one question")
        for c_idx, c in enumerate(criteria):
            where = f"{label}, question {c_idx + 1}"
            if _blank(c.get("title")):
                errors.append(f"{where}: question text is required")
            if not marks_ok(c.get("marks")):
                errors.append(f"{where}: marks must be above 0 in steps of 0.5")
            if not c.get("default_na"):
                if _blank(c.get("max_text")):
                    errors.append(f"{where}: Best text is required")
                if _blank(c.get("min_text")):
                    errors.append(f"{where}: Least text is required")
            ckey = c.get("key")
            if ckey:
                if ckey in criterion_keys:
                    errors.append(f"{where}: question key {ckey} is used twice")
                criterion_keys.add(ckey)
    return errors


# --------------------------------------------------------------------------
# Diff
# --------------------------------------------------------------------------
def _section_label(sec):
    return f"{sec.get('code') or '?'}. {sec.get('name') or ''}".strip()


def _index(tree):
    """key -> (section, criterion_or_None) for every keyed item."""
    sections, criteria = {}, {}
    for sec in tree.get("sections") or []:
        if sec.get("key"):
            sections[sec["key"]] = sec
        for c in sec.get("criteria") or []:
            if c.get("key"):
                criteria[c["key"]] = (sec, c)
    return sections, criteria


def _moved_items(old_keys, new_keys):
    """Keys present in both lists whose position among the shared keys differs."""
    shared = set(old_keys) & set(new_keys)
    before = [k for k in old_keys if k in shared]
    after = [k for k in new_keys if k in shared]
    return [(k, before.index(k), after.index(k)) for k in after
            if before.index(k) != after.index(k)]


def diff_tree(old, new):
    """What publishing `new` over `old` changes. Items are matched by key; an
    item in `new` with no key, or a key the old tree does not know, is added."""
    old_sections, old_criteria = _index(old)
    new_sections, new_criteria = _index(new)
    added, removed, changed, reordered = [], [], [], []

    if old.get("name") != new.get("name"):
        changed.append({"kind": "tool", "key": None, "label": new.get("name"),
                        "fields": [{"field": "name", "old": old.get("name"),
                                    "new": new.get("name")}]})
    if (old.get("min_rule") or "zero") != (new.get("min_rule") or "zero"):
        changed.append({"kind": "tool", "key": None, "label": new.get("name"),
                        "fields": [{"field": "min_rule", "old": old.get("min_rule"),
                                    "new": new.get("min_rule")}]})

    for sec in new.get("sections") or []:
        known = sec.get("key") in old_sections
        if not known:
            added.append({"kind": "section", "key": None,
                          "label": _section_label(sec)})
        else:
            before = old_sections[sec["key"]]
            fields = [{"field": f, "old": before.get(f), "new": sec.get(f)}
                      for f in ("code", "name") if before.get(f) != sec.get(f)]
            if fields:
                changed.append({"kind": "section", "key": sec["key"],
                                "label": _section_label(sec), "fields": fields})
        for c in sec.get("criteria") or []:
            if c.get("key") not in old_criteria:
                added.append({"kind": "criterion", "key": None,
                              "label": c.get("title"),
                              "section": _section_label(sec)})
                continue
            old_sec, before = old_criteria[c["key"]]
            fields = [{"field": f, "old": before.get(f), "new": c.get(f)}
                      for f in CRITERION_FIELDS if before.get(f) != c.get(f)]
            if old_sec.get("key") != sec.get("key"):
                fields.append({"field": "section", "old": _section_label(old_sec),
                               "new": _section_label(sec)})
            if fields:
                changed.append({"kind": "criterion", "key": c["key"],
                                "label": c.get("title"),
                                "section": _section_label(sec), "fields": fields})

    for sec in old.get("sections") or []:
        if sec.get("key") not in new_sections:
            removed.append({"kind": "section", "key": sec.get("key"),
                            "label": _section_label(sec)})
        for c in sec.get("criteria") or []:
            if c.get("key") not in new_criteria:
                removed.append({"kind": "criterion", "key": c.get("key"),
                                "label": c.get("title"),
                                "section": _section_label(sec)})

    old_order = [s["key"] for s in old.get("sections") or [] if s.get("key")]
    new_order = [s["key"] for s in new.get("sections") or []
                 if s.get("key") in old_sections]
    for key, was, now in _moved_items(old_order, new_order):
        reordered.append({"kind": "section", "key": key,
                          "label": _section_label(new_sections[key]),
                          "from": was + 1, "to": now + 1})
    for sec in new.get("sections") or []:
        if sec.get("key") not in old_sections:
            continue
        before = [c["key"] for c in old_sections[sec["key"]].get("criteria") or []
                  if c.get("key")]
        after = [c["key"] for c in sec.get("criteria") or []
                 if c.get("key") in old_criteria
                 and old_criteria[c["key"]][0].get("key") == sec["key"]]
        for key, was, now in _moved_items(before, after):
            reordered.append({"kind": "criterion", "key": key,
                              "label": new_criteria[key][1].get("title"),
                              "section": _section_label(sec),
                              "from": was + 1, "to": now + 1})

    summary = {"added": len(added), "removed": len(removed),
               "changed": len(changed), "reordered": len(reordered)}
    summary["total"] = sum(summary.values())
    return {"added": added, "removed": removed, "changed": changed,
            "reordered": reordered, "summary": summary}


# --------------------------------------------------------------------------
# Publish
# --------------------------------------------------------------------------
def min_points(rule, marks):
    """Guide points for the Minimum level (same rule the importer always used)."""
    return round(marks / 3, 2) if rule == "third" else 0.0


def total_marks_of(tree):
    return sum(c["marks"] for s in tree["sections"] for c in s["criteria"]
               if not c["default_na"])


def _current(db, code):
    return db.query(SopTemplate).filter_by(code=code, is_current=True).first()


def _build_rows(db, tpl, tree, old_tree):
    """Create the section and criterion rows for `tpl`. A key the previous
    version had is kept; anything else gets a fresh key."""
    old_sections, old_criteria = _index(old_tree) if old_tree else ({}, {})
    for s_idx, sec in enumerate(tree["sections"]):
        key = sec["key"] if sec["key"] in old_sections else _uid()
        row = SopSection(template_id=tpl.id, code=sec["code"], name=sec["name"],
                         sort_order=s_idx, stable_key=key)
        db.add(row)
        db.flush()
        for c_idx, c in enumerate(sec["criteria"]):
            ckey = c["key"] if c["key"] in old_criteria else _uid()
            db.add(SopCriterion(
                section_id=row.id, sort_order=c_idx, stable_key=ckey,
                title=c["title"], marks=c["marks"],
                max_text=c["max_text"], avg_text=c["avg_text"],
                min_text=c["min_text"],
                min_points=min_points(tree["min_rule"], c["marks"]),
                default_na=c["default_na"],
                requires_comment=c["requires_comment"],
                requires_photo=c["requires_photo"]))


def _move_planned_audits(db, code, new_tpl):
    """Planned audits nobody has started follow the tool to its new version.
    One with any score or photo stays where it is: its rows point at the old
    version's questions."""
    old_ids = [t.id for t in db.query(SopTemplate.id).filter(
        SopTemplate.code == code, SopTemplate.id != new_tpl.id)]
    if not old_ids:
        return 0
    rows = (db.query(SopAudit)
            .filter(SopAudit.template_id.in_(old_ids),
                    SopAudit.status == SOP_PLANNED,
                    ~SopAudit.scores.any(), ~SopAudit.attachments.any())
            .all())
    for audit in rows:
        audit.template_id = new_tpl.id
    return len(rows)


def publish_version(db, code, tree, user=None, base_version=None, change_note=None):
    """Publish `tree` as the next version of tool `code`, in one transaction.

    Raises StaleVersion when `base_version` is not the current version and
    InvalidTree when the tree breaks a rule. When nothing differs from the
    current version nothing is written and the current template comes back
    with unchanged=True. `user` is None for system imports (no author, no log
    entry). A tool with no version yet gets version 1 (base_version ignored).
    """
    current = _current(db, code)
    if current is not None and base_version != current.version:
        raise StaleVersion(current.version)

    tree = normalize_tree(tree)
    old_tree = tree_of(current) if current else None
    # Without a previous version no key is known; every item gets a fresh one.
    errors = validate_tree(tree)
    if errors:
        raise InvalidTree(errors)

    diff = diff_tree(old_tree, tree) if old_tree else None
    if current is not None and diff["summary"]["total"] == 0:
        return PublishResult(current, True, diff, 0)

    try:
        version = current.version + 1 if current else 1
        tpl = SopTemplate(
            code=code, name=tree["name"], version=version, is_current=True,
            is_active=current.is_active if current else True,
            min_rule=tree["min_rule"], total_marks=total_marks_of(tree),
            published_at=dt.datetime.utcnow(),
            created_by_id=user.id if user else None,
            change_note=(change_note or "").strip() or None)
        if current is not None:
            current.is_current = False
        db.add(tpl)
        db.flush()
        _build_rows(db, tpl, tree, old_tree)
        moved = _move_planned_audits(db, code, tpl) if current else 0
        if user is not None:
            summary = diff["summary"] if diff else {"added": 0}
            log_action(db, user.id, "publish_sop_tool", "sop_template", tpl.id,
                       {"code": code, "version": version, "summary": summary,
                        "moved_audits": moved})
        db.commit()
    except IntegrityError:
        # Someone published the same version number between our check and now.
        db.rollback()
        latest = _current(db, code)
        raise StaleVersion(latest.version if latest else version - 1)
    except Exception:
        db.rollback()
        raise
    return PublishResult(tpl, False, diff, moved)
