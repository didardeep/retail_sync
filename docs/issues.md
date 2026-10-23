# Known Issues

## 1. Checklist has no question that captures store format (COCO / COFO / FOCO / FOFO)

**Status:** Closed. Store format stays master data only (decision); no checklist question, no code change.

**What:** The dashboard has a "Store Format Performance" graph that groups
average audit scores by store format (COCO, COFO, FOCO, FOFO). No checklist
question asks for the store format, so audits do not record it.

**Where it comes from today:**
- Store format is store master data only (`Store.store_format`,
  `backend/app/models.py`), loaded from the Excel / seed import.
- It is used for grouping and filtering (dashboard graph, stores list,
  assistant lookups) and in checklist assignment conditions
  (`{"format": ["COCO"]}`), which decide which checklist a store gets.

**Gap:** A checklist can be assigned by format, but nothing in the audit itself
captures or confirms it. If the master data is wrong or missing for a store, the
audit cannot catch it and the graph groups that store under the wrong format
(or "Other").

**Open question:** Should a checklist question confirm the store format at audit
time, or is master data the single source of truth?

**Scope checked:** Application code and seed data. Checklists created through
the UI were not inspected.

## 2. "Average store score by quarter" chart is not useful: one chain-wide line

**Status:** Done. Trend is one line per brand with brand chips and a store list to show or hide lines; it reads the same quarterly store scores as the other charts (the KPI tiles count audits and are labelled so).

**What:** The Overview dashboard trend chart (`frontend/src/pages/Dashboard.jsx`)
plots a single line: the average of every store's score for Q1 to Q4. A single
chain-wide average hides which brands are improving or slipping, so it tells the
reader very little.

**Proposed change:**
- Turn it into a multi-line chart with one line per brand. Each point is that
  brand's average store score for the quarter (Q1 to Q4), not the whole chain.
- Add a way to select specific brands, and specific stores, to show or hide
  lines.
- Keep the selection linked to the other dashboard tables and charts (store
  bars, format chart, score distribution, top/bottom 5, region donut), so
  picking a brand or store filters them too and a number always matches its
  list.

**Blocker found:** there is no brand field in the data. A search of the backend
(`backend/app`) and `seed_data.json` finds no "brand" column on `Store` or
anywhere else. Brand must be added to the store master data (model, migration,
Excel import, seed data) before this chart can group by it.

**Open questions:**
- What is a "brand" here: a banner / store chain name, or something else?
- Does each store belong to exactly one brand?
- Should the selector also drive the existing Q1 to Q4 buttons and the store
  picker in the header, or replace the picker?

## 3. Data hierarchy and roles: Brand -> Store, plus a new Auditee role

**Status:** Done. Brand model, Store.brand_id, brand CRUD, brand column in Excel import/upload, Auditee role with store links, admin UI and seed data (migration 0007). Store managers keep Store.manager_id.
depends on this.

**Target hierarchy:**
- **Brand** is the parent. A brand has many stores.
- **Store** is the child of a brand. Location (state, city, region, district,
  address) and the other store details live on the store.
- **Store managers** are associated with stores (not brands).

**Target permissions:**
- **Audit managers** can create brands and add stores to brands. Today they can
  create and edit stores (`backend/app/routers/stores.py`, create/update
  restricted to AUDIT_MANAGER and ADMIN) but there is no brand to add them to.
- **Audit managers** can schedule audits and assign them to auditors.

**New role: Auditee**
- Auditees are people who get assigned open issues, and then answer the
  questions on them.
- Current state: roles are ADMIN, AUDIT_MANAGER, AUDITOR and STORE_MANAGER
  (`backend/app/models.py`). Issues already have an `assignee_id` pointing to a
  user, but there is no Auditee role and no flow where an assignee answers
  questions on an issue.

**Changes this implies (to be scoped):**
- New `Brand` model; `Store.brand_id` foreign key; migration; update the Excel
  import (`import_master.py`, uploads), seed data and the stores API/schemas.
- Brand CRUD and "add store to brand" for audit managers and admin.
- New `ROLE_AUDITEE` in models, auth/role checks, sidebar and route guards.
- Issue flow for auditees: see only the issues assigned to them, answer the
  questions, status updates back to the audit manager.
- Dashboard: brand and store selectors drive all charts and tables (see
  issue 2).

**Open questions:**
- Can a store belong to more than one brand, or exactly one?
- Do store managers manage one store or several? Do they see brand-level data?
- What happens to existing stores with no brand during migration?
- What are the "questions" an auditee answers: the original checklist question
  that raised the issue, or new follow-up questions on the issue?
- Can an auditee see anything beyond their assigned issues (store, audit)?
- Who can assign an issue to an auditee: audit managers only, or auditors too?

## 4. Dashboard UI: one basic outline, wording that follows what is selected

**Status:** Done. One heading naming the scope, a labelled selector, one shared wording set, scope filters every chart, ranked lists fixed. Quarter buttons stay in the header and apply to everything.

**Problems today:**
- The page title is the same fixed text ("Audit Operations") whatever is shown,
  with a small grey subtitle ("Consolidated View - Q4"). It does not say what
  you are looking at.
- The store selector is nearly invisible. It is a plain `<select>` in the
  header row (`frontend/src/components/StorePicker.jsx`) with the same styling
  as a text field, sitting beside the quarter buttons, so it does not read as
  the main control. Its label is just "Store" and its first option "All stores".
- Chart and card wording is confusing and differs between the two views
  (chain-wide Overview in `Dashboard.jsx` vs one store in
  `components/store-dashboard/StoreView.jsx`). For example "Average store score
  by quarter" vs "Score trend", "All Observations by Risk" vs "Issues by
  priority", and "Repeat Observations" holds the first five issue titles.

**Proposed change:**
1. **One basic outline** for the dashboard: a heading row, then the same
   sections in the same places. The details inside each section are dynamic,
   based on the page and the item selected.
2. **Bold heading at the top** (medium size, not a big page title) that names
   what is being viewed, e.g. "All brands, all stores" or
   "Phoenix Mall - Mumbai, West India". Once brands exist (issue 3) it follows
   the selection: all brands, one brand, or one store.
3. **A clearly visible selector** next to the heading: a labelled dropdown with
   a border, icon and the current selection shown, big enough to notice. It
   should list brands and stores (see issue 2 and issue 3).
4. **Graph and card wording changes with the scope** (all stores vs one store).
   Titles should say what the numbers are, over what, and for which scope.

**Wording to decide (first draft, to be confirmed):**

| Section | All stores | One store |
|---|---|---|
| Trend line | Average audit score by quarter, per brand | Audit score by quarter |
| Store bars | Top stores by audit score, selected quarter | (hide, or compare with brand average) |
| Format chart | Average audit score by store format | (hide, show this store's format) |
| Score distribution | Stores by score range | (hide) |
| Risk donut | Observations by risk level, all stores | Observations by risk level, this store |
| Region donut | Audits by region | (hide) |
| Top/Bottom 5 | Highest and lowest scoring stores | (hide) |
| Observations list | Most common observations | Most recent observations |
| Repeat list | Issues raised more than once | Issues raised more than once at this store |
| Issues list | Recent issues, all stores | Open issues at this store |

**Open questions:**
- Which sections are shown for a single store, and which are hidden?
- Should the quarter buttons stay in the header, and apply to everything?
- Should the "Top 5 Observations" and "Top 5 Repeat" lists actually rank by
  frequency / repetition? Today they do not (see the dashboard data review).
- Should the heading and selector be shared by the Overview, SOP and store
  views so all three feel like one page?

## 5. Remove SOP audits: only checklist-question audits

**Status:** Done. SOP code, tables and the issue SOP columns are removed (migration 0006); the dev DB was rebuilt.

**What:** The product only needs audits made of checklist questions. SOP audits
(a separate audit type with its own import, versions, scheduling, dashboard and
pages) are not needed.

**Where SOP lives today (to be scoped for removal):**
- Backend: `backend/import_sop.py`, `backend/seed_sop_demo.py`,
  `backend/app/sop_versions.py`, SOP models in `backend/app/models.py`, SOP
  fields in `schemas.py`, `services/`, and `assistant_service.py`.
- Migrations `0002_link_issues_to_sop_audits` and `0003_sop_audit_scheduling`
  tie issues and scheduling to SOP audits. Removing SOP needs a new migration,
  not edits to old ones.
- Frontend: `api/sopAdmin.js`, `api/sopDashboard.js`, `components/checklist/SopToolCard.jsx`,
  `components/audit/AuditTypeChip.jsx`, SOP routes in `App.jsx`, links in
  `lib/links.js`, SOP tab on the dashboard, SOP counts in `AuditorDashboard.jsx`.

**Open questions:**
- Is there existing SOP audit data to keep or archive, or can it be dropped?
- Issues currently link to SOP audits: should they link only to checklist audits
  afterwards?
- Does the dashboard "SOP" view go away entirely (see issue 4)?

## 6. Remove the "Partial" answer from the audit view

**Status:** Done. Answers are Yes / No / NA only; old audit data deleted in migration 0006 and the dev DB reseeded.

**What:** Checklist questions are answered Yes / Partial / No / NA. Partial is
to be removed, leaving Yes / No / NA.

**Where it appears:** `frontend/src/lib/classicAudit.js` (answer list and score
value `Partial: 0.5`), `components/classic/AnswerButtons.jsx`,
`pages/AuditExecution.jsx`, `pages/Audit.jsx` (row colour), plus any backend
scoring or validation that accepts "Partial".

**Decided:** delete the existing audit data (it holds Partial answers) and
rebuild it properly with Yes / No / NA only. No conversion of old answers, no
legacy handling of Partial left in the code. Seed and demo data generators
(`backend/seed.py`, `backend/demo.py`, `generate_excel.py`) must be updated to
produce Yes / No / NA only, so the rebuilt data is clean.

**Open questions:**
- Do checklist templates or the Excel import contain Partial-only logic?
- Delete only audits and answers, or also issues linked to them?

## 8. Remove Compliance Metrics; keep checklist-entity and Power BI modal

**Status:** Done. The Compliance Metrics page, route, nav entry, API calls and its three list endpoints are removed; the cash/expiry data tables stay (assistant uses them).

**What:** From the list of features added beyond the approved demo:
- **Remove:** Compliance Metrics.
- **Keep:** the checklist-entity feature and the Power BI sample modal.

Also kept (see `docs/demo-gap-and-personas.md`): AI assistant, audit approval,
offline auditor wizard, checklist question approval, NA answer.

**Open questions:**
- Where does Compliance Metrics live (page, route, API, dashboard widget)? To be
  scoped before removal.

## 7. Assign a failed question to an auditee of that store

**Status:** Done. The auditor raises an issue per question (not automatic) and picks an auditee linked to the store; the auditee replies in text and sets the status. Evidence upload for issues is not built (no upload mechanism exists, only an evidence link on the audit answer).
store association).

**What:** When an audit question gets a bad result, it should be assignable to
one of the auditees associated with that store, who then follows it up. Typical
triggers:
- the answer is "No"
- a collection / cash figure is short
- a cost-control check fails

**Gap today:** Issues have an `assignee_id`, but assignment is to any user and
is not tied to a store. There is no list of "auditees for this store" to pick
from, and no rule that turns these answers into assignable items.

**Proposed change:**
- Link auditees to stores (many auditees per store).
- On a failing question, offer an assign action limited to that store's auditees.
- Assigned items appear in the auditee's own list (issue 3) with the question,
  the answer given and the audit it came from.

**Open questions:**
- DECIDED: the issue is not created automatically. The auditor chooses, per
  question, whether it needs an issue and who to assign it to.
- How do "collection short" and "cost control" get detected: a question type
  with a numeric expected-vs-actual value, a flag on the checklist question, or
  a manual call by the auditor?
- Can one question be assigned to more than one auditee?
- Who can assign: the auditor during the audit, the audit manager afterwards, or both?
- What does the auditee do to close it: free-text reply, evidence upload,
  both? Who confirms it is closed?

## 9. Offline mode for checklist audits was lost with the SOP removal

**Status:** Open

**What:** The offline sync / IndexedDB layer was built only for SOP audits and
was deleted with them (issue 5). The checklist audit wizard is online-only now.
The offline auditor wizard was a "keep" decision, so offline support has to be
rebuilt for checklist audits (save answers locally, sync when back online, show
sync state). The `idb` npm dependency is currently unused.

**Open questions:**
- What must work offline: answering questions only, or also photos/evidence?
- Conflict rule if the same audit changed on the server while offline?
