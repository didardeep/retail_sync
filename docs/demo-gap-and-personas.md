# Demo vs App: Gap Analysis, Dashboard Review and Personas

Scope: compare the approved demo (`test.html`, 2264 lines, single file) with the
real app (`frontend/src`, `backend/app`). Requirements taken from
`docs/issues.md`: checklist-question audits only (no SOP audits), no "Partial"
answer, auditees get assigned issues, Brand -> Store hierarchy, dashboard UI
cleanup. Read-only analysis; no code was changed.

## 1. What the approved demo contains

The demo has NO login and NO roles. It is one fixed user ("Hi, Welcome
Jitendra", test.html:196) who sees every page. Everything is mock data in a
`DB` object (test.html:840-978) and hard-coded chart arrays.

Sidebar (test.html:199-206), 8 items, in this order:
Dashboard & Analytics, Store Audit Scores, Action Taken Tracking, Audit Status,
Audit Scheduling, Audit Questions, Store Management, Email Communications.
Top bar: page title, a bell button and a gear button (both inert), avatar "J".

| Page | What it has |
|---|---|
| Dashboard & Analytics (221-274) | Q1-Q4 buttons + "BI Dashboard" (Power BI sample modal, 754-835). 3 KPI tiles (Planned / Ongoing / Completed). Performance Trends line (hard-coded Oct-Mar + 90% benchmark). All Observations by Risk donut (High/Med/Low, hard-coded 18/52/30). Store-wise Compliance Score bars (7 hard-coded stores). Audit Distribution by Region donut (hard-coded). Store Format Performance bar + summary (COCO/COFO/FOCO/FOFO, hard-coded). Store Score Distribution donut (5 buckets). Store Scorecards Top 5 / Bottom 5 (hard-coded names). Observations card with tabs "Top 5 Observations" / "Top 5 Repeat" (hard-coded lists, 1101-1102, 1578-1595). Recent Communications (5 emails). Recent Issues (3 hard-coded ids). Donut slices open a drill-down drawer (1122-1172). |
| Store Audit Scores (277-301) | Search, year range (2022-2026), Operating/Dehired filter, per-store score bar with year-on-year delta chip, Export CSV, store detail modal with score history chart and recent audits. |
| Action Taken Tracking (304-342) | Issues: 4 KPIs (Total / Open not due / Open overdue / Completed), search, filters (status, priority, store, assignee), status tabs, Table (cards) and Board (kanban) views, Export CSV, New/Edit/Delete issue modal (title, status, description, priority, store, assignee, created/due, audit id, tags, attachments, comment). |
| Audit Status (430-445) | Table of audits: id, store, scheduled, status, score, issues, auditor; filters (status, region, auditor, date range); row opens an "Audit Report" modal with the questions answered (Yes/No only, 1316-1323), observations, auditor and store comments. |
| Audit Scheduling (370-427) | 5 KPIs (Total / Scheduled / Assigned / Completed / Pending assignment), filters, "+ Schedule Audit" modal (title, store, date-time, auditor, status, notes), detail drawer with progress bar, edit and delete. All schedules are "Checklist based Audit". |
| Audit Questions (345-367) | Question bank grouped by Process (Cashiering, HR & Admin, Inventory, EHS) with sub-process, question type (Store Visit / Structured / Unstructured data), weight 1-5, Critical Risk toggle, guidance, tags, on/off toggle; add process, add question type. |
| Store Management (479-507) | 4 KPIs, search, Operating/Dehired filter, add/edit store (name, city, format, type of store, manager, region, status), store insights modal (General Info + Performance), Export CSV. |
| Email Communications (448-476) | Mock mailbox: folders, labels, search, compose (to/cc/bcc, templates, attachments, schedule, draft). Client-side only. |

Concepts in the demo: store master (format COCO/COFO/FOCO/FOFO, type of store,
manager, region), process / sub-process question bank, weights, critical flag,
audit schedule -> audit -> issue flow, issue priority (Critical/High/Medium/Low)
and status (Open/In Progress/On Hold/Resolved/Closed), assignee, due date,
overdue flag. Answers are Yes/No only (no Partial, no NA).

## 2. What the real app contains

Roles (`backend/app/models.py:32-36`): ADMIN, AUDIT_MANAGER, AUDITOR,
STORE_MANAGER. Guard map: `frontend/src/lib/rolesMap.js`. Sidebar:
`frontend/src/lib/nav.js` filtered by `canAccess` in `components/Layout.jsx:69`.
Landing page: Dashboard for admin/manager (`rolesMap.js:33`), first allowed page
for others.

| Role | Sidebar (in order) | Landing |
|---|---|---|
| Admin | Dashboard & Analytics, Audit, Audit Scheduling, Store Audit Scores, Action Taken Tracking, Audit Questions, Store Management, Email Communications, Audit Log, User Management | Dashboard & Analytics |
| Audit Manager | same as Admin minus User Management | Dashboard & Analytics |
| Auditor | Dashboard ("My Audits"), Audit, Email Communications | My Audits (`/my-dashboard`) |
| Store Manager | My Store, Audit Checklist, Compliance Metrics, Action Taken Tracking, Audit, Email Communications | My Store |
| Auditee | does not exist yet (issues.md items 3 and 7) | -- |

Pages (`frontend/src/pages`): Dashboard (Overview tab + SOP Audits tab, and a
store view when `?store=` is set), AuditorDashboard, StoreDashboard (My Store),
StoreAuditScores, Issues, Audit (merged list of checklist + SOP audits),
ClassicAuditWizard (auditor one-question-per-screen), AuditExecution
(read-only checklist audit view), ClassicAuditReview, SopAuditWizard,
SopAuditReview, SopToolEditor, SopDashboard, Scheduling, Questions (Question
bank tab + SOP tools tab), Stores, Email, AuditLog, UserManagement,
StoreChecklist, StoreCompliance, Login. Orphans (no route, no import):
`MyActions.jsx`, `ProposeQuestion.jsx` (only mentioned in `styles.css`).

Backend routers (`backend/app/routers`): admin (users), audit_log, audits
(create/start/patch/cancel/responses/submit/approve/rating), auth, availability,
chat (AI assistant), checklists, dashboard (`/api/dashboard`, `/api/users`),
data (cash reconciliation, deposit pickups, expired inventory, store scores,
data imports), issues, observations, questions (with approval workflow),
sop_admin, sop_audits, sop_dashboard, sop_review (4-line stub), sop_schedule,
stores, uploads (Excel import). Note: `/api/dashboard` (dashboard.py) is not
called by the Overview page, which computes from raw lists instead.

## 3. Added beyond the approved demo

Recommendation key: KEEP / REMOVE (candidate to remove) / DECIDE (needs client
decision).

### 3a. SOP audit family (issues.md item 5: remove)

| Item | What it is | Files | Rec | Reason |
|---|---|---|---|---|
| SOP audit type end to end | Separate audit kind with tools, sections, criteria, scoring, attachments, offline wizard | `pages/SopAuditWizard.jsx`, `SopAuditReview.jsx`, `lib/offline/*`, `routers/sop_audits.py`, `sop_versions.py`, models `Sop*` (models.py:531-737) | REMOVE | Client wants checklist-question audits only. Demo had only "Checklist based Audit". |
| SOP Audits tab on Dashboard | Second dashboard (KPIs, store ranking, gap by section, Pareto, coverage, trend, audits table) | `pages/SopDashboard.jsx`, `components/sop-dashboard/*`, `routers/sop_dashboard.py`, `Dashboard.jsx:464-531` | REMOVE | Not in demo; only reports SOP audits. |
| SOP tools admin | Question tab "SOP tools", tool editor, versioning, publish | `pages/SopToolEditor.jsx`, `components/sop-admin/*`, `routers/sop_admin.py`, `api/sopAdmin.js` | REMOVE | SOP-only. |
| SOP tools in store view | "SOP audit tools" tab on Audit Checklist; SOP scores link from My Store tile | `pages/StoreChecklist.jsx:13-16`, `components/checklist/SopToolCard.jsx`, `StoreView.jsx:156` | REMOVE | SOP-only; keep the "Checklist questions" tab. |
| SOP scheduling | Scheduling form kind "SOP tool" plus conflict check | `routers/sop_schedule.py`, `Scheduling.jsx:27-31,145-151` | REMOVE (SOP part) | Keep checklist scheduling (demo has it). Conflict check could be kept for checklist audits (DECIDE). |
| SOP/classic audit-type chip, merged rows | `mergeRows`, `AuditTypeChip`, "kind" filter, KPI "(checklist audits)" captions | `lib/auditRows.js`, `components/audit/AuditTypeChip.jsx`, `Dashboard.jsx:203` | REMOVE | Distinction disappears with SOP. |
| Notification bell logic | Bell counts SOP audits "awaiting approval" / "planned" | `components/NotificationBell.jsx:15-37` | REMOVE + rewrite | Bell uses SOP endpoints, so for checklist-only it shows wrong counts. Bell itself is a demo item (inert there). |

### 3b. Answer model and audit flow

| Item | What it is | Files | Rec | Reason |
|---|---|---|---|---|
| "Partial" answer (0.5) and "NA" | Four-way answer; Partial scores 0.5 | `lib/classicAudit.js:4,8`, `AnswerButtons.jsx`, `AuditExecution.jsx:12`, `Audit.jsx:97` | REMOVE Partial; DECIDE NA | Client: no Partial. Demo was Yes/No only; NA is not in demo, confirm. |
| Approval step | Audit manager "Approve" after Completed, can override score | `routers/audits.py:341-358`, stage "approved" in `lib/statuses.js` | DECIDE | Demo has no approval; adds a status and a tile ("Approved") on the dashboard. |
| Store manager rating/comment on audit | `POST /audits/{id}/rating`; shown in Audit detail | `audits.py:361`, `Audit.jsx:554` | DECIDE | Not in demo, and no UI exists for the store manager to give it (API + display only). |
| One-question-per-screen auditor wizard | Mobile-style wizard; offline save/sync | `pages/ClassicAuditWizard.jsx`, `lib/offline/*`, `components/SyncChip.jsx`, `OnlineBanner.jsx` | KEEP (needs check) | Demo only showed read-only report; an auditor needs a way to answer questions. Offline sync is a large extra (about 1000 lines): DECIDE if offline is required. |
| Ad-hoc "New audit" by auditor (start audit) | Auditor starts an unscheduled audit | `audits.py:117`, `components/audit/NewAuditSection.jsx`, `StoreOptionsPanel.jsx` | DECIDE | Demo: audits only come from scheduling. |
| Checklist entity with conditions | Named, versioned checklists, applied by format/region | `models.py:292-330`, `routers/checklists.py` | DECIDE | Not in demo (demo has a flat bank). Drives issues.md item 1; client may want per-format checklists. |
| Auditor availability | "Unavailable" periods block scheduling | `routers/availability.py`, `Scheduling.jsx` (UserX icon) | DECIDE | Not in demo; small. |
| Question approval workflow | Auditor proposes, manager approves/rejects; versioning on edit | `routers/questions.py`, `Questions.jsx:140-190`, models Question.version | DECIDE | Not in demo. Orphan `ProposeQuestion.jsx` is dead code. Extra Question columns (photo_video, data_analyst, annex) not in demo. |

### 3c. Roles, pages and dashboards

| Item | What it is | Files | Rec | Reason |
|---|---|---|---|---|
| Role system + login | 4 roles, JWT login, per-role sidebar | `Login.jsx`, `rolesMap.js`, `auth.py` | KEEP | Needed; the demo's single user cannot ship. Add Auditee. |
| Auditor "My Audits" dashboard | 5 tiles, trend, status donut, scheduled-vs-completed, My stores, Next up, Finish these, Recently submitted, My numbers | `AuditorDashboard.jsx` | KEEP (trim) | An auditor needs a worklist; charts are clutter (see section 4). |
| My Store (store manager) | Same component as store view | `StoreDashboard.jsx`, `StoreView.jsx` | KEEP (trim) | Needed once store manager exists. |
| Dashboard store view (`?store=`) | One-store drill from the Overview | `Dashboard.jsx:498-521`, `StoreView.jsx` | KEEP | Matches issues.md item 4. |
| Audit Checklist page (store mgr) | Read-only view of what the store is audited on | `StoreChecklist.jsx` | DECIDE | Not in demo; useful transparency, low cost. |
| Compliance Metrics (store mgr) | Cash reconciliation, deposit pickups, expired inventory tables | `StoreCompliance.jsx`, `routers/data.py`, models CashReconciliation etc. | DECIDE | Not in demo; relates to the "collection short" idea in issues.md item 7 but today is separate imported data, not audit answers. |
| Audit page (merged) | One audit list for all roles, replaces demo "Audit Status" | `pages/Audit.jsx` | KEEP | Equivalent of demo Audit Status (renamed "Audit"). |
| Audit Log | Who did what | `AuditLog.jsx`, `routers/audit_log.py` | KEEP | Compliance trail; not in demo, low risk. |
| User Management | Admin creates users/roles | `UserManagement.jsx`, `routers/admin.py` | KEEP | Required once roles exist. |
| AI chat assistant | Floating chat with charts and tables | `ChatAssistant.jsx`, `assistant_service.py` (791 lines), `routers/chat.py` | DECIDE | Not in demo; largest unrequested feature; also references SOP data. |
| Excel upload/import | `POST /api/upload`, `import_*.py` | `routers/uploads.py` | KEEP (backend) | Data load path; no UI calls `uploadFile` (`api/client.js:135`). |
| Observations entity | Separate from issues; feeds risk donut and "Top 5 Observations" | `models.py:413`, `routers/observations.py` | DECIDE | Demo had observations only as hard-coded text; two parallel concepts (observation vs issue) confuse the model. |
| Power BI "sample preview" | Fake KPI preview modal, labelled SAMPLE DATA | `Dashboard.jsx:189,389-459` | DECIDE | Was in the approved demo ("BI Dashboard") but is unconnected static data; confirm whether client wants real BI. |
| Mobile drawer nav, offline banners, toasts | Responsive shell | `Layout.jsx` | KEEP | Quality, no scope impact. |

### 3d. Demo items MISSING from the app

| Demo item | State in app |
|---|---|
| Year-range filter and year-on-year delta chips on Store Audit Scores | App shows Q1-Q4 only (`StoreAuditScores.jsx`); no multi-year view or delta chips. |
| Store detail "Score History" 2022-2026 chart | App has quarterly only. |
| Issues: tags, attachments, comments, audit-id link | App Issues page shows title/status/priority/store; check Issues.jsx for tags and comments (grep found no tags/comment UI). Backend has attachments only for SOP. |
| Audit Status "Audit Report" modal listing every question answered Yes/No with observations and comments | Partly: ClassicAuditReview / Audit detail; confirm parity once Partial is removed. |
| Scheduling detail drawer progress bar, notes editing | Drawer exists; progress for checklist audits is not shown. |
| Questions page: "Add Process" and "Add Question Type" dialogs, guidance field, tags | App Questions page uses fixed lists from data; no add-process or add-type dialog found. |
| Store form: "Type of Store" (Flagship/Standard/Compact/Kiosk), contact, email, address | Verify in `Stores.jsx`; Store model has location fields but type-of-store not confirmed. |
| Email: real send, schedule, drafts | App Email page is client-side only (no `api.` calls in `Email.jsx`), same as demo; neither sends mail. |
| Issues KPI "Open (Not Due)" vs "Open (Overdue)" split | App Issues page: confirm it keeps this split. |
| Dashboard "Recent Communications" card | Removed in app (no email widget). Fine; low value. |

## 4. Dashboard review

Rating: R = relevant and actionable, M = marginal, I = irrelevant for that viewer.

### 4a. Overview dashboard (demo, then app) -- viewer: Audit Manager / Admin

Demo = `test.html` 221-274. App = `Dashboard.jsx` OverviewDashboard. The app
copies the demo almost 1:1 and replaces hard-coded numbers with live ones.

| Widget | Shows | Rating | Reason / verified issue |
|---|---|---|---|
| KPI tiles Planned / Ongoing / Completed (+ Approved in app) | Audit counts by stage | R | Click-through to the Audit list. App filters `kind=legacy` (`Dashboard.jsx:70,195-205`); that caption goes away without SOP. Demo "Planned" = ongoing + completed (test.html:1043), which is wrong (not planned). |
| Performance Trends / "Average store score by quarter" | One chain-wide line + hard-coded 90% benchmark | M | Hides which brand is slipping (issues.md item 2). Values come from the imported `StoreScore` table, not from audits (`Dashboard.jsx:73-76`). Benchmark 90 is hard-coded (`storeStats.js:9`). |
| All Observations by Risk | Donut of observation risk | M | Counts imported observations, not issues; a different entity from the issues list below (naming clash, see section 6). |
| Store-wise Compliance Score | Top 7 stores bar | M | Only the best 7 (`Dashboard.jsx:95`). A manager needs the worst stores, which are in Bottom 5. Duplicates Top/Bottom 5. |
| Audit Distribution by Region | Audit counts per region | M | Volume per region is workload info, not quality; the centre "Avg audit score" mixes in a second metric. |
| Store Format Performance | Avg score per COCO/COFO/FOCO/FOFO | M | Meaningful only if format data is correct (issues.md item 1: audits do not record format). |
| Store Score Distribution | Stores per score bucket | M | Overlaps with Top/Bottom 5 and the store bars; drill-down is useful, chart is redundant. |
| Store Scorecards Top 5 / Bottom 5 | Ranked stores by quarter score | R | Genuinely ranked (`rankScored`, `Dashboard.jsx:121-124`); Bottom 5 is the most actionable block on the page. |
| Observations card, tab "Top 5 Observations" | First five distinct observation texts | I (MISLEADING) | Not a ranking: `[...new Set(observations.map(o=>o.observation))].slice(0,5)` (`Dashboard.jsx:127`) on a list ordered by `sr_no` (`observations.py:34`). It is the first five rows imported. Demo hard-coded the same idea (test.html:1101). |
| Same card, tab "Top 5 Repeat" | Five issue titles | I (MISLEADING) | `issues.slice(0,5).map(i=>i.title)` (`Dashboard.jsx:128`); issues are ordered newest first (`issues.py:75`), so this is the 5 most recent issues, not repeated ones. The card title is "Repeat Observations". Demo hard-coded five titles (test.html:1102). |
| Recent Issues | 3 newest issues | M | Duplicates the Issues page; "View all" link is the real value. A better card: overdue / critical open issues. |
| Power BI (sample preview) button | Static fake KPIs | I | Unconnected sample data, labelled as such in the app. |
| Header title "Audit Operations" + "Consolidated View" | Fixed text | M | Does not say what is selected (issues.md item 4). |
| Store selector (StorePicker) | Switches to store view | R but weak | Most important control, styled like a text field (`StorePicker.jsx`). |

Net: 11 widgets above the fold of one long page; only KPI tiles, Bottom 5 and
the drill-downs are decisions-ready. The three observation/issue widgets overlap
(risk donut, observations card, recent issues).

### 4b. Store view (app only: `StoreView.jsx`) -- viewer: manager picking a store, and store manager

| Widget | Shows | Rating | Reason |
|---|---|---|---|
| Q1-Q4 buttons | Quarter for score tile | M | Only changes the score tile (`StoreView.jsx:128,219`), not other widgets; easy to mistake for a page-wide filter. |
| Tile: Qn score | Stored quarterly score | R | Headline number. Links to SOP scores for managers (`:156`), which must change. |
| Tile: Audits completed / Scheduled-in-progress | Counts, open drawer | R | Real counts, same lists as the numbers. |
| Tile: Open issues / Overdue issues | Counts | R | Most actionable pair for a store. Caveat: for a store manager the API returns only issues ASSIGNED to them (`issues.py:67-69`), so "open issues for my store" can be understated. |
| Score trend (Q1-Q4 + benchmark) | Store quarterly score | R | Good; benchmark hard-coded at 90. |
| Issues by priority | Open issues donut | R | Correctly computed from open issues (`storeStats.js:88-98`). Title differs from the Overview ("All Observations by Risk"): inconsistent. |
| Audit results | Bar of last 12 scored audits | M | Overlaps with Score trend and Recent audits. |
| Audits by status | Donut Scheduled/In progress/Completed/Approved/Cancelled | M | Counts already in tiles. |
| Recent audits | Last 8 audits | R | Direct path to audit reports. Includes SOP rows via `mergeRows` (remove). |
| Open issues list | Top 5 by priority | R | Properly ranked (`topOpenIssues`). Best widget for a store manager. |

### 4c. Auditor dashboard ("My Audits", `AuditorDashboard.jsx`) -- viewer: Auditor

| Widget | Rating | Reason |
|---|---|---|
| Tiles Scheduled / In progress / Submitted / Cancelled / Overdue | R (Cancelled: I) | Worklist counts with click-through. "Cancelled" is not something an auditor acts on. |
| Score trend (monthly avg, target) | M | Auditors do not control the score; interesting, not actionable. |
| My audits by status donut | I | Repeats the tiles. |
| Scheduled vs completed by month | M | Workload view; of use to the manager, not the auditor. |
| My stores (latest score bars) | M | Useful for knowing the weak store before a visit; low priority. |
| Next up | R | The first-screen answer: what do I do now. Should be at the top. |
| Finish these (drafts with progress) | R | Second most important. |
| Recently submitted | M | Reference only. |
| My numbers (avg score, audits/stores this month, issues raised, waiting to sync) | M | "Issues raised" counts issues on the auditor's own audits; ok. "Waiting to sync" matters only if offline stays. |

Misplaced order: the page opens with 5 tiles plus 3 charts before "Next up".

### 4d. SOP dashboard (`SopDashboard.jsx`, 6 panels)

KPI tiles, Store ranking, Gap by section, Pareto "Where marks are lost",
Audit coverage, Trend, Audits table with CSV export. Individually well built
and actionable for a manager, but they all report SOP audits. Rating: I for
the checklist-only product (remove). The Pareto and "gap by section"
ideas (where do stores lose marks) are worth re-creating on checklist
questions per process/sub-process: that is the analysis the demo's Process /
Sub-process structure was built for.

### 4e. Other dashboards / list-level KPIs

| Page | KPIs | Rating |
|---|---|---|
| Scheduling (5 tiles: Total / Scheduled / Assigned / Completed / Pending assignment) | demo and app | R for audit manager ("Pending assignment" is the action). |
| Issues (Total / Open not due / Open overdue / Completed) | demo | R. |
| Stores (Total / Operational / Critical audit / Avg score) | demo | M ("Avg score" repeats the dashboard). |
| User Management (Total users, per role counts) | app | M (admin only). |

## 5. Personas

### Admin (system owner)
- Who: IT / QA operations lead who sets up the system. Few per organisation.
- Goals: correct master data, right people with right roles, nothing broken.
- Daily tasks: create users and roles (`UserManagement.jsx`), import stores and
  question banks (Excel), check the Audit Log, fix wrong data.
- Decisions: who can see what; which stores/brands exist; reactivate or retire
  a user or store.
- First screen needs: users without a role or store, failed imports, recent
  audit-log entries. Today lands on the full Overview dashboard (not needed).
- Pain points: no brand entity, no import UI (`uploadFile` unused), store format
  not validated.
- Serves them: User Management, Stores, Audit Log, Questions.
- Clutter for them: all chart widgets, Power BI, chat assistant, SOP tabs.

### Audit Manager (the main dashboard user; the client's QA head)
- Who: runs the audit programme across brands/regions; reports to leadership.
- Goals: every store audited on time, low-scoring stores fixed, issues closed.
- Daily tasks: schedule audits and assign auditors, chase unassigned/overdue
  audits, review submitted audits, assign or chase issues, maintain question
  bank, (planned) create brands and add stores to them.
- Decisions: which store/brand to audit next; which store needs escalation; who
  an issue goes to; whether an audit result stands (approval, score override).
- First screen needs: audits pending assignment / overdue / awaiting review;
  bottom stores; overdue critical issues; a scope selector (brand/store).
- Pain points: dashboard title/selector unclear; one-line trend hides brands;
  "Top 5 Repeat" is not repeat; too many overlapping charts.
- Serves them: KPI tiles, Bottom 5, drill-downs, Scheduling, Audit, Issues.
- Clutter: Top-7 bars, region donut, distribution donut, Recent Issues card,
  Power BI, SOP tab.

### Auditor (field)
- Who: field auditor visiting stores, often on a phone with poor connectivity.
- Goals: finish assigned audits accurately and fast; raise issues for real
  failures.
- Daily tasks: open "Next up", answer checklist questions Yes/No (NA?), add
  photo / comment, decide per failed question whether to raise an issue and who
  gets it (issues.md item 7: auditor chooses), submit.
- Decisions: answer per question; raise issue or not; assign to which auditee.
- First screen needs: Next up, unfinished drafts, overdue, sync state.
- Pain points: Partial is ambiguous; tiles and 3 charts push "Next up" down;
  bell counts SOP audits.
- Serves them: Next up, Finish these, Audit list, wizard, SyncChip.
- Clutter: status donut, scheduled-vs-completed, score trend, Cancelled tile.

### Store Manager (audited party)
- Who: manager of one store; receives audit results and corrective actions.
- Goals: pass audits, close corrective actions before due date, know what the
  auditor will check.
- Daily tasks: look at open and overdue issues, record what was done, read the
  checklist, view audit reports.
- Decisions: what to fix first (priority/due date); whom in the team to give it
  to (this is the Auditee idea).
- First screen needs: my open / overdue issues with due dates, next audit date,
  latest score.
- Pain points: sees only issues assigned to their own user, not all issues for
  the store (`issues.py:67-69`); the same trend/donut/bar widgets as managers;
  Compliance Metrics tables are raw data.
- Serves them: Open and Overdue tiles, Open issues list, Audit Checklist.
- Clutter: Audit results bar, Audits by status donut, quarter buttons that only
  affect one tile, Compliance Metrics unless the client wants it.

### Auditee (planned; issues.md items 3 and 7)
- Who: a person at (or tied to) a store who is assigned a failed question and
  must follow it up. Many per store. Does not exist in models.
- Goals: understand exactly what failed and close it with proof, on time.
- Daily tasks: open assigned items, read question + answer + audit it came
  from, reply (text / evidence), mark done, wait for confirmation.
- Decisions: whether the item is resolved; whether to push back.
- First screen needs: a single list of "assigned to me", sorted by due date,
  with status. Nothing else (no dashboards, no store list).
- Pain points to avoid: reusing the store manager's dashboard; today the
  nearest thing is Issue.assignee_id (any user), with no store link.
- Serves them: a focused assigned-issues page (the existing Issues page filtered
  to assignee, with a reply box).
- Clutter: everything else. Role should have 2 pages max (Assigned, Email).
- Open: is the Store Manager also the Auditee (see section 6)?

## 6. Priorities and open questions

### Top things to remove or simplify (in order)
1. Remove the SOP family end to end (section 3a). Largest single cut; also
   removes the SOP tab, SOP scheduling kind, SOP tools admin and the SOP parts
   of Notification Bell, Store view and Audit Checklist.
2. Remove "Partial" (`classicAudit.js`, `AnswerButtons.jsx`,
   `AuditExecution.jsx`, `Audit.jsx`, backend scoring). Decide NA.
3. Fix or delete the misleading observation widgets: "Top 5 Observations"
   (first five rows, not ranked) and "Top 5 Repeat" (five newest issues).
   Either compute real frequency (group by question / observation text, count
   across audits and stores) or drop the card. Rename "Repeat Observations".
4. Collapse the Overview dashboard to one outline: heading naming the scope +
   visible brand/store selector, KPI tiles, per-brand trend, Bottom stores,
   overdue / critical issues. Drop or merge Top-7 bars, distribution donut,
   region donut, Recent Issues card, Power BI sample.
5. Resolve the observation vs issue duplication: one concept, one list, one
   risk donut (Overview counts observations, store view counts issues).
6. Re-order the Auditor dashboard: Next up and Finish these first; drop status
   donut, cancelled tile.
7. Delete dead code: `MyActions.jsx`, `ProposeQuestion.jsx`,
   `routers/sop_review.py`, unused `uploadFile`/`/api/dashboard` (or wire them).
8. Add: Brand entity, Auditee role and assign-to-auditee flow
   (issues.md items 3, 7); small and focused Auditee landing page.

### Open questions for the client
1. Is "Partial" gone for good, and is "NA" allowed? What happens to scores for
   existing audits that contain Partial?
2. Does the Store Manager act as the Auditee, or is Auditee a separate person
   (many per store)? Who can assign: auditor during audit, audit manager after,
   or both? Can one question go to two auditees?
3. Is the audit approval step (Completed -> Approved, score override) wanted?
   The demo had none.
4. Is offline working for auditors a requirement? It carries most of the extra
   complexity (`lib/offline`, sync chip, local draft merge).
5. Do you want the AI chat assistant, the Compliance Metrics tables
   (cash/deposit/expired stock), the Audit Checklist page for store managers,
   and the question-approval workflow? None were in the approved demo.
6. What is a "Brand" (banner / chain)? One brand per store? Can a store manager
   see brand-level data?
7. Should store format be confirmed by a checklist question, or is master data
   the single source of truth (issues.md item 1)?
8. Should scores shown on the dashboard come from imported quarterly scores
   (`StoreScore`) or be computed from submitted audits? Today the trend uses the
   former while the KPI tiles use the latter, so they can disagree.
9. Is the 90% benchmark fixed company-wide, per brand, or per format?
10. What should "repeat observation" mean: same question failed at the same
    store in consecutive audits, or same issue across stores?
11. Should "Email Communications" stay (client-side mock in both demo and app,
    sends nothing)? Remove, or connect to a real mailbox?
12. Power BI button: is a real embedded report planned, or can the sample go?

## Decisions from the user (supersede the recommendations above)

| Decision | Why | Alternatives |
|---|---|---|
| KEEP the AI chat assistant | Wanted, even though it is not in the approved demo | Remove as scope creep |
| KEEP the audit approval step | Wanted | Remove, auditor submits final |
| KEEP the offline auditor wizard | Wanted | Online only |
| KEEP the checklist part and its approval (question-approval workflow) | Wanted | Admin-only checklist edits |
| KEEP the NA answer, "if applicable" | Some questions do not apply to every store | Remove NA |
| Partial answer: remove (see issues.md issue 6), user unsure what it is | Option scored 0.5 between Yes and No; not needed | Keep as 3-level scale |

| KEEP checklist-entity feature and Power BI sample modal | Wanted | Remove |
| REMOVE Compliance Metrics | Not needed | Keep |
| Delete old audit data (has Partial) and rebuild with Yes/No/NA | Clean data, no legacy handling | Convert Partial to No |
