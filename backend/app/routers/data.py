from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_roles
from ..db import get_db
from ..models import (
    ROLE_AUDIT_MANAGER, CashDepositPickup, CashReconciliation, DataImport,
    ExpiredInventory, StoreScore, User,
)
from ..schemas import (
    CashDepositPickupOut, CashReconciliationOut, DataImportOut,
    ExpiredInventoryOut, StoreScoreOut,
)

router = APIRouter(prefix="/api", tags=["data"])


@router.get("/data-imports", response_model=list[DataImportOut])
def list_data_imports(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER)),
):
    rows = db.query(DataImport).order_by(DataImport.imported_at.desc()).all()
    return [{
        "id": di.id, "file_name": di.file_name,
        "data_section": di.data_section,
        "column_headers": di.column_headers,
        "imported_at": di.imported_at.isoformat() if di.imported_at else None,
    } for di in rows]


@router.get("/cash-reconciliations", response_model=list[CashReconciliationOut])
def list_cash_reconciliations(
    store_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(CashReconciliation)
    if store_id:
        q = q.filter(CashReconciliation.store_id == store_id)
    return [{
        "id": cr.id, "store_id": cr.store_id,
        "cash_at_tills": cr.cash_at_tills,
        "cash_in_safe": cr.cash_in_safe,
        "cash_other_locations": cr.cash_other_locations,
        "physical_cash_total": cr.physical_cash_total,
        "cash_sales_as_per_report": cr.cash_sales_as_per_report,
        "float_or_imprest_amount": cr.float_or_imprest_amount,
        "book_cash_total": cr.book_cash_total,
        "difference": cr.difference,
        "remarks": cr.remarks,
        "raw_data": cr.raw_data,
    } for cr in q.all()]


@router.get("/cash-deposit-pickups", response_model=list[CashDepositPickupOut])
def list_cash_deposit_pickups(
    store_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(CashDepositPickup)
    if store_id:
        q = q.filter(CashDepositPickup.store_id == store_id)
    return [{
        "id": cd.id, "store_id": cd.store_id,
        "sales_date": cd.sales_date.isoformat() if cd.sales_date else None,
        "cash_sales": cd.cash_sales,
        "cash_deposited": cd.cash_deposited,
        "difference": cd.difference,
        "cms_pickup_date": cd.cms_pickup_date.isoformat() if cd.cms_pickup_date else None,
        "handover_delay_days": cd.handover_delay_days,
        "remarks": cd.remarks,
    } for cd in q.order_by(CashDepositPickup.sales_date).all()]


@router.get("/expired-inventory", response_model=list[ExpiredInventoryOut])
def list_expired_inventory(
    store_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(ExpiredInventory)
    if store_id:
        q = q.filter(ExpiredInventory.store_id == store_id)
    return [{
        "id": ei.id, "store_id": ei.store_id,
        "article_code": ei.article_code,
        "article_description": ei.article_description,
        "expiry_date": ei.expiry_date.isoformat() if ei.expiry_date else None,
        "review_date": ei.review_date.isoformat() if ei.review_date else None,
        "quantity": ei.quantity, "mrp": ei.mrp,
    } for ei in q.order_by(ExpiredInventory.expiry_date).all()]


@router.get("/store-scores", response_model=list[StoreScoreOut])
def list_store_scores(
    store_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(StoreScore)
    if store_id:
        q = q.filter(StoreScore.store_id == store_id)
    return [{
        "id": ss.id, "store_id": ss.store_id,
        "store_code": ss.store_code, "status": ss.status,
        "q1": ss.q1, "q2": ss.q2, "q3": ss.q3, "q4": ss.q4,
    } for ss in q.all()]
