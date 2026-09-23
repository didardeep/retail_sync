"""Upload an Excel file and import its data into the corresponding table."""
import datetime as dt
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..auth import require_roles
from ..db import get_db
from ..models import (
    ROLE_AUDIT_MANAGER, CashDepositPickup, CashReconciliation, DataImport,
    ExpiredInventory, Store, StoreScore, User,
)
from ..services import log_action

router = APIRouter(prefix="/api", tags=["upload"])

UPLOAD_FOLDER = Path(__file__).parent.parent.parent / "uploads"
UPLOAD_FOLDER.mkdir(exist_ok=True)

SECTION_MAP = {
    "cash_reconciliation": "cash_reconciliation",
    "cash_deposit_pickups": "cash_deposit_pickups",
    "expired_inventory": "expired_inventory",
    "store_scores": "store_scores",
}


@router.post("/upload", status_code=201)
async def upload_file(
    file: UploadFile = File(...),
    section: str = Form(""),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_AUDIT_MANAGER)),
):
    section = section.strip()
    if section not in SECTION_MAP:
        raise HTTPException(status_code=400, detail={
            "error": f"invalid section, must be one of: {list(SECTION_MAP.keys())}",
        })

    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail={
            "error": "only Excel files (.xlsx) are accepted",
        })

    # Save file
    filepath = UPLOAD_FOLDER / file.filename
    contents = await file.read()
    filepath.write_bytes(contents)

    # Import into DB
    try:
        from openpyxl import load_workbook
        wb = load_workbook(str(filepath), read_only=True, data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        wb.close()

        if not rows:
            raise HTTPException(status_code=400, detail={"error": "empty file"})

        headers = [str(h).strip() if h else f"col_{i}" for i, h in enumerate(rows[0])]
        data_rows = []
        for row in rows[1:]:
            d = {}
            for i, val in enumerate(row):
                if i < len(headers):
                    d[headers[i]] = val
            data_rows.append(d)

        di = DataImport(
            file_name=file.filename,
            data_section=section,
            column_headers=headers,
        )
        db.add(di)
        db.flush()

        count = _import_rows(db, di, section, data_rows)
        log_action(db, user.id, "upload_file", "data_import", di.id,
                   {"file_name": file.filename, "section": section, "records": count})
        db.commit()

        return {
            "message": f"Imported {count} records from {file.filename}",
            "import_id": di.id,
            "records": count,
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail={"error": str(e)})


def _json_safe_val(val):
    """Coerce a value to a JSON-serialisable form (dates -> isoformat)."""
    if val is None:
        return None
    if isinstance(val, dt.datetime):
        return val.isoformat()
    if isinstance(val, dt.date):
        return val.isoformat()
    if isinstance(val, (int, float, str, bool)):
        return val
    return str(val)


def _json_safe_row(row: dict) -> dict:
    return {k: _json_safe_val(v) for k, v in row.items()}


def _parse_date_val(val):
    if val is None:
        return None
    if isinstance(val, dt.date):
        return val
    if isinstance(val, dt.datetime):
        return val.date()
    try:
        return dt.date.fromisoformat(str(val).strip())
    except (ValueError, TypeError):
        return None


def _float_val(val):
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _resolve_store_id(session, row):
    """Resolve a 'Store ID' value to a stores.id, handling both ST0xx and
    numeric store_code formats."""
    raw = str(row.get("Store ID", "")).strip()
    if not raw:
        return raw
    # Already an STxxx id?
    if raw.upper().startswith("ST"):
        return raw
    # Try matching by store_code
    store = session.query(Store).filter(Store.store_code == raw).first()
    if store:
        return store.id
    # Fallback: zero-pad and try as ST id
    try:
        return f"ST{int(raw):03d}"
    except (ValueError, TypeError):
        return raw


def _import_rows(session, di, section, data_rows):
    count = 0
    safe = _json_safe_row
    for idx, row in enumerate(data_rows, 1):
        store_id = _resolve_store_id(session, row)
        if section == "cash_reconciliation":
            session.add(CashReconciliation(
                import_id=di.id,
                store_id=store_id,
                source_row_number=idx,
                cash_at_tills=_float_val(row.get("Cash at Tills")),
                cash_in_safe=_float_val(row.get("Cash in Safe")),
                cash_other_locations=_float_val(row.get("Cash Other Locations") or row.get("Any other place")),
                physical_cash_total=_float_val(row.get("Physical Cash Total")),
                cash_sales_as_per_report=_float_val(row.get("Cash Sales as per Report") or row.get("Cash Sales as per sales Report")),
                float_or_imprest_amount=_float_val(row.get("Float or Imprest Amount") or row.get("Float and Imprest allocated to the store as per Master")),
                book_cash_total=_float_val(row.get("Book Cash Total")),
                difference=_float_val(row.get("Difference") or row.get("Difference (A-B)")),
                remarks=str(row.get("Remarks", "") or ""),
                raw_data=safe(row),
            ))
        elif section == "cash_deposit_pickups":
            session.add(CashDepositPickup(
                import_id=di.id,
                store_id=store_id,
                source_row_number=idx,
                sales_date=_parse_date_val(row.get("Sales Date") or row.get("Sales Date (A)")),
                cash_sales=_float_val(row.get("Cash Sales")),
                cash_deposited=_float_val(row.get("Cash Deposited") or row.get("Cash Deposited (c)")),
                difference=_float_val(row.get("Difference") or row.get("Difference (B-C)")),
                cms_pickup_date=_parse_date_val(row.get("CMS Pickup Date") or row.get("CMS Pick Up date (D)")),
                handover_delay_days=int(row.get("Handover Delay Days") or row.get("Delay in cash handover (A-D)") or 0),
                remarks=str(row.get("Remarks", "") or ""),
                raw_data=safe(row),
            ))
        elif section == "expired_inventory":
            session.add(ExpiredInventory(
                import_id=di.id,
                store_id=store_id,
                source_row_number=idx,
                article_code=str(row.get("Article Code", "") or ""),
                article_description=str(row.get("Article Description", "") or ""),
                expiry_date=_parse_date_val(row.get("Expiry Date")),
                review_date=_parse_date_val(row.get("Review Date")),
                quantity=_float_val(row.get("Quantity")),
                mrp=_float_val(row.get("MRP")),
                raw_data=safe(row),
            ))
        elif section == "store_scores":
            session.add(StoreScore(
                import_id=di.id,
                store_id=store_id,
                source_row_number=idx,
                store_code=str(row.get("Store Code") or row.get("Store code") or ""),
                status=str(row.get("Status", "") or ""),
                q1=_float_val(row.get("Q1")),
                q2=_float_val(row.get("Q2")),
                q3=_float_val(row.get("Q3")),
                q4=_float_val(row.get("Q4")),
                raw_data=safe(row),
            ))
        count += 1
    return count
