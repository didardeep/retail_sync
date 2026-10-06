# Page guide: every tab of the website

What each page is for, what you do on it, a use case, who uses it, and what is real versus sample.
Written 6 Oct 2026 from reading the code, plus a live check as the admin (section 1).
Items marked **[verified]** were also confirmed by running the app.

---

## 1. The admin account

| | |
|---|---|
| Login | `admin@retail-chain.com` |
| Password | the shared demo password (printed by `python backend/demo.py prepare`; it is `DEFAULT_PASSWORD` in `backend/seed.py`) |
| Role | ADMIN. Not listed in the login page's demo box, so type it in |

**[verified]** Signed in as the admin and opened all 14 sidebar pages: every one loaded with content and none of
its data requests was refused. The admin sees every page the Audit Manager sees, plus **User Management**, which
only the admin can really use. The admin cannot fill in audits (that is the auditor's job).

| Role | Pages in the sidebar |
|------|----------------------|
| ADMIN | all 14 |
| AUDIT_MANAGER | all 14 (but User Management shows an error: the server allows the admin only) |
| AUDITOR | SOP Audits, Audit Status, Audit Questions (question bank only), Email |
| STORE_MANAGER | My Store, Audit Checklist, Compliance Metrics, Action Taken Tracking, Audit Status, SOP Audits, Email |

Two kinds of audit exist side by side:

| | Classic checklist audit | SOP audit |
|---|---|---|
| Ids | AUD-1000 | SOP-xxxxxxxx |
| Questions | Yes / No / Partial / NA from a question bank | Marks per question with Best / Average / Least descriptions |
| Score | Weighted percentage | Typed score per question, sum over applicable marks |
| Proof | Remarks, risk level, evidence link | Comment and photos, required per question |
| Offline | No | Yes, saved on the phone first |
| Follow-up | A "No" on a critical question raises an issue | Nothing raised yet |
| Who fills it in | Intended: auditor (no screen for it today) | Auditor on the phone |

---

## 2. Pages at a glance

| Page (route) | For | Main users | Data |
|---|---|---|---|
| Dashboard and Analytics (`/dashboard`) | Management summary; SOP tab for deep analysis | Admin, Audit Manager | Overview partly sample; SOP tab real |
| SOP Audits (`/sop-audits`) | Auditor's launchpad; manager's list of finished SOP audits | Auditor (also all roles to read) | Real |
| SOP audit wizard / review (`/sop-audits/:id`) | Do the audit; check and submit; read the report | Auditor; everyone reads | Real |
| Audit Status (`/audits`) | One list of all audits, both kinds | All roles | Real |
| Audit Scheduling (`/scheduling`) | Plan and assign audits | Admin, Audit Manager | Real |
| Audit Questions (`/questions`) | Question bank; SOP tool editor | Admin, Audit Manager (auditor: bank only) | Bank edits mostly not saved; SOP tools real |
| Store Audit Scores (`/scores`) | Quarterly store scores | Admin, Audit Manager | Real |
| Action Taken Tracking (`/issues`) | Issues from audits through to resolution | Admin, Audit Manager, Store Manager | Reads real; most edits not saved |
| Store Management (`/stores`) | Store master list | Admin, Audit Manager | Reads real; add/delete not saved |
| My Store (`/my-store`) | A store manager's own store | Store Manager | Real |
| Audit Checklist (`/checklist`) | Read-only list of what stores are audited on | Store Manager | Real |
| Compliance Metrics (`/compliance`) | Cash and expiry records | Store Manager | Real data, but display is broken |
| Email Communications (`/email`) | Mailbox | nobody yet | All sample |
| Audit Log (`/audit-log`) | Who did what | Admin, Audit Manager | Real |
| User Management (`/user-management`) | Create and manage accounts | Admin only | Real |
| Login (`/login`) | Sign in | Everyone | Real |

---

## 3. Insights

### Dashboard and Analytics (`/dashboard`)
Two tabs.
- **Purpose.** Overview: a summary of audits, store scores and issues. SOP Audits tab: where are we weak, which stores are overdue.
- **Do.** *Overview:* click Q1-Q4 to change the quarter; click Planned/Ongoing/Completed tiles to open Audit Status filtered; click donut slices (risk, region, score bands) for a side list; click a store bar or Top/Bottom row to open its scorecard; "Power BI" button opens a pop-up.
  *SOP tab:* tool chips, region, search; click a store in the ranking or coverage panel, a section in "Gap by section", a bar in "Where marks are lost" to filter everything; filter chips with "Clear all"; Refresh; Export CSV; click a table row to open the report. Filters live in the web address.
- **See.** SOP tab: Audits submitted, Average score (target 80%), Stores below 70%, change vs last audit; store ranking; gap by section; top 10 questions losing marks; coverage (stores not audited for 30+ days); monthly trend; audits table.
- **Data.** SOP tab: all real, from one request. Overview: store scores, issues, observations are real but come from the older audit tables, not SOP audits. **Sample/fake on Overview:** the "Performance Trends" line is invented from the current average; the Power BI pop-up is a hard-coded mock-up with controls that do nothing; "Recent Communications" is always empty; "Top 5 Repeat" is just the first five issue titles; if the database is empty it silently shows sample numbers.
- **Who.** Admin and Audit Manager.
- **Use case.** Monday: the audit manager checks the SOP tab, sees Pacific Hub unaudited for 62 days, clicks it, then schedules a visit.
- **Limits.** The two tabs use different data and scoring, so numbers will not match. Overview tiles count only classic audits. Do not quote the trend line or Power BI pop-up as real.

### Store Audit Scores (`/scores`)
- **Purpose.** Compare every store's Q1-Q4 scores.
- **Do.** Search; filter Operating/Dehired; Export CSV; click a store for a pop-up with a trend and recent audits ("View Report"); the store name opens its SOP scorecard.
- **Data.** Real (stored quarterly scores and classic audits). A missing score shows as 0, which looks like a real zero.
- **Who.** Admin, Audit Manager. **Use case.** Before a quarterly review, export all stores' scores and open the ones that fell.

### Action Taken Tracking (`/issues`)
- **Purpose.** Follow problems found in audits to resolution (owner, priority, status, due date).
- **Do.** Table or Board view; click tiles to filter; filter by text, status, priority, store, assignee; Export; "+ New Issue"; edit; delete.
- **Data.** Issues are read from the server. **Not saved (lost on refresh), though the page says success:** new issue, delete, assignee, due date, tags, attachments, comments. Saved: title, status, priority, description. A store manager's edit keeps only status. The assignee list is hard-coded names. Issues are raised automatically only from classic audits (a "No" on a critical question).
- **Who.** Admin, Audit Manager, Store Manager (sees only issues assigned to them).
- **Use case.** A store manager filters to Open and marks a fixed item Resolved; that status change does persist.

### Store Management (`/stores`)
- **Purpose.** Store master list with each store's quarter score.
- **Do.** Quarter buttons; search; status filter; Export; click a store for details; edit a store; "+ Add Store"; delete. Region and format filters work only through links (the dashboard's format rows).
- **Data.** Editing name, city, format, type, region or status saves. **Add and delete are browser-only and vanish on refresh.** The manager typed in the form is not saved (managers are assigned by account). "Full History" does nothing.
- **Who.** Admin, Audit Manager. **Use case.** Mark a closed store Dehired; export the list.

---

## 4. Audits

### SOP Audits (`/sop-audits`)
- **Purpose.** Auditor: see assigned audits and start one. Manager: list of submitted SOP audits.
- **Do.** Auditor: "Assigned to me" with Start/Resume and Overdue badges; or pick a store and a tool and start; "My audits" list with filters; a sync chip shows offline state. Manager: submitted list, "View scores", "Schedule an SOP audit".
- **Data.** Real, merged with copies kept on the device so it works offline after one online visit.
- **Who.** Auditor mainly; store managers see finished audits of their own stores; managers read.
- **Limits.** An auditor can start an unscheduled audit for any store. Managers cannot fill in SOP audits.

### SOP audit wizard (`/sop-audits/:id`)
- **Purpose.** Score one audit, one question per screen, built for phones.
- **Do.** Type the score (0 to marks in half steps), or tick N/A; read Best/Average/Least; "Add proof / comment" for comment and photos; Previous/Next; Save & exit; Jump to section; header Review button. Saved on the device first, synced when online.
- **Use case.** In a store with poor signal the auditor scores the cash float, photographs the register, moves on.
- **Limits.** The score is typed, so any value in range is allowed. Data is lost only if device storage is cleared before syncing.

### SOP review (`/sop-audits/:id/review`)
- **Purpose.** Auditor: check before submitting (lists unanswered, missing comment, missing photo; tap one to fix; Submit with confirmation). Everyone else: read-only report with per-section subtotals, comments and photos.
- **Limits.** No manager approve or return buttons yet (statuses Approved/Returned are never set). No issues are created from low SOP scores.

### Audit Status (`/audits`)
- **Purpose.** One list of classic and SOP audits with status, score, auditor, issue count.
- **Do.** Filter by search, status, type, region, store, auditor, dates (kept in the address); click a row for a details pop-up; Admin/Manager get an Actions column (Edit status/date/auditor on classic audits; "Mark as" any status).
- **Data.** Real. **Who.** All roles, each seeing what they are allowed to (auditor: own; store manager: own stores).
- **Limits.** "Mark as Approved" only flips a status; there is no real approval screen.

### Classic audit screen (`/audits/:id`)
Built to let an auditor answer Yes/No/Partial/NA and submit, but the route is mounted **read-only** and nothing links to it. Classic audits therefore cannot be filled in from the website today; the Audit Status pop-up shows the answers.

### Audit Scheduling (`/scheduling`)
- **Purpose.** Plan and assign audits of both kinds. **[verified in the demo rehearsal]**
- **Do.** Tiles filter the table; "+ Schedule Audit" with an SOP-tool or Checklist toggle; a live warning if the auditor is on leave or already booked at another store that day, and saving is refused; View, Edit, Cancel (Planned audits only; cancelled audits stay in history).
- **Who.** Admin, Audit Manager only. **Use case.** Friday: schedule next week's Cash audits across four stores and assign auditors.

### Audit Questions (`/questions`)
- **Tab "Question bank".** The classic question bank. **Saved:** a new question. **Not saved (page still says success):** edit, active toggle, delete, new process/type. Pending-question approval has no button.
- **Tab "SOP tools".** **[verified]** One card per tool with version, marks, version history; the editor changes wording, marks, rubric text, proof flags, adds/removes/reorders; "Review changes" shows a summary and requires a note; Publish creates a new version. Finished audits keep their version. Drafts are autosaved in the browser only. Tools cannot be created from scratch, only edited.
- **Who.** Admin, Audit Manager (auditors see the bank only). **Use case.** Raise the marks on a question and publish version 3; last month's reports keep version 2.

---

## 5. My store (store manager)

### My Store (`/my-store`)
- **Purpose.** A store manager's view: quarter score, recent audits, open issues. Real data, classic audits only.
- **Do.** Click Q1-Q4 only.
- **Limits.** **[verified]** For admin and audit manager there is no store picker: the header and score are the first store (Phoenix Mall), while audit and issue lists are company-wide. Misleading for those roles; meant for store managers.

### Audit Checklist (`/checklist`)
- **Purpose.** Read-only list of the questions stores are audited on, grouped by process; search and collapse.
- **Limits.** Shows the whole bank, not a given audit; may include unapproved questions; guidance text never appears.

### Compliance Metrics (`/compliance`)
- **Purpose.** Cash reconciliation, deposit pickups, expired inventory imported from Excel.
- **Limits (bug, [verified]).** The data is in the database (8 cash records, 28 deposit pickups, 18 expired items) but the page reads different field names than the server sends, so most cells show a dash, Total Deposits shows 0, and Store is blank. Only counts, remarks, quantity and expiry date show. A fix is a small mapping change in `StoreCompliance.jsx`.
- **Excel import.** The server can import Excel files (`POST /api/upload`, admin/audit manager) for cash, deposits, expired stock, store scores and observations, but **no page exposes it**.

---

## 6. Admin and tools

### Audit Log (`/audit-log`)
Read-only table of the latest 500 actions (when, who, action, record). Real. Records audit scheduling, approvals, SOP schedule/submit/publish, store and user changes, uploads, issue status changes; not logins or most edits. No search or filter. **Who:** Admin, Audit Manager. **Use case:** "who published the new Cash tool version?"

### User Management (`/user-management`)
Create and edit accounts (name, email, password, designation, region, role, assigned store for store managers), filter by role, activate/deactivate (a deactivated user is blocked at once). Real, logged. **Who:** admin only. Limits: role cannot be changed after creation; assigned store cannot be cleared; no password length check; an admin can deactivate themselves; the audit manager sees the page but gets an error.

### Email Communications (`/email`)
A mailbox layout with eight hard-coded June messages. **No backend:** Send, Schedule, Save draft only update the screen; nothing is sent or stored; messages cannot be opened. Describe it as a prototype.

### Top bar, bell, assistant
- **Notification bell.** Real counts per role (manager: SOP audits awaiting approval, overdue issues; auditor: planned audits assigned; store manager: open issues), loaded once per page load, cannot be dismissed.
- **Avatar menu.** Name and Sign out. No profile or password change.
- **AI assistant** (round button, hidden on SOP audit screens). Answers questions from 16 read-only data lookups (audits, stores, issues, cash, expiry, availability and so on) with tables and charts, and refuses to change anything. **Currently off:** it needs `GOOGLE_API_KEY` in `backend/.env` (then restart the backend). It does not know about SOP audits, and several lookups are limited to the Audit Manager role, so the admin gets a reduced assistant.

### Login (`/login`)
Email and password. No forgot-password, sign-up, or password change; the admin resets passwords in User Management. The page shows demo credentials to everyone (remove before real use) and does not list the admin.

---

## 7. Fixed on 6 Oct 2026 (these were the first gaps in the original review)

| Gap | What changed |
|---|---|
| Compliance Metrics showed dashes | Rewritten to the real fields: store name, rupee amounts, Matched / Mismatch, delayed pickups, stock value; store picker. [verified live] |
| My Store and Compliance mixed stores for admin / manager | Store picker (kept in the address, e.g. `?store=ST003`); everything on the page now describes the picked store. [verified live] |
| Issues: new, delete, assignee, due date did not save | Create, edit, delete now saved on the server (delete: admin and audit manager only, logged); real users as assignees; failures show an error instead of success; fields with no database column (tags, attachments, comments) removed from the form; the overdue badge now works. Store managers see only status and action taken. [verified: create, persist, delete, 403 for store manager] |
| Stores: add and delete did not save | Add and edit saved; delete replaced by "Dehire" (soft); fake manager field and dead "Full History" button removed; region and format filters added; duplicate id returns 409. [verified] |
| Question bank edits did not save | Create, edit, active toggle and delete (soft) saved and logged; failures show an error; Approve / Reject for pending questions; status badge for managers; guidance field removed (no column). |
| Audit Manager saw User Management but got an error | Page is now admin only. |
| Dashboard Overview fake trend and Power BI mock | Trend line now the real average of stores' Q1-Q4 scores; the Power BI button and pop-up are labelled sample data; the always-empty "Recent Communications" card removed. |

## 8. Still open

1. Excel import has no screen.
2. Classic audits cannot be performed from the website (read-only route); no real approve screen for them.
3. No manager approve / return for SOP audits; no issues raised from low SOP scores.
4. Overview "Top 5 Repeat" is not real repeat detection; the Overview tiles count classic audits only.
5. The AI assistant is switched on only when `GOOGLE_API_KEY` is set (left off on purpose), and it does not know SOP audits.
6. Email page is a non-functional prototype.
7. Login page shows demo credentials to everyone (remove before real use); no password reset.
