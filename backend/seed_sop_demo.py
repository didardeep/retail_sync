"""
Creates a believable history of finished SOP audits so the dashboard has
something to show. Deterministic: the same stores always get the same pattern,
and re-running adds nothing (audit ids are derived from store/tool/index).

The pattern is deliberate, so the charts tell a story:
  - each store has its own quality level and a trend (improving or slipping)
  - some sections and some individual criteria are weak in every store
  - two stores are overdue for an audit (coverage panel)
  - not every store is audited with every tool

    python seed_sop_demo.py
"""
import datetime as dt
import random
import uuid
import zlib

from app.db import SessionLocal, init_db
from app.models import (
    ROLE_AUDITOR, SopAudit, SopAuditScore, SopTemplate, Store, User,
)
from app.services import compute_sop_score

_NAMESPACE = uuid.UUID("5f0c3a53-7a54-4c2e-9b0e-0d0a5c1e51a0")

# Base quality per store, assigned in store-id order (cycled if more stores).
STORE_QUALITY = [0.93, 0.88, 0.84, 0.80, 0.76, 0.72, 0.66, 0.60, 0.86, 0.70]
# Per-audit change in quality: positive = improving, negative = slipping.
STORE_TREND = [0.02, -0.03, 0.03, 0.01, 0.04, -0.02, 0.03, -0.01, 0.02, 0.0]
# Stores (by position) that are overdue, and how long ago their last audit was.
OVERDUE = {7: 62, 8: 41}

# Sections that run weak in every store, by tool code.
WEAK_SECTIONS = {
    "CASH": {"B": -0.10, "E": -0.06},
    "FMCG": {"D": -0.12, "C": -0.04},
}
AUDITS_PER_STORE = 4
SPACING_DAYS = 35

COMMENTS = [
    "Gaps observed during the walk-through; discussed with the store team.",
    "Partly in place; follow-up needed at the next visit.",
    "Process not followed consistently. Photo taken for reference.",
]


def _stable(text, low, high):
    """Deterministic number in [low, high] from text (same on every run)."""
    return low + (zlib.crc32(text.encode("utf-8")) % 1000) / 999 * (high - low)


def _score_for(marks, quality, section_offset, criterion_title, rng):
    criterion_offset = _stable(criterion_title, -0.12, 0.05)
    p = quality + section_offset + criterion_offset + rng.uniform(-0.08, 0.08)
    p = min(1.0, max(0.0, p))
    return min(marks, max(0.0, round(marks * p * 2) / 2))


def _build_audit(db, store, template, k, n, auditor, quality, trend, days_ago):
    audit_id = str(uuid.uuid5(_NAMESPACE, f"{store.id}|{template.code}|{k}"))
    if db.get(SopAudit, audit_id):
        return False
    when = dt.datetime.utcnow() - dt.timedelta(days=days_ago)
    audit = SopAudit(
        id=audit_id, template_id=template.id, store_id=store.id,
        auditor_id=auditor.id, status="Submitted",
        created_at=when - dt.timedelta(hours=3), updated_at=when,
        submitted_at=when, client_created_at=when - dt.timedelta(hours=3),
        client_submitted_at=when,
    )
    db.add(audit)
    db.flush()

    rng = random.Random(f"{store.id}|{template.code}|{k}")
    q = quality + trend * (k - (n - 1))      # latest audit lands on `quality`
    weak = WEAK_SECTIONS.get(template.code, {})
    for sec in template.sections:
        for c in sec.criteria:
            if c.default_na:
                audit.scores.append(SopAuditScore(
                    criterion_id=c.id, score=None, is_na=True, answered_at=when))
                continue
            score = _score_for(c.marks, q, weak.get(sec.code, 0.0), c.title, rng)
            comment = None
            if score < c.marks * 0.5 and rng.random() < 0.5:
                comment = rng.choice(COMMENTS)
            audit.scores.append(SopAuditScore(
                criterion_id=c.id, score=score, is_na=False,
                comment=comment, answered_at=when))
    db.flush()
    summary = compute_sop_score(audit)
    audit.score, audit.max_score, audit.percent = (
        summary["score"], summary["max_score"], summary["percent"])
    return True


def seed_sop_demo():
    init_db()
    db = SessionLocal()
    try:
        stores = db.query(Store).order_by(Store.id).all()
        templates = db.query(SopTemplate).filter_by(is_active=True).order_by(SopTemplate.code).all()
        auditors = db.query(User).filter_by(role=ROLE_AUDITOR).order_by(User.email).all()
        if not stores or not templates or not auditors:
            print("  SOP demo data skipped (needs stores, SOP tools and auditors)")
            return
        created = 0
        for i, store in enumerate(stores):
            quality = STORE_QUALITY[i % len(STORE_QUALITY)]
            trend = STORE_TREND[i % len(STORE_TREND)]
            for t_idx, template in enumerate(templates):
                # FMCG is run in about two thirds of the stores.
                if template.code == "FMCG" and i % 3 == 2:
                    continue
                for k in range(AUDITS_PER_STORE):
                    newest_days = OVERDUE.get(i, 3 + (i * 4) % 20) + t_idx * 5
                    days_ago = newest_days + (AUDITS_PER_STORE - 1 - k) * SPACING_DAYS
                    auditor = auditors[(i + k + t_idx) % len(auditors)]
                    if _build_audit(db, store, template, k, AUDITS_PER_STORE,
                                    auditor, quality, trend, days_ago):
                        created += 1
        db.commit()
        print(f"  SOP demo audits created: {created}")
    finally:
        db.close()


if __name__ == "__main__":
    print("Creating SOP demo audits...")
    seed_sop_demo()
