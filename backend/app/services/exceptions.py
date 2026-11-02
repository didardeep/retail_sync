"""Data analytics exceptions: the rows in the imported cash and inventory data
that break a rule, so an auditor knows what to verify at the store."""
import datetime as dt

from ..models import CashDepositPickup, CashReconciliation, ExpiredInventory, Store

MAX_HANDOVER_DAYS = 2
HIGH_CASH_DIFFERENCE = 1000


def _rupees(value):
    return f"Rs. {abs(value):,.0f}"


def _row(store, kind, severity, title, detail, date=None):
    return {
        "store_id": store.id, "store": store.name, "kind": kind, "severity": severity,
        "title": title, "detail": detail, "date": date.isoformat() if date else None,
    }


def store_exceptions(db, store_ids=None, today=None):
    """Every exception for `store_ids` (None means all stores), worst first."""
    today = today or dt.date.today()
    stores = {s.id: s for s in db.query(Store).all()
              if store_ids is None or s.id in store_ids}
    rows = []

    for r in db.query(CashReconciliation).filter(CashReconciliation.store_id.in_(stores)):
        if r.difference:
            rows.append(_row(
                stores[r.store_id], "Cash reconciliation",
                "High" if abs(r.difference) >= HIGH_CASH_DIFFERENCE else "Medium",
                f"Cash difference of {_rupees(r.difference)}",
                r.remarks or "Physical cash does not match the books."))

    for r in db.query(CashDepositPickup).filter(CashDepositPickup.store_id.in_(stores)):
        if r.handover_delay_days and r.handover_delay_days > MAX_HANDOVER_DAYS:
            rows.append(_row(
                stores[r.store_id], "Cash deposit", "Medium",
                f"Cash handed over {r.handover_delay_days} days late",
                r.remarks or f"Limit is {MAX_HANDOVER_DAYS} days.", r.sales_date))
        if r.difference:
            rows.append(_row(
                stores[r.store_id], "Cash deposit", "High",
                f"Deposit short by {_rupees(r.difference)}",
                r.remarks or "Cash deposited does not match cash sales.", r.sales_date))

    for r in db.query(ExpiredInventory).filter(ExpiredInventory.store_id.in_(stores)):
        if r.expiry_date and r.expiry_date <= (r.review_date or today):
            rows.append(_row(
                stores[r.store_id], "Expired inventory", "High",
                f"Expired stock: {r.article_description or r.article_code}",
                f"{r.quantity:g} units past expiry." if r.quantity else "Past expiry.",
                r.expiry_date))

    order = {"High": 0, "Medium": 1}
    return sorted(rows, key=lambda x: (order[x["severity"]], x["store"], x["kind"]))
