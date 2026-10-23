from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import require_roles
from ..db import get_db
from ..models import ROLE_ADMIN, ROLE_AUDIT_MANAGER, Audit, Brand, Issue, Store, StoreScore, User

router = APIRouter(prefix="/api", tags=["dashboard"])

QUARTERS = ("q1", "q2", "q3", "q4")


def _ids(csv):
    return [x for x in (csv or "").split(",") if x.strip()]


def _mean(values):
    return round(sum(values) / len(values), 1) if values else None


@router.get("/dashboard")
def dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    audits = db.query(Audit).all()
    issues = db.query(Issue).all()
    stores = db.query(Store).all()
    scored = [a for a in audits if a.score is not None]

    by_region = {}
    for a in audits:
        key = a.store.region if a.store else "Unknown"
        by_region[key] = by_region.get(key, 0) + 1

    # Use StoreScore table (q4 as latest, fallback q3) for top/bottom ranking
    all_scores = db.query(StoreScore).all()
    store_by_id = {st.id: st for st in stores}
    store_scores = sorted(
        [{"store_id": store_by_id[sc.store_id].id,
          "store": store_by_id[sc.store_id].name,
          "city": store_by_id[sc.store_id].city,
          "score": sc.q4 or sc.q3 or sc.q2 or sc.q1 or 0}
         for sc in all_scores if sc.store_id in store_by_id
         and (sc.q4 or sc.q3 or sc.q2 or sc.q1)],
        key=lambda x: x["score"], reverse=True)

    return {
        "planned": sum(1 for a in audits if a.status == "Planned"),
        "ongoing": sum(1 for a in audits if a.status == "Ongoing"),
        "completed": sum(1 for a in audits if a.status in ("Completed", "Approved")),
        "avg_score": round(sum(a.score for a in scored) / len(scored), 1) if scored else None,
        "total_issues": len(issues),
        "open_issues": sum(1 for i in issues if i.status != "Closed"),
        "overdue_issues": sum(1 for i in issues if i.is_overdue),
        "by_region": by_region,
        "top_stores": store_scores[:5],
        "bottom_stores": store_scores[-5:][::-1],
    }


@router.get("/users")
def list_users(
    role: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    return [u.to_dict() for u in q.all()]


@router.get("/dashboard/brand-trend")
def brand_trend(
    brand_ids: str | None = None,
    store_ids: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER, ROLE_ADMIN)),
):
    """One line per brand for the Overview trend chart: the brand's average
    store score for each quarter (Q1 to Q4), from the quarterly store scores.

    `brand_ids` and `store_ids` are comma lists that limit the brands and the
    stores counted; leave them out for everything. A score of 0 or blank means
    "not scored" and is left out of the average, so an unscored store does not
    pull its brand down.
    """
    stores = db.query(Store)
    if _ids(brand_ids):
        stores = stores.filter(Store.brand_id.in_(_ids(brand_ids)))
    if _ids(store_ids):
        stores = stores.filter(Store.id.in_(_ids(store_ids)))
    stores = stores.all()

    by_store = {sc.store_id: sc for sc in db.query(StoreScore).all()}
    brands = {b.id: b for b in db.query(Brand).order_by(Brand.name).all()}
    out = []
    for brand_id, brand in brands.items():
        members = [st for st in stores if st.brand_id == brand_id]
        if not members:
            continue
        scores = {q: [] for q in QUARTERS}
        scored_stores = set()
        for st in members:
            row = by_store.get(st.id)
            for q in QUARTERS:
                v = getattr(row, q, None) if row else None
                if isinstance(v, (int, float)) and v > 0:
                    scores[q].append(v)
                    scored_stores.add(st.id)
        out.append({
            "brand_id": brand_id, "brand": brand.name,
            "store_count": len(members), "scored_store_count": len(scored_stores),
            "scores": {q: _mean(scores[q]) for q in QUARTERS},
        })
    return {"quarters": list(QUARTERS), "brands": out}
