# TODO: Audit Manager workflows

Requirements for the Audit Manager role. *Italic notes* say what already exists in the app.
Tick items as they are done.

---

## Status (3 Nov 2026): backend done, views to do (Tanmay)

The backend, API client functions and data logic below are built and tested
(`backend/tests/test_audit_manager_workflows.py`). **No page or view was changed.**
Every screen in this list is for Tanmay to build on top of these endpoints.
The functions are in `frontend/src/api/client.js`, in the "Audit manager workflows" block.

### Built
| Area | Endpoint | `api.` function |
|---|---|---|
| Brand onboarding (code, legal name, category, contact, regions, status, notes) | `POST/PUT /api/brands`, `GET /api/brands/{id}` (with stores) | `createBrand`, `updateBrand`, `brand` |
| Format full forms and store type notes | `GET /api/stores/catalog` | `storeCatalog` |
| Store view (details, people, last and next audit, open issues) | `GET /api/stores/{id}` | `storeDetails` |
| Stores list shows `auditor_count` and `auditee_count` (manager and admin) | `GET /api/stores` | `stores` |
| Add or remove a store's auditor or auditee | `POST /api/stores/{id}/auditors` and `.../auditees`, `POST .../{uid}/remove` | `addStoreAuditor`, `addStoreAuditee`, `removeStoreAuditor`, `removeStoreAuditee` |
| Audit Manager adds, lists, edits and deactivates auditors and auditees | `GET /api/people`, `POST /api/people/auditors` and `/auditees`, `PATCH /api/people/{id}` | `people`, `createAuditor`, `createAuditee`, `updatePerson` |
| Scheduling suggestions (store's auditors first, warnings) | `GET /api/audits/suggestions?store_id=` | `schedulingSuggestions` |
| "Also assign this auditor to the store" | `assign_to_store: true` on `POST /api/audits` | `scheduleAudit` |
| Newest scheduled audit first | `GET /api/audits` order, and `auditRows()` sort | – |
| Reassign or remove the auditor (planned, ongoing or changes requested) | `POST /api/audits/{id}/reassign` | `reassignAudit` |
| Query a question with a category, notifying auditor and auditees | `POST /api/audits/{id}/responses/{rid}/review` (`category`) | `reviewResponse` |
| Return for changes, fix only queried questions, resubmit | `POST /api/audits/{id}/request-changes`, then the existing answer and submit calls | `requestChanges` |
| Reject a question with a required reason, notifying the proposer | `POST /api/questions/{id}/approve` (`reason`) | `approveQuestion`, `questionsApi.approve` |
| Approve or deny an action taken (deny needs a reason, evidence optional) | `POST /api/issues/{id}/decision` | `decideIssue` |
| Reassign an issue to another auditee notifies them | `PUT /api/issues/{id}` (`assignee_id`) | `updateIssue` |
| Notifications: assigned, reassigned, removed, store link, changes requested, resubmitted, approved, cancelled, issue raised or decided, question decided | in the bell via `/api/notifications` | – |
| New audit status `Changes Requested` (counted as in progress) | `lib/statuses.js` | – |
| Migration 0011: brand fields, `users.phone`, `audit_responses.review_category` | runs on start | – |

### Open questions: what the backend assumes (change if the answer differs)
1. Brand fields: code, legal name, category, contact name/email/phone, regions, status (Active/Inactive), notes. No logo yet.
2. Who adds users: the **Audit Manager can add auditors and auditees** (`/api/people`); every other role stays Admin-only.
3. Reassigning keeps the answers already given.
4. Only the auditor changes answers on a change request; the auditee is notified only.
5. A store can have **more than one auditor**; with exactly one, scheduling suggests them.
6. Removing an auditor from a store moves or unassigns their **planned** audits there; **ongoing** ones stay theirs.
7. An auditee can cover stores of different brands.
8. The manager picks who takes the open issues (`move_issues_to` / `hand_over_to`); nothing moves automatically.
9. No limit on denials.

### Views for Tanmay
- [ ] Store Management: Add Brand / Add Store entry point, brand onboarding form, and "Add a store to this brand?" after saving
- [ ] Add Store form: format dropdown with full forms and a note, store type note (from `storeCatalog`), next steps after saving (`next_steps`)
- [ ] Store details view with a People section (add, remove, create new), plus confirm dialogs that use the 409 counts the API returns
- [ ] Store list: auditor and auditee columns, and "Stores without an auditor / auditee"
- [ ] Add Auditor / Add Auditee forms (`createAuditor` / `createAuditee`), and deactivate with hand-over
- [ ] Schedule form: use `schedulingSuggestions` (fill in, store's auditors first, warnings, + Add auditor), an "Also assign to store" checkbox, and a confirmation toast
- [ ] Highlight newly added audits in the Audit list (the order is already newest first)
- [ ] Reassign / Remove auditor buttons and dialog (row, drawer, review page)
- [ ] Pending Approval list page, category picker on query, Return for changes button, Changes Requested badge
- [ ] Auditor side: open a `Changes Requested` audit with only the queried questions editable, then resubmit. *`isAuditorEditable` does not include it yet; add it when the wizard handles it.*
- [ ] Questions: confirm before saving edits, and a **reason box when rejecting**. *The current Reject button now gets "say why the question is rejected" until this is added.*
- [ ] Action Taken Tracking: Approve / Deny buttons, deny reason and evidence upload, and decisions history (`meta.decisions`)

---

## Workflow 1: Onboard a brand → store → people → schedule → review

### 1. Add a brand (Store Management)
- [ ] Put an **"Add Brand / Add Store"** entry point at the top of Store Management, with a choice between:
  - add a store to an **existing brand**
  - **+ Add new brand**
- [ ] Expand the brand form. *Today the "New Brand" pop-up asks only for a name.* Fields to decide (see open question 1):
  - name and code, legal name, category
  - contact person, email, phone
  - regions where it operates
  - default checklists or SOP tools
  - logo, start date, status
- [ ] After a brand is saved, prompt **"Add a store to this brand?"**, which opens Add Store with the brand already filled in.

### 2. Add a store
- [ ] Brand is required and picked from the existing brands.
- [ ] Show each format's **full form** in the dropdown. *The full forms already exist in `FormatLegend.jsx`, but only behind an (i) button:*
  - COCO – Company Owned, Company Operated
  - COFO – Company Owned, Franchise Operated
  - FOCO – Franchise Owned, Company Operated
  - FOFO – Franchise Owned, Franchise Operated
- [ ] Show a one-line note under the selected format.
- [ ] Add a short info note on the **store type**: Hypermarket, Supermarket, Express, Mall store, with what each means and its typical size.
- [ ] After a store is saved, offer next steps: **Assign auditor**, **Add auditee**, **Schedule audit**.

### 3. Store details view
- [ ] Clicking a store opens a basic view with:
  - brand, format (full form), type, region, city, address, status (Active / Dehired)
  - last audit date and score, next scheduled audit, open issues count
- [ ] Quick actions: Edit, Schedule audit, Manage people.

### 4. Manage a store's people (auditors and auditees)
- [ ] Add a **People** section in the store view with two lists:
  - **Auditor(s)**
  - **Auditee(s)**, each with name, designation, contact and open issues
- [ ] **+ Add:** pick an existing person, or **+ Create new** (the short form in item 5).
- [ ] **Remove:** unlinks the person from this store only; their account stays active. Confirm first:
  - **Auditor:** "Scheduled audits here: N." Then offer **Reassign** or **Leave unassigned**.
  - **Auditee:** "Open issues: N." Then offer **Move issues to another auditee** first.
- [ ] Show auditor and auditee columns or counts in the Store Management list.
- [ ] Add a filter or tile for **"Stores without an auditor"** and **"Stores without an auditee"**.

### 5. Add an auditor or auditee (new users)
- [ ] **Auditor form:** name, email or login, phone, region.
- [ ] **Auditee form:**
  - name, email or login, phone, designation
  - **linked store(s)**, required, with brand shown automatically
- [ ] An auditee can cover several stores, and a store can have several auditees.
- [ ] Entry points:
  - the store's People section
  - after a store is saved
  - the auditor field when scheduling
  - audit review, when the store has no auditee
- [ ] Send a welcome or login notification. For an auditee, include the stores they cover.
- [ ] Deactivate, with a confirmation and a warning about open audits or issues, and an offer to reassign them.
- [ ] **Open question 2:** who can add users? *Today only Admin can (`backend/app/routers/admin.py`).*

### 6. Schedule an audit
- [ ] Schedule from the store, or from Audit → **+ Schedule Audit**.
- [ ] **Auditor field**, after a store is picked:
  - **The store has one auditor:** fill it in automatically, labelled "Assigned auditor for this store". It can still be changed.
  - **The store has several auditors:** list them first under "This store's auditors", with everyone else below.
  - **The store has none:** show "No auditor assigned", then let the manager pick any auditor or **+ Add auditor** inline.
  - Offer **"Also assign this auditor to the store"**.
- [ ] **Auditee:** show who will be notified. If the store has none, warn and offer **+ Add auditee**.
- [ ] Keep the existing auditor clash check.
- [ ] Show a confirmation after saving ("AUD-xxxx scheduled for <store> on <date>").
- [ ] Show **newly added audits at the top** of the Audit list, newest first, and highlight new rows briefly.

### 7. Reassign or remove an auditor on an audit
- [ ] Add **Reassign auditor** on scheduled and in-progress audits, in the row actions, the detail drawer and the review page. *Not built yet: only edit and cancel exist today.* The store's auditors are listed first.
- [ ] Add **Remove auditor**, which leaves the audit Unassigned.
- [ ] Ask for an optional reason and notify both the old and the new auditor.
- [ ] Record each reassignment or removal in the Audit Log.

### 8. New page: audit review, approval and change requests
*The base already exists in `AuditApproval.jsx` (`/audits/:id/approve`), with an Approve button per question.*
- [ ] Build a **Pending Approval** list page showing every submitted audit waiting for review.
- [ ] Per question: **Approve** or **Request change**. A change request needs:
  - **what is wrong** (required)
  - an optional category (wrong answer, missing evidence, unclear photo)
- [ ] Audit-level actions: **Approve audit**, **Return for changes**, **Reassign**.
- [ ] On a change request, **notify both the auditor and the auditee**, with the comment and a link. If the store has no auditee, warn and offer to add one.
- [ ] The auditor sees **"Changes requested"**, fixes only the flagged questions and resubmits. The manager then re-reviews only those questions.
- [ ] Workflow 1 is complete when the audit is **Approved**.

---

## Workflow 2: Manage audit questions
- [ ] The Audit Manager can **add** and **edit** questions.
- [ ] Show a **confirmation before saving**: "Save changes to N questions? A new version is created; past audits keep the old one." *Today a confirm appears only on delete.*
- [ ] Keep version history. *It exists already for SOP tools.*
- [ ] Question approval exists already (Approve / Reject). Make a reason **required** when a question is rejected.

---

## Workflow 3: Action Taken Tracking
- [ ] Issues go to the store's auditee by default. The manager can **reassign an issue** to another auditee of the same store.
- [ ] The manager reviews the auditee's action taken and chooses **Approve** or **Deny**. The original question and answer can't be edited.
- [ ] Deny needs a **reason** (required) and optional **evidence** (photo or file).
- [ ] Show the full history on each issue:
  - the action taken and its evidence
  - each approve or deny, with reason, evidence, who and when
- [ ] On deny, notify the auditee and the issue goes back to **Open**. On approve, it becomes **Closed**.

---

## Workflow 4: Store manager adds auditees to their own store
- [ ] The store manager gets a **People** section for their own store only: the auditees (editable) and the auditors (read-only).
- [ ] The store manager can **add an auditee to their store**: pick an existing auditee, or **+ Create new** (name, login, phone, designation).
- [ ] The store manager must **define the auditee type** when adding one (see open questions 10 and 11).
- [ ] The new auditee is linked to **that store only**; the store manager cannot link them to other stores or brands.
- [ ] The store manager can **change the type** of the auditees in their store.
- [ ] The auditee gets a welcome notification that names the store and their type.
- [ ] The Audit Manager is notified when a store manager adds an auditee, and the Audit Log records who added them.
- [ ] **Removing** an auditee stays with the Audit Manager, because their open issues must be handed over first.
- [ ] *Today only the Audit Manager and Admin can add people, and an auditee has no "type" field, so this needs a new field and a defined list of types.*

---

## Cross-cutting
- [ ] Bell notifications (email later) for:
  - assigned, reassigned, removed
  - added to or removed from a store
  - change requested, audit approved
  - issue denied or approved
- [ ] Log every action in the Audit Log (who, what, when).
- [ ] Ask for confirmation on every destructive action: remove a person, cancel an audit, deny, save questions, deactivate.
- [ ] Prompt the next step after each one: Brand → Store → People → Schedule → Review.

---

## Open questions
- [ ] 1. What fields does a new brand need?
- [ ] 2. Who can add users: Admin only, or the Audit Manager for auditors and auditees (recommended), or by request with Admin approving?
- [ ] 3. On reassignment, do the previous auditor's answers stay?
- [ ] 4. On a change request, can the auditee respond, or only the auditor?
- [ ] 5. Can a store have **more than one auditor**, or exactly one?
- [ ] 6. If an auditor is removed from a store, do their **in-progress** audits there continue, or get stopped and reassigned?
- [ ] 7. Can an auditee cover stores of **different brands**?
- [ ] 8. When an auditee is deactivated, do their open issues **move automatically** to another auditee, or does the manager pick?
- [ ] 9. Should a denied issue have a limit on resubmissions, or escalate after N denials?
- [ ] 10. What are the auditee types: a fixed list the Audit Manager maintains (for example by area: cash, inventory, merchandising, HR), or free text the store manager types?
- [ ] 11. Is the type stored on the person, or on the person-to-store link (so someone covering two stores can have a different type in each)? Recommended: on the link.
