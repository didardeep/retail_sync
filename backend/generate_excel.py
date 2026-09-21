"""
Generate dummy Excel files in the uploads/ folder based on the DB column names.
Each file maps to a structured-data table in the database.

Also generates the two master files:
  - Store_Master_dummy.xlsx  (Store Details, Store Scores, Observation)
  - Store_Audit_Checklist_v1_dummy.xlsx  (All Process Checklist, 1, 2, 3)

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

# Store metadata used across files
STORES = [
    {"id": "ST001", "code": "3130001", "name": "Phoenix Mall", "state": "Maharashtra", "city": "Mumbai", "region": "West India", "district": "Mumbai Suburban", "postal": "H3 Main St, Mumbai 400001", "dm": "Anil Verma", "om": "Suresh Iyer", "catg": "Premium", "format": "COCO", "type": "Flagship", "manager": "P. Rao", "status": "Operational"},
    {"id": "ST002", "code": "3130002", "name": "DLF Avenue", "state": "Delhi", "city": "Delhi", "region": "North India", "district": "South Delhi", "postal": "Sector 24, DLF Phase 3, Delhi 110001", "dm": "Meena Gupta", "om": "Rajiv Khanna", "catg": "Premium", "format": "COFO", "type": "Flagship", "manager": "J. Patel", "status": "Operational"},
    {"id": "ST003", "code": "3130003", "name": "Ub City", "state": "Karnataka", "city": "Bengaluru", "region": "South India", "district": "Bengaluru Urban", "postal": "24 Vittal Mallya Rd, Bengaluru 560001", "dm": "Kavitha Nair", "om": "Deepak Shetty", "catg": "Standard", "format": "COCO", "type": "Standard", "manager": "N. Singh", "status": "Operational"},
    {"id": "ST004", "code": "3130004", "name": "Select Citywalk", "state": "Delhi", "city": "Delhi", "region": "North India", "district": "South Delhi", "postal": "A-3 District Centre, Saket, Delhi 110017", "dm": "Rakesh Jain", "om": "Nidhi Arora", "catg": "Standard", "format": "FOCO", "type": "Standard", "manager": "J. Patel", "status": "Operational"},
    {"id": "ST005", "code": "3130005", "name": "Nexus Mall", "state": "Maharashtra", "city": "Pune", "region": "West India", "district": "Pune", "postal": "Viman Nagar, Pune 411014", "dm": "Priti Desai", "om": "Manish Kulkarni", "catg": "Standard", "format": "FOFO", "type": "Standard", "manager": "R. Das", "status": "Operational"},
    {"id": "ST006", "code": "3130006", "name": "Centra Mall", "state": "Punjab", "city": "Chandigarh", "region": "North India", "district": "Chandigarh", "postal": "Zirakpur Rd, Chandigarh 160001", "dm": "Gurpreet Kaur", "om": "Aman Dhillon", "catg": "Compact", "format": "COCO", "type": "Compact", "manager": "A. Sharma", "status": "Operational"},
    {"id": "ST007", "code": "3130007", "name": "Elante Outpost", "state": "Maharashtra", "city": "Nagpur", "region": "West India", "district": "Nagpur", "postal": "Wardha Rd, Nagpur 440001", "dm": "Sneha Bhonsle", "om": "Vivek Patil", "catg": "Kiosk", "format": "COFO", "type": "Kiosk", "manager": "N. Singh", "status": "Operational"},
    {"id": "ST008", "code": "3130008", "name": "Pacific Hub", "state": "Uttarakhand", "city": "Dehradun", "region": "North India", "district": "Dehradun", "postal": "Rajpur Rd, Dehradun 248001", "dm": "Ramesh Pant", "om": "Vinod Rawat", "catg": "Standard", "format": "FOFO", "type": "Standard", "manager": "P. Rao", "status": "Operational"},
    {"id": "ST009", "code": "3130009", "name": "South City", "state": "West Bengal", "city": "Kolkata", "region": "East India", "district": "Kolkata", "postal": "Prince Anwar Shah Rd, Kolkata 700045", "dm": "Subrata Mondal", "om": "Anirban Roy", "catg": "Compact", "format": "FOCO", "type": "Compact", "manager": "R. Das", "status": "Dehired"},
    {"id": "ST010", "code": "3130010", "name": "Orbit Mall", "state": "Rajasthan", "city": "Jaipur", "region": "North India", "district": "Jaipur", "postal": "Ajmer Rd, Jaipur 302001", "dm": "Lakshmi Sharma", "om": "Rahul Joshi", "catg": "Standard", "format": "FOFO", "type": "Standard", "manager": "J. Patel", "status": "Dehired"},
]

STORE_CODES = {s["id"]: s["code"] for s in STORES}
STATUSES = {s["id"]: s["status"] for s in STORES}


def _rand_date(start, end):
    delta = (end - start).days
    return start + dt.timedelta(days=random.randint(0, delta))


# --------------------------------------------------------------------------
# 1. Cash Reconciliation (with Book Cash Total)
# --------------------------------------------------------------------------
def gen_cash_reconciliation():
    wb = Workbook()
    ws = wb.active
    ws.title = "Cash Reconciliation"
    headers = [
        "Store ID", "Cash at Tills", "Cash in Safe", "Cash Other Locations",
        "Physical Cash Total", "Cash Sales as per Report",
        "Float or Imprest Amount", "Book Cash Total", "Difference", "Remarks"
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
        for _ in range(3):
            tills = round(random.uniform(15000, 85000), 2)
            safe = round(random.uniform(5000, 40000), 2)
            other = round(random.uniform(0, 5000), 2)
            physical = round(tills + safe + other, 2)
            sales = round(physical + random.uniform(-3000, 3000), 2)
            imprest = round(random.uniform(2000, 10000), 2)
            book_total = round(sales + imprest, 2)
            diff = round(physical - book_total, 2)
            ws.append([
                store_id, tills, safe, other, physical,
                sales, imprest, book_total, diff, random.choice(remarks_pool)
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
        for d in range(5):
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
        ("ART001", "Tata Salt 1kg"), ("ART002", "Amul Butter 500g"),
        ("ART003", "Maggi Noodles Pack"), ("ART004", "Parle-G Biscuits 800g"),
        ("ART005", "Surf Excel 1kg"), ("ART006", "Dairy Milk Silk 150g"),
        ("ART007", "Kissan Jam 500g"), ("ART008", "Nestle Milk 1L"),
        ("ART009", "Colgate Toothpaste 200g"), ("ART010", "Dettol Soap 125g"),
        ("ART011", "Fortune Oil 1L"), ("ART012", "Britannia Bread"),
        ("ART013", "Real Juice 1L"), ("ART014", "Haldiram Namkeen 400g"),
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

    for store_id in STORE_IDS:
        base = random.uniform(55, 95)
        q1 = round(base + random.uniform(-5, 5), 1)
        q2 = round(base + random.uniform(-5, 5), 1)
        q3 = round(base + random.uniform(-5, 5), 1)
        q4 = round(base + random.uniform(-5, 5), 1)
        ws.append([
            store_id, STORE_CODES.get(store_id, store_id),
            STATUSES.get(store_id, "Operational"),
            q1, q2, q3, q4
        ])

    path = UPLOADS / "store_scores.xlsx"
    wb.save(path)
    print(f"  Created {path.name} ({ws.max_row - 1} rows)")
    return path


# --------------------------------------------------------------------------
# 5. Store_Master_dummy.xlsx  (3 sheets)
# --------------------------------------------------------------------------
OBSERVATIONS = [
    {"sr": 1, "obs": "GSTIN certificate not displayed at store", "risk": "Medium", "plan": "Display certificate at main entrance", "person": "Store Manager", "target": "2026-08-15", "status": "Open"},
    {"sr": 2, "obs": "Manual bills issued from store not regularized", "risk": "High", "plan": "Enter manual bills into POS same day", "person": "Cashier Lead", "target": "2026-07-31", "status": "In Progress"},
    {"sr": 3, "obs": "Defined merchandise layout not followed", "risk": "Low", "plan": "Re-arrange shelves per planogram", "person": "Visual Merchandiser", "target": "2026-08-10", "status": "Open"},
    {"sr": 4, "obs": "Delay in deposit of cash collected through sales", "risk": "High", "plan": "Enforce same-day deposit policy", "person": "Operations Manager", "target": "2026-07-25", "status": "Open"},
    {"sr": 5, "obs": "Fake note detector not available at billing counter", "risk": "Medium", "plan": "Procure and install UV detector", "person": "Admin", "target": "2026-08-01", "status": "Open"},
    {"sr": 6, "obs": "Fire safety certification pending renewal", "risk": "Critical", "plan": "Schedule inspection with fire dept", "person": "Safety Officer", "target": "2026-07-20", "status": "In Progress"},
    {"sr": 7, "obs": "Excess discount granted beyond approval limit", "risk": "Medium", "plan": "Review POS discount caps", "person": "Store Manager", "target": "2026-08-05", "status": "Open"},
    {"sr": 8, "obs": "Ineligible SKU accepted under returns", "risk": "Low", "plan": "Train staff on return policy", "person": "Customer Service Lead", "target": "2026-08-15", "status": "Resolved"},
    {"sr": 9, "obs": "Housekeeping schedule not adhered to", "risk": "Low", "plan": "Implement daily sign-off sheet", "person": "Housekeeping Supervisor", "target": "2026-07-30", "status": "Open"},
    {"sr": 10, "obs": "CCTV coverage gap in receiving bay", "risk": "High", "plan": "Install additional camera", "person": "IT/Security", "target": "2026-08-20", "status": "Open"},
    {"sr": 11, "obs": "Stock variance unresolved beyond timeline", "risk": "Medium", "plan": "Conduct cycle count and reconcile", "person": "Inventory Manager", "target": "2026-08-10", "status": "In Progress"},
    {"sr": 12, "obs": "Expired stock not segregated", "risk": "High", "plan": "Set up quarantine zone in backroom", "person": "Store Manager", "target": "2026-07-28", "status": "Open"},
    {"sr": 13, "obs": "Staff ID cards not issued to new hires", "risk": "Low", "plan": "Process ID card requests", "person": "HR", "target": "2026-08-05", "status": "Resolved"},
    {"sr": 14, "obs": "Attendance register mismatch", "risk": "Medium", "plan": "Reconcile biometric with manual log", "person": "HR", "target": "2026-08-01", "status": "Open"},
    {"sr": 15, "obs": "Scrap sale not matched with outward register", "risk": "Medium", "plan": "Update outward register weekly", "person": "Inventory Manager", "target": "2026-08-15", "status": "Open"},
]


def gen_store_master():
    wb = Workbook()

    # Sheet 1: Store Details
    ws1 = wb.active
    ws1.title = "Store Details"
    ws1.append([
        "Store ID", "Store code", "Name", "State", "City", "Region",
        "District", "Postal Address", "Deputy Manager",
        "Operation Manager", "StoreCatg_main", "Status"
    ])
    for s in STORES:
        ws1.append([
            s["id"], s["code"], s["name"], s["state"], s["city"],
            s["region"], s["district"], s["postal"], s["dm"],
            s["om"], s["catg"], s["status"]
        ])

    # Sheet 2: Store Scores
    ws2 = wb.create_sheet("Store Scores")
    ws2.append(["Store code", "Status", "Q1", "Q2", "Q3", "Q4"])
    for s in STORES:
        base = random.uniform(55, 95)
        ws2.append([
            s["code"], s["status"],
            round(base + random.uniform(-5, 5), 1),
            round(base + random.uniform(-5, 5), 1),
            round(base + random.uniform(-5, 5), 1),
            round(base + random.uniform(-5, 5), 1),
        ])

    # Sheet 3: Observation
    ws3 = wb.create_sheet("Observation")
    ws3.append([
        "Sr No", "Observation", "Risk", "Action Plan",
        "Person Responsible", "Target", "Status"
    ])
    for o in OBSERVATIONS:
        ws3.append([o["sr"], o["obs"], o["risk"], o["plan"],
                     o["person"], o["target"], o["status"]])

    path = UPLOADS / "Store_Master_dummy.xlsx"
    wb.save(path)
    print(f"  Created {path.name} (3 sheets)")
    return path


# --------------------------------------------------------------------------
# 6. Store_Audit_Checklist_v1_dummy.xlsx  (4 sheets)
# --------------------------------------------------------------------------
# The questions from the prototype, in the client's format
QUESTIONS = [
    # (Process, Sub-Process, Question, Type, Photo/Video, DA Enabled, DA_Reference, Weights, Annexure)
    ("Cashiering", "Cash sales & Recon", "Whether all cash physically available in the store (i.e. Till cash + Sales cash of previous day, if any + petty cash) match with the books?", "Store Visit", "Yes", "N", "", 5, ""),
    ("Cashiering", "Cash sales & Recon", "Whether Cash sales from Daily Sales Report agree with cash deposited and submitted to collection agency?", "Structured dataDA", "No", "Y", "DA_CashRecon_01", 4, ""),
    ("Cashiering", "Cash handover to collection agency", "Whether the Store team identifies collection agency's agent by Photo Identity Card?", "Store Visit", "Yes", "N", "", 3, ""),
    ("Cashiering", "Cash handover to collection agency", "Whether the photo & specimen signature of the collection agency agent matches with the list available in stores?", "Store Visit", "Yes", "N", "", 3, ""),
    ("Cashiering", "Cash handover to collection agency", "Whether the collection agency has affixed their SEAL as well as signature on the Pay In Slip?", "Structured dataDA", "No", "Y", "DA_CMS_01", 3, ""),
    ("Cashiering", "Cash handover to collection agency", "Whether fake note detectors are available at the store and being used?", "Store Visit", "Yes", "N", "", 3, ""),
    ("Cashiering", "Cash handover to collection agency", "Whether the store is not having any fake/soiled notes?", "Store Visit", "Yes", "N", "", 3, ""),
    ("Cashiering", "Debit/ Credit card sales", "Whether the credit card sales from daily sales report agree with the batch settlement report for EDC payments?", "Structured dataDA", "No", "Y", "DA_EDC_01", 4, ""),
    ("Cashiering", "Debit/ Credit card sales", "Whether charge slips of the previous days are stored in BLACK/BROWN envelopes along with batch closure report?", "Store Visit", "Yes", "N", "", 3, ""),
    ("Cashiering", "UPI Payments", "Whether the UPI sales from daily sales report agree with the bank summary?", "Structured dataDA", "No", "Y", "DA_UPI_01", 3, ""),
    ("Cashiering", "Credit Notes Issuance", "Whether no manual credit note is issued? All credit should be issued via POS.", "Unstructured data", "No", "N", "", 3, ""),
    ("Cashiering", "Credit Notes Issuance", "Whether any instance noted for Sales returns processed more than original billed quantity or amount?", "Structured dataDA", "No", "Y", "DA_Return_01", 4, ""),
    ("Cashiering", "Credit Notes Issuance", "Whether Sales returns processed for ineligible items or after specified days?", "Structured dataDA", "No", "Y", "DA_Return_02", 4, ""),
    ("Cashiering", "Credit Notes Issuance", "Whether the security prepares a receipt for goods to be taken inside the store?", "Store Visit", "Yes", "N", "", 2, ""),
    ("Cashiering", "Credit Notes Issuance", "Whether the number and count of SKUs as per the gate pass match with the entries in the Credit Note Register?", "Unstructured data", "No", "N", "", 3, ""),
    ("Cashiering", "Credit Notes Issuance", "Whether returns are accepted for eligible SKUs only?", "Structured dataDA", "No", "Y", "DA_Return_03", 3, ""),
    ("Cashiering", "Schemes and Promotions", "Check the time gap between scheme creation & scheme start date, schemes running beyond end dates.", "Unstructured data", "No", "N", "", 3, ""),
    ("Cashiering", "Schemes and Promotions", "Whether selling price available on POS match with active MRP maintained in the system?", "Structured dataDA", "No", "Y", "DA_MRP_01", 4, ""),
    ("Cashiering", "POS controls", "Does POS allows to mark any tickets marked as void post printing?", "Store Visit", "No", "N", "", 2, ""),
    ("Cashiering", "POS controls", "Does POS allows to provide discount in addition to the approved store manager discount limit?", "Store Visit", "No", "N", "", 3, ""),
    ("Cashiering", "POS controls", "Whether any store manager discounts are provided in addition to the approved limit?", "Structured dataDA", "No", "Y", "DA_Discount_01", 3, ""),
    ("HR & Admin and Operations", "Staff Onboarding", "Are new staff onboarded as per the approved joining process?", "Store Visit", "Yes", "N", "", 3, ""),
    ("HR & Admin and Operations", "Staff Onboarding", "Are employee personnel files complete and available?", "Store Visit", "Yes", "N", "", 2, ""),
    ("HR & Admin and Operations", "Staff Onboarding", "Whether all staff have valid ID cards or authenticated login credentials?", "Structured data / DA", "No", "Y", "DA_Staff_01", 3, ""),
    ("HR & Admin and Operations", "Staff Training & Monitoring", "Are staff trained on store SOPs, safety norms, and product knowledge?", "Store Visit", "Yes", "N", "", 3, ""),
    ("HR & Admin and Operations", "Staff Training & Monitoring", "Is there evidence of periodic refresher training conducted?", "Store Visit", "Yes", "N", "", 2, ""),
    ("HR & Admin and Operations", "Staff Training & Monitoring", "Whether training records are updated and maintained for all staff?", "Structured data / DA", "No", "Y", "DA_Training_01", 2, ""),
    ("HR & Admin and Operations", "Attendance Monitoring", "Is staff attendance recorded through the approved biometric device?", "Store Visit", "Yes", "N", "", 3, ""),
    ("HR & Admin and Operations", "Attendance Monitoring", "Is attendance matches with staff entry and exit register?", "Unstructured data", "No", "N", "", 3, ""),
    ("HR & Admin and Operations", "Attendance Monitoring", "Are deviations (late marks, absenteeism) monitored and escalated?", "Store Visit", "No", "N", "", 2, ""),
    ("HR & Admin and Operations", "Attendance Monitoring", "Whether shift rosters are prepared, approved, and adhered to?", "Structured data / DA", "No", "Y", "DA_Roster_01", 2, ""),
    ("HR & Admin and Operations", "Staff Etiquettes", "Are staff in proper uniform and wearing identification badges?", "Store Visit", "Yes", "N", "", 3, ""),
    ("HR & Admin and Operations", "Staff Etiquettes", "Are staff following customer-handling standards and communication norms?", "Store Visit", "Yes", "N", "", 3, ""),
    ("HR & Admin and Operations", "Staff Etiquettes", "Whether staff conduct aligns with expected behavioural guidelines?", "Unstructured data", "No", "N", "", 2, ""),
    ("HR & Admin and Operations", "Fixed Assets Tagging", "Are all fixed assets tagged with barcode/FA tags as per company norms?", "Unstructured data", "No", "N", "", 3, ""),
    ("HR & Admin and Operations", "Fixed Assets Tagging", "Is the asset register updated and reconciled with physical assets?", "Store Visit", "Yes", "N", "", 3, ""),
    ("HR & Admin and Operations", "Fixed Assets Tagging", "Whether there are any untagged, damaged, or missing assets?", "Unstructured data", "No", "N", "", 3, ""),
    ("HR & Admin and Operations", "Housekeeping & Hygiene", "Is the store floor, shelves, backroom, and trial rooms clean?", "Store Visit", "Yes", "N", "", 3, ""),
    ("HR & Admin and Operations", "Housekeeping & Hygiene", "Are washrooms clean, functional, and checked per schedule?", "Store Visit", "Yes", "N", "", 3, ""),
    ("HR & Admin and Operations", "Housekeeping & Hygiene", "Whether pest-control services are documented and up to date?", "Structured data / DA", "No", "Y", "DA_Pest_01", 2, ""),
    ("Inventory Management", "Goods Receiving & Inward Processing", "Does GRN quantity match with the PO quantity?", "Structured dataDA", "No", "Y", "DA_GRN_01", 4, ""),
    ("Inventory Management", "Goods Receiving & Inward Processing", "Does GRN quantity match with inward register maintained by SLP?", "Structured dataDA", "No", "Y", "DA_GRN_02", 3, ""),
    ("Inventory Management", "Goods Receiving & Inward Processing", "Does the store verify quantities received against the PO/dispatch note?", "Unstructured data", "No", "N", "", 3, ""),
    ("Inventory Management", "Goods Receiving & Inward Processing", "Are discrepancies recorded and reported on the same day?", "Store Visit", "Yes", "N", "", 3, ""),
    ("Inventory Management", "GRN & Inward Controls", "Whether all inward receipts are recorded in the system same day?", "Structured dataDA", "No", "Y", "DA_GRN_03", 4, ""),
    ("Inventory Management", "Storage & Stock Handling", "Are stocks stored as per planogram/bin locations?", "Store Visit", "Yes", "N", "", 3, ""),
    ("Inventory Management", "Storage & Stock Handling", "Are high-value SKUs stored under restricted access?", "Store Visit", "Yes", "N", "", 4, ""),
    ("Inventory Management", "Storage & Stock Handling", "Whether slow-moving items are periodically identified and escalated?", "Unstructured data", "No", "N", "", 3, ""),
    ("Inventory Management", "Stock Accuracy", "Are daily cycle counts performed and variances documented?", "Store Visit", "Yes", "N", "", 4, ""),
    ("Inventory Management", "Stock Accuracy", "Does the store reconcile physical vs system stock for high-variance SKUs?", "Store Visit", "Yes", "N", "", 4, ""),
    ("Inventory Management", "Stock Accuracy", "Whether stock adjustments are supported with proper approval?", "Unstructured data", "No", "N", "", 3, ""),
    ("Inventory Management", "Expiry & Damage Management", "Are nearing-expiry products segregated and actioned?", "Store Visit", "Yes", "N", "", 3, ""),
    ("Inventory Management", "Expiry & Damage Management", "Are damaged goods recorded and moved to quarantine?", "Store Visit", "Yes", "N", "", 3, ""),
    ("Inventory Management", "Expiry & Damage Management", "Whether all expired/damaged disposals are supported by documentation?", "Unstructured data", "No", "N", "", 3, ""),
    ("Inventory Management", "Inter-Store Transfers", "Are stock transfers initiated only against approved requests?", "Store Visit", "No", "N", "", 3, ""),
    ("Inventory Management", "Inter-Store Transfers", "Are dispatch and receipt of transferred stocks recorded same day?", "Store Visit", "No", "N", "", 3, ""),
    ("Inventory Management", "Inter-Store Transfers", "Whether all pending transfers have valid justification?", "Structured dataDA", "No", "Y", "DA_Transfer_01", 3, ""),
    ("Inventory Management", "Shrinkage Controls", "Does the store monitor abnormal stock losses?", "Unstructured data", "No", "N", "", 4, ""),
    ("Inventory Management", "Shrinkage Controls", "Are CCTV-mandated areas functioning during audit?", "Store Visit", "Yes", "N", "", 4, ""),
    ("Inventory Management", "Shrinkage Controls", "Whether shrinkage is within tolerance levels?", "Unstructured data", "No", "N", "", 3, ""),
    ("Inventory Management", "Replenishment", "Is shelf replenishment done per defined frequency?", "Store Visit", "No", "N", "", 2, ""),
    ("Inventory Management", "Replenishment", "Are out-of-stock SKUs reviewed and escalated daily?", "Unstructured data", "No", "N", "", 3, ""),
    ("Inventory Management", "Replenishment", "Whether auto-replenishment parameters are updated per policy?", "Structured dataDA", "No", "Y", "DA_Replen_01", 3, ""),
    ("Inventory Management", "Scrap Sales", "Are scrap sales approved as per defined matrix?", "Structured dataDA", "No", "Y", "DA_Scrap_01", 3, ""),
    ("Inventory Management", "Scrap Sales", "Scrap sales invoices match with outward register?", "Unstructured data", "No", "N", "", 3, ""),
    ("EHS & Compliance", "Permits, Licenses & Certifications Management", "Are all statutory licenses valid and displayed?", "Store Visit", "Yes", "N", "", 5, ""),
    ("EHS & Compliance", "Permits, Licenses & Certifications Management", "Is a register maintained with license numbers, issue/expiry dates?", "Unstructured data", "No", "N", "", 3, ""),
    ("EHS & Compliance", "Permits, Licenses & Certifications Management", "Whether any licenses are expired or due for renewal within 30 days?", "Unstructured data", "No", "N", "", 4, ""),
]


def gen_checklist():
    wb = Workbook()

    # Sheet 1: All Process Checklist
    ws1 = wb.active
    ws1.title = "All Process Checklist"
    ws1.append([
        "Process", "Sub-Process", "Question", "Type",
        "Photo/Video", "Data Analyst Enabled", "Data Analyst_Reference",
        "Weights", "Annexure"
    ])
    for q in QUESTIONS:
        ws1.append(list(q))

    # Sheet 2 ("1"): Cash Reconciliation — same as main file but with
    # client column names from seed_data.json
    ws2 = wb.create_sheet("1")
    ws2.append([
        "Store ID", "Cash at Tills", "Cash in Safe", "Any other place",
        "Physical Cash Total", "Cash Sales as per sales Report",
        "Float and Imprest allocated to the store as per Master",
        "Book Cash Total", "Difference (A-B)", "Remarks"
    ])
    for store_id in STORE_IDS:
        for _ in range(2):
            tills = round(random.uniform(15000, 85000), 2)
            safe = round(random.uniform(5000, 40000), 2)
            other = round(random.uniform(0, 5000), 2)
            physical = round(tills + safe + other, 2)
            sales = round(physical + random.uniform(-3000, 3000), 2)
            imprest = round(random.uniform(2000, 10000), 2)
            book = round(sales + imprest, 2)
            diff = round(physical - book, 2)
            ws2.append([
                store_id, tills, safe, other, physical,
                sales, imprest, book, diff,
                random.choice(["All OK", "Variance noted", "Reconciled"])
            ])

    # Sheet 3 ("2"): Cash Deposit Pickups — client column names
    ws3 = wb.create_sheet("2")
    ws3.append([
        "Store ID", "Sales Date (A)", "Cash Sales",
        "Cash Deposited (c)", "Difference (B-C)",
        "CMS Pick Up date (D)", "Delay in cash handover (A-D)", "Remarks"
    ])
    base_date = dt.date(2026, 7, 1)
    for store_id in STORE_IDS:
        for d in range(3):
            sd = base_date + dt.timedelta(days=d * 4 + random.randint(0, 2))
            cs = round(random.uniform(20000, 120000), 2)
            cd = round(cs - random.uniform(-500, 5000), 2)
            diff = round(cs - cd, 2)
            delay = random.choice([0, 1, 2, 3])
            pu = sd + dt.timedelta(days=delay)
            ws3.append([store_id, sd, cs, cd, diff, pu, delay,
                        random.choice(["On time", "Delayed", "OK"])])

    # Sheet 4 ("3"): Expired Inventory
    ws4 = wb.create_sheet("3")
    ws4.append([
        "Store ID", "Article Code", "Article Description",
        "Expiry Date", "Review Date", "Quantity", "MRP"
    ])
    articles = [
        ("ART001", "Tata Salt 1kg"), ("ART003", "Maggi Noodles Pack"),
        ("ART006", "Dairy Milk Silk 150g"), ("ART011", "Fortune Oil 1L"),
    ]
    for store_id in STORE_IDS:
        for code, desc in random.sample(articles, random.randint(1, 3)):
            exp = _rand_date(dt.date(2026, 6, 1), dt.date(2026, 9, 15))
            rev = exp + dt.timedelta(days=random.randint(1, 10))
            ws4.append([store_id, code, desc, exp, rev,
                        random.randint(1, 20), round(random.uniform(20, 500), 2)])

    path = UPLOADS / "Store_Audit_Checklist_v1_dummy.xlsx"
    wb.save(path)
    print(f"  Created {path.name} (4 sheets)")
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
    gen_store_master()
    gen_checklist()
    print("\nDone! Files ready in backend/uploads/")
