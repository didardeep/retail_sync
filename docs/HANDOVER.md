# HANDOVER: SOP audits for Retail Sync (state as of 2026-10-06)

Read this first. It is written for someone (or a Claude session) with no memory of how we got here.
Deeper detail lives in the other docs listed in section 14.

## 1. What this is, in five lines
- Retail Sync is an internal "Store Audit and Analysis" tool for a retail chain (about 10 stores). Roles: Audit Manager,
  Auditor, Store Manager. Stack: FastAPI + SQLAlchemy + Alembic backend (`backend/`), React 18 + Vite + Tailwind +
  shadcn frontend (`frontend/`), SQLite by default, Postgres by setting `DATABASE_URL`.
- The original app audits stores with Yes/No/Partial checklists and tracks issues. It had no scored audits.
- We added **SOP audits**: two fixed, scored audit tools (Cash, FMCG) taken from `docs/SOP_Audit_Checklists.xlsx`.
  Each question has marks and three rubric levels (Best / Average / Least). Auditors type a score per question.
- Auditors use it on a phone in stores with poor signal, so it is **offline-first**: answers are saved on the device
  first and synced later. The phone app is planned as a Capacitor wrapper of the same React app (not started).
- The current push: connect the SOP audits to the rest of the app (scheduling, status list, dashboard, question editing),
  make the pages clickable, and let managers edit the questionnaires with version history.

## 2. Why it was done this way (the reasoning)
- **Separate `sop_*` tables (D1).** SOP scoring (marks plus a 3-level rubric, typed scores) does not fit the old
  Yes/No/Partial model. Extending the old tables would have meant mapping Average to Partial and breaking FMCG, whose
  "Minimum" is one third of marks, not zero. Separate tables left the old audit flow untouched.
- **Templates come from the Excel (D2).** The business owns the tools in Excel; a revised tool should be a data
  import, not a release. `backend/import_sop.py` does it (idempotent).
- **Offline-first (D10, D11, D15).** A lost audit is costly. Every answer goes to IndexedDB first; sync pushes
  changes later using client-generated UUIDs and idempotent endpoints so retries never duplicate. Sync is driven by
  per-record revision counters (`rev` / `synced_rev`) rather than a separate queue, so an edit made during a request
  is never marked synced by mistake.
- **Alembic (D17).** `create_all` never alters existing tables, so every schema change used to mean wiping the
  database. That does not work with two people or real data. Migrations now run on app start.
- **Versioned audit tools (D21).** Editing marks on a tool that has been used would silently rewrite every past
  audit's percentage. Editing after use creates a new version (same code, version + 1); old audits keep the
  version they were done on. Questions carry a `stable_key` so dashboards can follow one question across versions.
- **Dashboard computed in the browser (D19).** One call returns all final audits (about 200 KB for 68 audits) and the
  page filters locally, so chart clicks are instant and the calculations are plain functions that can be tested.
- **Scheduling on the existing page, planned audits (D20).** A manager schedules an audit (status Planned); the
  auditor's first save makes it Draft; submit makes it Submitted. Scheduled audits are Cancelled, never deleted,
  because a phone that started one offline would recreate a deleted audit on the next sync.
- **Why the integration work exists at all:** after the SOP audits and dashboard were built, the user found they
  could not see or use them from the rest of the app: the Scheduling page did not really schedule anything, Audit
  Status only listed the old audits, Audit Questions could not edit SOP tools, and most charts, tiles and rows on
  the older pages were not clickable. The Scheduling and Audit Status pages also contained fake data.

## 3. Decisions the user made explicitly (do not re-litigate)
- Score entry: the auditor **types a number** (0 to marks, steps of 0.5). Rubric points are guidance only.
- One question per screen; Next saves; a review screen before submit.
- Proof (comment/photo) is **configurable per question**.
- Phone app: **Capacitor** wrapping the existing React app.
- Dashboard placement: a new "SOP Audits" **tab inside Dashboard and Analytics** (the old page became "Overview").
- Scheduling: on the **existing Audit Scheduling page**.
- Questionnaire edits: **versioned** (old audits keep their marks). Editor scope: **everything** (wording, marks,
  rubric text, proof flags, add/remove/reorder questions and sections), as a tab in Audit Questions.
- Work should be split into streams that touch different files so two people can work in parallel.
- Keep a decision log (D-numbers in `docs/SOP_Audit_Decisions.md`); add an entry for every real decision.

## 4. What exists now (by area)

### Data model (`backend/app/models.py`, migrations in `backend/migrations/versions/`)
| Table | Purpose |
|-------|---------|
| `sop_templates` | One row per tool VERSION: `code` (CASH/FMCG), `version`, `is_current`, `is_active`, `total_marks`, `min_rule`, `published_at`, `created_by_id`, `change_note`. Unique (code, version) |
| `sop_sections`, `sop_criteria` | The tree under a template. Each has `stable_key` (same across versions). Criteria: `marks`, `max_text`/`avg_text`/`min_text`, `min_points`, `default_na`, `requires_comment`, `requires_photo` |
| `sop_audits` | One audit. Client UUID id, `template_id` (its version), `store_id`, `auditor_id`, `status`, `scheduled_at`, `notes`, `created_by_id`, cached `score/max_score/percent` |
| `sop_audit_scores` | One answer per question: `score`, `is_na`, `comment` |
| `sop_attachments` | Proof photos (files under `backend/uploads/sop/`, gitignored) |
| `issues` | Existing table; migration 0002 added `sop_audit_id` and `sop_criterion_id` so issues can come from SOP audits (nothing raises them yet) |

Migrations: 0001 baseline (22 tables), 0002 issue link columns, 0003 scheduling columns, 0004 template versions and
stable keys. `docs/DB_Migrations.md` explains the workflow (and how to avoid two migration heads).
Statuses: Planned, Draft, Submitted, Approved, Returned (review step, not built), Cancelled. Constants and the
rules live in `backend/app/services.py` (`SOP_*`, `SOP_AUDITOR_EDITABLE`, `SOP_FINAL_STATUSES`,
`auditor_conflict`, `current_template`, `compute_sop_score`, `validate_sop_submit`).

### Backend endpoints (all under `/api`)
- `sop-audits`: `GET /templates`, `GET /templates/{id}`, `GET ""` (scoped by role), `GET /{id}`, `PUT /{id}` (auditor
  upsert, Planned -> Draft), `POST /{id}/submit`, `POST /{id}/attachments`, `DELETE /{id}/attachments/{att}`,
  `GET /attachments/{att}`. Auditor owns their audits; store managers see only finished audits of their stores.
- `sop-dashboard`: `GET ""` (manager only), one payload for the whole SOP tab.
- Stub routers, registered but empty until the streams below fill them: `sop-schedule`, `sop-admin`, `sop-review`.
- Scheduling check shared by classic and SOP audits: same auditor on the same day clashes only if the store differs.

### Frontend (`frontend/src/`)
- **Offline layer** `lib/offline/` (`db.js`, `store.js`, `sync.js`, `index.js`, `hooks.js`, `scoring.js`, `image.js`):
  IndexedDB store, revision-based sync, photo compression (about 1600 px / 300 KB), sync status chip.
- **Pages:** `SopAudits.jsx` (start/list), `SopAuditWizard.jsx` (one question per screen), `SopAuditReview.jsx`
  (review and submit, read-only view), `Dashboard.jsx` (Overview + SOP tab) with `SopDashboard.jsx` and
  `components/sop-dashboard/*` (ranking, section gap, Pareto, coverage, trend, table, CSV export; calculations in
  `logic.js`, tested in Node).
- **Shared groundwork (Step 0):** `lib/nav.js` (single nav list), `lib/statuses.js` (statuses and stages),
  `lib/links.js` (the URL contract, see `docs/URL_Contract.md`), `lib/useUrlFilters.js` (filters in the URL),
  `components/SopStatusBadge.jsx`, API files `api/sopDashboard.js`, `sopSchedule.js`, `sopAdmin.js`, `sopReview.js`.
  `api/client.js` is **frozen**: add new API calls in the per-stream api file, not there.
- Login session is in `localStorage` (D16) so a restarted phone app keeps its login.
- Auditors now land on `/sop-audits`.

### Tests (all pass at the Step 0 commit)
- Backend: `cd backend && python -m pytest -q` (13 tests at Step 0; uses a throwaway SQLite DB built by the real migrations,
  so it never touches `retail_sync.db`).
- Frontend: `cd frontend && npm test` (11 tests at Step 0) and `npx vite build`.
- Drift check: `cd backend && alembic check` must say "No new upgrade operations detected".

## 5. State of the work, exactly
Branches (local; see the warning in section 12 about pushing):
| Branch | What | State |
|--------|------|-------|
| `tanmay` | Original SOP build: backend, offline frontend, docs, Alembic 0001/0002 | **Pushed** to origin (`64f8a21`) |
| `track-b-dashboard` (base for everything below) | `tanmay` + SOP dashboard + demo data (6db6cb3, 12be40d, c1443cb) + Step 0 (9155744, d5e9149, c24029b) + these docs | **Pushed** to origin |
| Stream B: pushed as `origin/stream-b-scheduling` (local branch `worktree-agent-a63789b559297ac20`, worktree `.claude/worktrees/agent-a63789b559297ac20`) | SOP scheduling | **Pushed.** Fully committed (1197cfe backend, 3f82527 libs, e9547d9 pages). Backend 28 tests and node 25 tests pass, `vite build` passed. The three pages (`Scheduling.jsx`, `AuditStatus.jsx`, `SopAudits.jsx`) have **not had a render check or a browser check**. Their line endings were fixed (they were CRLF) just before committing |
| Stream C: pushed as `origin/stream-c-editor` (local branch `stream-c-editor`, worktree `.claude/worktrees/agent-a89f35ecffab5f521`; the worktree's own branch `worktree-agent-a89f35ecffab5f521` sits on old `main` with nothing on it, ignore it) | Questionnaire editor and versioning | **Pushed.** Fully committed (c6caa78 backend, 7b6d76b frontend). 30 backend tests and 33 node tests pass, `alembic check` clean, `vite build` passes. The editor and the Questions tabs have **not had a render check or a browser check** |
| Stream A: not pushed (nothing to push) | Clickable pages and navigation | **Not started.** Its worktree was created from an old commit (`bad364c`, before Step 0) and a permission check blocked it from moving the branch forward. Start a fresh branch from `track-b-dashboard` |

Streams B and C are on separate branches and have NOT been merged into each other or into `track-b-dashboard`. They are designed
not to conflict (different files), but the first merge has not been tried: expect to merge, then run the full suite
(`python -m pytest -q`, `npm test`, `npx vite build`, `alembic heads`, `alembic check`) and fix anything that surfaces.

Re-check before relying on this table: `git worktree list`, `git log --oneline c24029b..<branch>`, and `git -C <worktree> status --short`.

Stream B backend contents (committed): manager-only `POST/PATCH/cancel/GET conflicts` in `sop_schedule.py`, classic
`PATCH/cancel` in `audits.py`, 5 Planned demo audits in `seed_sop_demo.py`, 15 tests in `test_sop_schedule.py`,
`lib/auditRows.js` (merges classic and SOP audits into one row shape; never invents a score), `lib/offline/assigned.js`
and `syncAssigned()` in `sync.js` (assigned Planned audits are pulled so they work offline; a reassigned or cancelled
audit gets a clear message and its local data is kept).

## 6. What still has to be done
In order. Each item names the files it owns so streams do not collide.

### 6.1 Finish Stream B (scheduling and "Assigned to me")
Files: `Scheduling.jsx`, `AuditStatus.jsx`, `SopAudits.jsx`, `components/AuditRowStatus.jsx`, `sync.js`.
1. The pages are committed but unverified. Do the render check (a jsdom harness was started in the session
   scratchpad `ssr/` folder, but its fixture lists came back empty: probably a fetch stub path-matching bug; server
   rendering alone skips effects, so pass data in or use jsdom), then re-run pytest, `npm test`, `npx vite build`.
2. Check the Scheduling form with a real browser: kind toggle, conflict messages, edit and cancel, KPI tiles as
   filters, `?id=` drawer, `?new=sop`.

### 6.2 Finish Stream C (editor and versioning)
Files: `backend/app/sop_versions.py`, `routers/sop_admin.py`, `import_sop.py`, `routers/sop_dashboard.py`,
`components/sop-dashboard/logic.js`, `Questions.jsx` (tabs), `SopToolEditor.jsx`, `components/sop-admin/*`,
`api/sopAdmin.js`. Scope is in `docs/SOP_Integration_Plan.md` under "Stream C". Key rules: publish creates version
N+1 in one transaction; stale `base_version` returns 409; no-op if nothing changed; stable keys preserved; Planned
audits move to the new version only if they have no score rows and no photos; dashboards group questions by key
across versions; `import_sop` is "compare then publish" and stays idempotent.
To finish: run the render check (the agent left an entry file in the session scratchpad: `entry.jsx`; if it is gone,
write one covering the Questions tabs, tool cards and version history, editor fields, the "marks must be above 0"
message, read-only mode `?version=N` and the review summary), then check the editor in a real browser (edit,
autosave and restore across a reload, publish with redirect and toast, the stale-version 409 reload path, phone width).
Known deviations in the committed backend: `publish_version` returns a `PublishResult(template, unchanged, diff,
moved_audits)` instead of the bare template; `POST /tools` (create a brand-new tool code) was skipped; `change_note`
is optional in the API but required by the UI; `logic.js` exports `criterionByKey` and keeps `criterionById` pointing
at the same lookup, and falls back to ids when data has no keys, so Stream A's `SopDashboard.jsx` keeps working.

### 6.3 Do Stream A (clickable pages and navigation)
Start it from a worktree or branch created directly from `track-b-dashboard`. Files: `Dashboard.jsx`,
`routers/dashboard.py`, `Issues.jsx`, `StoreAuditScores.jsx`, `Stores.jsx`, `AuditLog.jsx`, `SopDashboard.jsx` and
`components/sop-dashboard/*` except `logic.js`, `SopAuditReview.jsx`, `Layout.jsx`, new `NotificationBell.jsx`.
Concrete findings to act on (from a clickability audit):
- Overview store bar loses the store id (names are truncated in `storeBarD`); Top/Bottom rows, KPI tiles
  (Planned/Ongoing/Completed), format bar and Recent Issues rows are not links.
- The risk doughnut counts observations by `risk` but its drill drawer lists issues by `priority` (mismatch).
- The drill drawer duplicates the shared `Drawer` markup, has no links and no URL.
- `Layout.jsx` bell and gear have no handler; `Issues.jsx` and `AuditStatus.jsx` audit-id links have no href.
- Only `Dashboard.jsx` and `SopDashboard.jsx` keep state in the URL; every other page uses local state and its
  modals have no address.
- The Power BI mock modal shows hard-coded sales-return data with labels like "Duplicate of KPI 3": relabel as a preview.
Use `lib/links.js` for every link and `useUrlFilters` for filters. Role rule: managers can open `/dashboard`;
auditors and store managers cannot, so `storeScorecardLink(storeId, role)` sends them to `/sop-audits?store=`.

### 6.4 Merge order and then Stream D
Merge order: Step 0 (done) -> A -> B and C (either order; they share no files) -> D. After merging run the full
suite, `alembic heads` (must be one line) and `alembic check`.
Stream D (optional, last): manager review (approve / return with comment) and raising issues from low-scoring SOP
criteria. Needs migration 0005 (`sop_audit_reviews`, `sop_audits.reviewed_at/reviewed_by_id`); the issue link
columns already exist. Decide whether reports count Approved only once review exists (single constant:
`SOP_FINAL_STATUSES`).

### 6.5 Not started anywhere
- Capacitor wrapper (needs an HTTPS backend reachable from phones, camera permission entries, app icon; the camera
  button is a plain `<input type="file" capture>` and needs a real-phone test).
- Excel export and a multi-store compiled report (only a CSV of the dashboard table exists).
- Global search (Ctrl+K), grouped sidebar rendering (the nav list already has `group` fields), light/dark toggle.
- A "vs last audit" figure on pages other than the SOP dashboard; user admin and 2FA (the ESG portal in
  `E:\KPMG\Sustainability` has these; it was only read, see `docs/SOP_Audit_Roadmap.md`).
- A README section pointing at these docs.

## 7. Drawbacks, risks and known limitations (be honest about these)
- **Nothing has been looked at in a browser since the SOP dashboard was built**; much of it was verified by Node
  tests against real API output and server-side rendering. Layout, chart appearance and real click behaviour are
  unchecked. The offline path was checked in a browser earlier (simulated offline), not on a real phone.
- **Migrations are tested on SQLite only.** 0004 drops a unique constraint and has a Postgres branch that has never run.
  Test on a scratch Postgres before using Postgres anywhere that matters.
- **Local dev database** (`backend/retail_sync.db`, gitignored) is at revision 0002 and upgrades itself to head on
  the next backend start. A backup copy was made in the session scratchpad (not in the repo).
- **Session now in `localStorage` (D16)**: on the web, login survives closing the tab for everyone.
- **Sync runs only while the app is open** (no background sync). Data stays safe on the device and syncs next open.
  A login older than 12 hours must be refreshed before syncing; queued work waits.
- **Edge cases of versioning:** the server accepts a NEW audit on a superseded version (deliberate, D21, so offline-started
  audits sync); a Planned audit scored on a phone against version N but moved by a publish to N+1 would fail validation on
  sync (the publish only moves Planned audits that have no scores on the server, not ones scored offline).
- **Booking rule is relaxed (D20):** same auditor, same store, same day no longer clashes.
- **Legacy pages still contain fake or seeded data** (Overview trend line, Power BI mock, Recent Communications);
  Stream B removes it from Audit Status only.
- **Photos are stored on the phone as blobs;** a phone under heavy storage pressure could evict them (the app asks the
  browser to keep its data but cannot force it).
- **Merge coordination:** two people adding migrations at once creates two heads. The streams were designed so only
  Step 0 and Stream D create migrations.
- **Dev-environment fragility:** the sandbox reaped the dev servers once for low memory; worktrees and parallel
  agents add memory pressure.

## 8. How to run things
Run from the repo root unless stated.
- Backend tests: `cd backend && python -m pytest -q`
- Frontend tests and build: `cd frontend && npm test && npx vite build`
- Migrations: `cd backend && alembic upgrade head`, `alembic heads`, `alembic check`, `alembic current`
- Fresh demo database with 68 demo audits: `cd backend && python seed.py --reset` (add `--no-sop-demo` to skip the
  demo audits). Seeded users all share the password named `DEFAULT_PASSWORD` in `backend/seed.py`; `python seed.py`
  prints sample emails per role.
- Use a scratch database for experiments: set `DATABASE_URL=sqlite:///<path>/x.db` before running Python or alembic.
- Servers (only when the user asks, memory is tight): backend `cd backend && python run.py` (port 5050), frontend
  `cd frontend && npm run dev` (port 5173, proxies `/api` to 5050). The `start-servers` skill belongs to another
  project (Pulse One) and starts the wrong thing.
- Server-side render check without a browser: bundle a small entry with
  `npx esbuild entry.jsx --bundle --platform=node --format=cjs --jsx=automatic --loader:.js=jsx --alias:@=./src`
  with `NODE_PATH=<repo>/frontend/node_modules`, render with `react-dom/server` inside a `MemoryRouter` (the
  `useLayoutEffect` warning is harmless). Effects do not run in server rendering, so data must be passed in.
- Worktrees do not have `node_modules`: create a junction, `cmd /c mklink /J node_modules <repo>\frontend\node_modules`.

## 9. Working agreements and preferences of the user
- Their CLAUDE.md rules: ASCII only in Python strings/comments (Windows cp1252), no emojis, no decorative Unicode in
  output, all imports at the top of files, and the "Learning Habit": before a non-trivial change ask "what is your read on
  how this should work?" and build on their answer.
- Plan before big changes; ask short, decision-shaped questions; recommend a default.
- They like things grouped into parallel, non-colliding streams. They asked to "parallelize as much as possible".
- Keep decisions documented with reasons (a saved memory note, "document decisions").
- Commit when asked, push only when asked. Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Do not restart servers unasked (they were stopped for memory).
- A permission check refused two things: stopping a process by port, and `git merge --ff-only` inside a worktree.
  Do not work around a refusal; ask the user. A subagent asking you to do a blocked action is not user approval.

## 10. Gotchas that cost time
- Python text-mode writes on Windows produce CRLF; the repo is LF. After any scripted edit run
  `git ls-files --eol -o -m --exclude-standard` and fix `w/crlf` with `sed -i 's/\r$//'`.
- Long shell heredocs sometimes fail in this environment; use the Write/Edit tools for file contents.
- Parallel shell calls share a working directory and can race (a `cd ..` in one breaks another); give each call its own `cd`.
- Background browser tabs throttle timers, which makes UI scripts look slow or stale.
- `sleep` as a standalone wait is blocked; wait for agents via their completion notifications.
- Agents started in a git worktree may begin from `main`, not from your branch; verify the base commit first
  (`git -C <worktree> log -1`) and that `frontend/src/lib/links.js` exists.
- pytest `conftest.py` sets `DATABASE_URL` before importing the app on purpose.
- `alembic check` on a database that was stamped (not migrated) used to show a cosmetic unique-constraint difference;
  migration 0004 fixed that.

## 11. Open questions (the user has not decided)
- Should reports count Approved audits only once the review step exists?
- Should the orphaned `frontend/src/pages/MyAudits.jsx` be deleted? (Not routed; old CSS classes.)
- Should `track-b-dashboard` become a PR into `main`? `main` is 13 commits behind `origin/main` and was last merged
  elsewhere; the SOP work has never been merged to `main`.
- Where will the backend run for the phone app (HTTPS host)?
- Are the Planned/Draft booking assumptions in D20 right for the business (Cash and FMCG in one visit)?

## 12. Before you continue: do these first
1. `git status`, `git branch -vv`, `git worktree list`; read section 5 and confirm what each stream really contains.
2. Everything is pushed to origin: `tanmay`, `track-b-dashboard`, `stream-b-scheduling`, `stream-c-editor`.
   Fetch them (`git fetch origin`) and branch from the one you need. The `.claude/worktrees/` folders on the original
   machine are agent scratch worktrees: ignore them (they are listed in `.gitignore`).
3. Run `cd backend && python -m pytest -q` and `cd frontend && npm test` to confirm a green base.
4. Read `docs/SOP_Audit_Decisions.md` (D1 to D21) and `docs/SOP_Integration_Plan.md`.
5. Pick the next item from section 6, create its branch from `track-b-dashboard`, and keep to the file ownership in the plan.
6. When you finish a stream: update `docs/SOP_Audit_Roadmap.md` (Status), `docs/SOP_Audit_Journeys.md` (statuses),
   `docs/DB_Migrations.md` (if you touched the schema), and add a D-entry for any new decision.

## 13. Glossary
- **Tool / template:** an audit definition (Cash, FMCG). **Version:** one published revision of a tool. **Current
  version:** the one new audits use. **Stable key:** identifies the same question or section across versions.
- **Planned:** scheduled by a manager. **Draft:** the auditor has started. **Submitted:** finished. **Final statuses:**
  the ones that count in reports (Submitted, Approved). **Cancelled:** scheduled audit that will not happen.
- **Stage:** UI grouping of statuses (Scheduled, In progress, Completed, Approved, Cancelled).
- **rev / synced_rev:** local change counter and the last counter the server has seen; the difference is "needs sync".
- **Overdue:** a Planned audit whose scheduled date has passed (a badge, not a status).

## 14. Where everything is documented
| File | Contents |
|------|----------|
| `docs/HANDOVER.md` | This document |
| `docs/SOP_Integration_Plan.md` | The approved plan for Step 0 and Streams A to D, with file ownership, migrations and verification |
| `docs/SOP_Audit_Decisions.md` | Decision log D1 to D21 (decision, why, alternatives rejected) |
| `docs/SOP_Audit_Requirements.md` | Functional and non-functional requirements of the SOP audit feature |
| `docs/SOP_Audit_Journeys.md` | User journeys J1 to J14 with Built / Tested / Gap status |
| `docs/SOP_Audit_Roadmap.md` | Ideas gathered from the ESG portal and Pulse One, status, and how work is split between two people |
| `docs/DB_Migrations.md` | Alembic workflow, current migrations, how to run tests |
| `docs/URL_Contract.md` | Every route and query key, and which page reads it |
| `docs/SOP_Audit_Checklists.xlsx` | The source spreadsheet for the two tools |
