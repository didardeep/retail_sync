# Retail Sync — Store Audit & Analysis

A Python (Flask) + React implementation of the store audit prototype, with the
three roles frozen and enforced server-side.

The prototype kept all its data in a JavaScript object. This replaces that with
a real database and API while keeping the same screens and visual language.

---

## Roles

| Role | Sees | Can do |
|---|---|---|
| **Audit Manager** | Everything — the full application | Manage stores, question bank and checklists; schedule audits; approve auditor-proposed questions; approve audit scores; track all actions |
| **Auditor** | Only audits assigned to them | Answer checklist questions, add remarks, risk and evidence, submit the audit, propose new questions (which go to the AM for approval) |
| **Store Manager** | Only actions raised against their store | Record the action taken, attach evidence, move the action to Closed |

Access is enforced in `backend/app/auth.py` via the `roles_required` decorator
and repeated in every query filter. The frontend only hides navigation — it is
not the security boundary.

---

## Running it

**Backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python seed.py --reset          # creates the DB and loads placeholder data
python run.py                   # http://127.0.0.1:5000
```

SQLite by default. For Postgres, set `DATABASE_URL` before running:

```bash
export DATABASE_URL="postgresql+psycopg2://user:pass@localhost:5432/retail_sync"
```

**Frontend**

```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

Vite proxies `/api` to the Flask server, so no CORS configuration is needed in
development.

**Seeded logins** — password `password123`

- `am@retail-chain.com` — Audit Manager
- `aud.j.patel@retail-chain.com` — Auditor
- `sm.a.sharma@retail-chain.com` — Store Manager

Every auditor and store manager in the prototype data has an account; the email
pattern is `aud.<name>@` and `sm.<name>@`.

---

## About the data

There is no client data yet, so `seed.py` loads the prototype's own records —
10 stores, 68 questions across 4 processes, 10 audits, 11 issues. Treat it as
placeholder. When the business team sends the master files, replace
`load_seed()` with an Excel/CSV import; nothing else needs to change.

The schema is deliberately forgiving about the parts that aren't frozen yet.
Stores, questions, responses and issues each carry a JSON `meta` column, so
client-specific attributes (extra tags, historic scores, custom fields) land
there rather than forcing a migration every time a new attribute appears.

**Still needed from the business team:** store master, user master with roles,
the audit question bank with weights and criticality, checklist definitions and
their applicability conditions, scoring bands and risk criteria, the quarterly
audit plan, auditor leave calendar, and file storage limits for evidence.

---

## How the workflow is wired

**Scoring** (`backend/app/services.py`) is weighted: Yes scores the full
weight, Partial scores half, No scores zero, and NA is excluded from both the
numerator and denominator so a store isn't penalised for a question that
doesn't apply. The Audit Manager can override the computed score at approval.

**Auto-raised actions** — when an auditor submits an audit, every critical
question answered No becomes an issue assigned to that store's manager with a
7-day due date.

**Question versioning** — editing a question doesn't overwrite it. The existing
row is marked `is_current = False` and a new row is created with `version + 1`,
so a completed audit always shows the wording that was actually asked.

**Checklists** are versioned the same way and carry a `conditions` JSON blob
(store format, region, audit type) for applicability rules.

**Scheduling** refuses an assignment if the auditor has an availability block
covering that date, or is already booked for another audit that day. Both come
back as HTTP 409 with a reason.

---

## Layout

```
backend/
  app/
    db.py          engine and session
    models.py      SQLAlchemy models
    auth.py        JWT, password hashing, role guards
    services.py    scoring and issue-raising logic
    routes.py      the API
  seed.py          placeholder data loader
  seed_data.json   extracted from the prototype
  run.py

frontend/
  src/
    api/client.js  fetch wrapper and session handling
    components/    Layout, useApi, small shared bits
    pages/         one file per screen
    App.jsx        role-based routing
    styles.css     design tokens carried over from the prototype
```

---

## Not built yet

The AI chatbot, email module, file upload to object storage (evidence is
currently a URL field), and Excel import of the question bank. These are on the
project plan; the API is shaped to accept them without restructuring.
