from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import require_roles
from ..db import get_db
from ..models import ROLE_AUDIT_MANAGER, Audit, Issue, Store, StoreScore, User

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/dashboard")
def dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER)),
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
        [{"store": store_by_id[sc.store_id].name,
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
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER)),
):
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    return [u.to_dict() for u in q.all()]
