# TODO: Audit Manager workflows

Requirements for the Audit Manager role. *Italic notes* say what already exists in the app.
Tick items as they are done.

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
