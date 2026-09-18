"""
Generate dummy Excel files in the uploads/ folder based on the DB column names.
Each file maps to a structured-data table in the database.

    python generate_excel.py
"""
import datetime as dt
import random
from pathlib import Path

from openpyxl import Workbook

UPLOADS = Path(__file__).parent / "uploads"
UPLOADS.mkdir(exist_ok=True)

STORE_IDS = [f"ST{str(i).zfill(3)}" for i in range(1, 11)]

random.seed(42)


def _rand_date(start, end):
    delta = (end - start).days
    return start + dt.timedelta(days=random.randint(0, delta))


# --------------------------------------------------------------------------
# 1. Cash Reconciliation
# --------------------------------------------------------------------------
def gen_cash_reconciliation():
    wb = Workbook()
    ws = wb.active
    ws.title = "Cash Reconciliation"
    headers = [
        "Store ID", "Cash at Tills", "Cash in Safe", "Cash Other Locations",
        "Physical Cash Total", "Cash Sales as per Report",
        "Float or Imprest Amount", "Difference", "Remarks"
    ]
    ws.append(headers)

    remarks_pool = [
        "All OK", "Minor variance noted", "Reconciled after recount",
        "Excess cash found", "Short by petty cash withdrawal",
        "Variance under investigation", "Approved by SM",
        "Till #3 had extra float", "Safe count matched",
        "Pending verification"
    ]

    for store_id in STORE_IDS:
        for _ in range(3):  # 3 records per store
            tills = round(random.uniform(15000, 85000), 2)
            safe = round(random.uniform(5000, 40000), 2)
            other = round(random.uniform(0, 5000), 2)
            physical = round(tills + safe + other, 2)
            sales = round(physical + random.uniform(-3000, 3000), 2)
            imprest = round(random.uniform(2000, 10000), 2)
            diff = round(physical - sales, 2)
            ws.append([
                store_id, tills, safe, other, physical,
                sales, imprest, diff, random.choice(remarks_pool)
            ])

    path = UPLOADS / "cash_reconciliation.xlsx"
    wb.save(path)
    print(f"  Created {path.name} ({ws.max_row - 1} rows)")
    return path


# --------------------------------------------------------------------------
# 2. Cash Deposit Pickups
# --------------------------------------------------------------------------
def gen_cash_deposit_pickups():
    wb = Workbook()
    ws = wb.active
    ws.title = "Cash Deposit Pickups"
    headers = [
        "Store ID", "Sales Date", "Cash Sales", "Cash Deposited",
        "Difference", "CMS Pickup Date", "Handover Delay Days", "Remarks"
    ]
    ws.append(headers)

    remarks_pool = [
        "On time", "Delayed due to holiday", "CMS vehicle breakdown",
        "Deposited next working day", "All OK", "Weekend delay",
        "Partial deposit made", "Full amount deposited",
        "Cash held for change requirement", "Approved by ops manager"
    ]

    base = dt.date(2026, 7, 1)
    for store_id in STORE_IDS:
        for d in range(5):  # 5 records per store
            sales_date = base + dt.timedelta(days=d * 3 + random.randint(0, 2))
            cash_sales = round(random.uniform(20000, 120000), 2)
            deposited = round(cash_sales - random.uniform(-500, 5000), 2)
            diff = round(cash_sales - deposited, 2)
            delay = random.choice([0, 0, 0, 1, 1, 2, 3, 5])
            pickup = sales_date + dt.timedelta(days=delay)
            ws.append([
                store_id, sales_date.isoformat(), cash_sales, deposited,
                diff, pickup.isoformat(), delay, random.choice(remarks_pool)
            ])

    path = UPLOADS / "cash_deposit_pickups.xlsx"
    wb.save(path)
    print(f"  Created {path.name} ({ws.max_row - 1} rows)")
    return path


# --------------------------------------------------------------------------
# 3. Expired Inventory
# --------------------------------------------------------------------------
def gen_expired_inventory():
    wb = Workbook()
    ws = wb.active
    ws.title = "Expired Inventory"
    headers = [
        "Store ID", "Article Code", "Article Description",
        "Expiry Date", "Review Date", "Quantity", "MRP"
    ]
    ws.append(headers)

    articles = [
        ("ART001", "Tata Salt 1kg"),
        ("ART002", "Amul Butter 500g"),
        ("ART003", "Maggi Noodles Pack"),
        ("ART004", "Parle-G Biscuits 800g"),
        ("ART005", "Surf Excel 1kg"),
        ("ART006", "Dairy Milk Silk 150g"),
        ("ART007", "Kissan Jam 500g"),
        ("ART008", "Nestle Milk 1L"),
        ("ART009", "Colgate Toothpaste 200g"),
        ("ART010", "Dettol Soap 125g"),
        ("ART011", "Fortune Oil 1L"),
        ("ART012", "Britannia Bread"),
        ("ART013", "Real Juice 1L"),
        ("ART014", "Haldiram Namkeen 400g"),
        ("ART015", "MTR Ready Meal"),
    ]

    for store_id in STORE_IDS:
        n_items = random.randint(2, 5)
        chosen = random.sample(articles, n_items)
        for code, desc in chosen:
            expiry = _rand_date(dt.date(2026, 6, 1), dt.date(2026, 9, 15))
            review = expiry + dt.timedelta(days=random.randint(1, 10))
            qty = random.randint(1, 25)
            mrp = round(random.uniform(20, 500), 2)
            ws.append([
                store_id, code, desc,
                expiry.isoformat(), review.isoformat(), qty, mrp
            ])

    path = UPLOADS / "expired_inventory.xlsx"
    wb.save(path)
    print(f"  Created {path.name} ({ws.max_row - 1} rows)")
    return path


# --------------------------------------------------------------------------
# 4. Store Scores (Quarterly)
# --------------------------------------------------------------------------
def gen_store_scores():
    wb = Workbook()
    ws = wb.active
    ws.title = "Store Scores"
    headers = ["Store ID", "Store Code", "Status", "Q1", "Q2", "Q3", "Q4"]
    ws.append(headers)

    store_codes = {
        "ST001": "RC-MUM-001", "ST002": "RC-DEL-001", "ST003": "RC-BLR-001",
        "ST004": "RC-DEL-002", "ST005": "RC-PUN-001", "ST006": "RC-CHD-001",
        "ST007": "RC-NAG-001", "ST008": "RC-DDN-001", "ST009": "RC-KOL-001",
        "ST010": "RC-JAI-001",
    }
    statuses = {
        "ST001": "Operating", "ST002": "Operating", "ST003": "Operating",
        "ST004": "Operating", "ST005": "Operating", "ST006": "Operating",
        "ST007": "Operating", "ST008": "Operating", "ST009": "Dehired",
        "ST010": "Dehired",
    }

    for store_id in STORE_IDS:
        base = random.uniform(55, 95)
        q1 = round(base + random.uniform(-5, 5), 1)
        q2 = round(base + random.uniform(-5, 5), 1)
        q3 = round(base + random.uniform(-5, 5), 1)
        q4 = round(base + random.uniform(-5, 5), 1)
        ws.append([
            store_id, store_codes.get(store_id, store_id),
            statuses.get(store_id, "Operating"),
            q1, q2, q3, q4
        ])

    path = UPLOADS / "store_scores.xlsx"
    wb.save(path)
    print(f"  Created {path.name} ({ws.max_row - 1} rows)")
    return path


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
if __name__ == "__main__":
    print("Generating dummy Excel files in uploads/...")
    gen_cash_reconciliation()
    gen_cash_deposit_pickups()
    gen_expired_inventory()
    gen_store_scores()
    print("\nDone! Files ready in backend/uploads/")
