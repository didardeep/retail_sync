# Link SOP audits into the app: clickable pages, scheduling, editable questionnaires

## Context
The SOP audit tools (Cash, FMCG) and their dashboard are built but sit in a silo. Today:
- **Scheduling** (`pages/Scheduling.jsx`) does not really schedule anything: hard-coded auditor names, wrong API fields, errors swallowed, edit/delete are local only. It knows nothing about SOP tools.
- **Audit Status** (`pages/AuditStatus.jsx`) lists only the old Yes/No audits, with fake scores and a made-up detail modal.
- **Audit Questions** (`pages/Questions.jsx`) cannot edit SOP questionnaires; edit/delete there are local only too.
- **Clickability**: most charts, KPI tiles and rows on the older pages do nothing; detail modals have no URL; the bell and gear in `Layout.jsx` are dead; no older page links to SOP audits.

Goal (user's words): make pages/graphs clickable first; let a manager schedule an audit with an SOP tool selected, let the auditor see and run it, and have the results show up; let managers edit the questionnaires on a page.

Decisions already made by the user:
- Schedule on the **existing Audit Scheduling page**.
- Questionnaire edits are **versioned**: editing after audits exist makes a new version; old audits keep their marks and wording.
- Editor scope: **everything** (wording, marks, Best/Average/Least text, proof flags, add/remove/reorder questions and sections), as a tab inside Audit Questions.

Branch: continue on `track-b-dashboard` (based on `tanmay`). Alembic head is `0002`.

## Execution shape
Step 0 first (one change set, serial), then three streams that touch different files and can run in parallel (two people, or parallel agents in isolated worktrees), merged in the order Step 0 -> A -> B/C -> D. Stream D is optional.

## Migrations (the only place two heads could appear)
Only Step 0 and Stream D create migrations. Nobody autogenerates on a stream branch; a stream needing a column asks for the next revision. `alembic heads` must print one line before any merge.

| Rev | Owner | Adds |
|-----|-------|------|
| 0003 sop_audit_scheduling | Step 0 | `sop_audits.scheduled_at` (indexed), `notes`, `created_by_id` (named FK to users) |
| 0004 sop_template_versions | Step 0 | `sop_templates.version` (NOT NULL, default 1), `is_current` (default true), `published_at`, `created_by_id`, `change_note`; drop UNIQUE(code), add `uq_sop_templates_code_version`; `sop_sections.stable_key` and `sop_criteria.stable_key` (nullable, backfill = id, then NOT NULL + index) |
| 0005 chat_turns | Assistant feature (added by Didardeep; migration written during integration) | table `chat_turns` |
| 0006 sop_audit_review | Stream D | table `sop_audit_reviews`; `sop_audits.reviewed_at`, `reviewed_by_id` |

0004 care points: dropping the unique constraint must work on SQLite databases that were *stamped* (unnamed constraint) as well as migrated ones. Use `batch_alter_table(recreate="always", naming_convention={"uq": "uq_%(table_name)s_%(column_0_name)s"})` then drop by name; on Postgres inspect and drop whichever constraint covers `code`. Name the column `stable_key` (API returns it as `key`). Downgrade must refuse when a code has more than one version. Back up `backend/retail_sync.db` before first run (migrations run on app start).

## Step 0 - shared groundwork (one change set)
Backend
- `app/models.py`: columns from 0003/0004; `SopAudit.created_by`; extend `to_dict` (`scheduled_at`, `notes`, `city`, `region`, `template_version`; template `version`, `is_current`; section/criterion `key`).
- `app/services.py`: status constants (`SOP_PLANNED`, `SOP_DRAFT`, `SOP_CANCELLED`, `SOP_AUDITOR_EDITABLE = ("Planned","Draft")`; keep `SOP_FINAL_STATUSES`); `auditor_conflict(db, auditor_id, day, store_id, exclude_*)` checking `AuditorAvailability`, legacy Planned/Ongoing audits and SOP Planned/Draft audits; `current_template(db, code)`.
- `app/routers/audits.py` `schedule_audit` (L51-100): replace its inline checks with `auditor_conflict`.
- `app/routers/sop_audits.py` (only edit before Stream D): `list_templates` returns current+active only; upsert on create requires a current template, on existing audits allows `SOP_AUDITOR_EDITABLE` and flips Planned -> Draft (a Planned audit may keep an older version of the same code); attachment endpoints use the same gate and check the criterion belongs to the audit's template; retire `PATCH /criteria/{cid}` and `api.updateSopCriterion`.
- `app/main.py`: register empty stub routers `sop_schedule.py` (`/api/sop-schedule`), `sop_admin.py` (`/api/sop-admin`), `sop_review.py` (`/api/sop-review`) so streams do not touch it again.
- `seed_sop_demo.py`: use current versions only.

Frontend
- `lib/nav.js`: single list of `{path, page, label, title, icon, group}` + `titleFor()`; `Layout.jsx` NAV/TITLES, `App.jsx` and `rolesMap.js` read from it. Add page key `sop-tools` (managers only). Move SOP Audits higher in the sidebar.
- `lib/statuses.js`: legacy + SOP status lists, `isAuditorEditable`, `stageOf(kind,status)` (Scheduled / In progress / Completed / Approved / Cancelled), badge variants.
- `lib/links.js`: the URL contract every stream codes against (`/audits?stage&kind&store&region&id`, `/scheduling?stage&auditor&id&new=sop`, `/issues?status&priority&store&audit&sop_audit&id`, `/stores?region&format&id`, `/sop-audits?store&tool&status&view=assigned`, `/dashboard?tab=sop&store&tool&section&criterion`, `/questions?tab=sop-tools`, `/questions/sop-tools/:code`) plus `storeScorecardLink(storeId, role)` and `entityLink(type,id)`.
- `lib/useUrlFilters.js`: extract `setFilter/toggle/clearAll` from `SopDashboard.jsx` L47-68.
- `components/SopStatusBadge.jsx`; mechanical swap in `SopAudits.jsx` and `SopAuditReview.jsx`.
- `lib/offline/store.js`: `findDraft` matches by `template_code` + editable status; `saveAnswer` accepts Planned (flips to Draft locally); `refreshReferenceData` marks cached trees the server no longer returns as not current (never deletes); `getTemplates` returns the current version per code.
- `App.jsx`: route `/questions/sop-tools/:code` -> stub `pages/SopToolEditor.jsx`. Stub API files `api/sopSchedule.js`, `api/sopAdmin.js`, `api/sopReview.js`; `client.js` is frozen after this.
- Test harness: `backend/tests/conftest.py` (temp SQLite via `DATABASE_URL`, startup inside `with TestClient(app)` so migrations run, users for each role, run `import_sop`); frontend tests with `node --test frontend/tests/*.test.mjs`. Add pytest/httpx to requirements.
- Docs: `DB_Migrations.md` table, decisions D20 (SOP scheduling statuses; Cancelled not delete), D21 (versioning), URL contract.

## Stream A - clickable pages and navigation (do first)
Owns: `Dashboard.jsx`, `routers/dashboard.py`, `Issues.jsx`, `StoreAuditScores.jsx`, `Stores.jsx`, `AuditLog.jsx`, `SopDashboard.jsx` + `components/sop-dashboard/*` (except `logic.js`), `SopAuditReview.jsx` (after Step 0), `Layout.jsx` (after Step 0), new `components/NotificationBell.jsx`.
Reuse: `Drawer` in `components/Modal.jsx`, `chartKit.clickableBar`, `sop-dashboard/FilterBar`, `useUrlFilters`, `lib/links.js`.
1. `dashboard.py`: add `store_id` to `top_stores`/`bottom_stores`.
2. Overview tab: store bar keeps ids (today `storeBarD` truncates names, L95-100) and links to the scorecard; Top/Bottom rows link; KPI tiles link to `/audits?stage=`; format/region bars link to `/stores?...`; drill drawer uses shared `Drawer`, items become links with a "View all", and fix the risk mismatch (chart counts observations by `risk`, drawer lists issues by `priority`); Recent Issues rows link to `/issues?id=`; label the Power BI mock ("Duplicate of KPI 3" etc.) as Preview.
3. `Issues.jsx`: filters in URL, KPI tiles set filters, audit id links to `/audits?id=`, detail opens from `?id=`.
4. `StoreAuditScores.jsx`, `Stores.jsx`: store names link to scorecard; KPI tiles filter; read `?region= ?format= ?id=`.
5. `AuditLog.jsx`: entity ids link via `entityLink`.
6. SOP dashboard: KPI tiles clickable, move onto `useUrlFilters`; review "Back" = `navigate(-1)`; link review -> store's dashboard.
7. `Layout.jsx`: working bell (managers: submitted SOP audits + overdue issues; auditors: assigned Planned audits; store managers: open issues); remove the gear; avatar menu with Sign out.
Links into `/audits`, `/scheduling`, `/sop-audits` start working when stream B lands.

## Stream B - SOP scheduling and "Assigned to me"
Owns: `routers/sop_schedule.py`, `routers/audits.py`, `Scheduling.jsx`, `AuditStatus.jsx`, `SopAudits.jsx`, `lib/offline/sync.js`, new `lib/auditRows.js`, `api/sopSchedule.js`, `seed_sop_demo.py`.
1. `sop_schedule.py` (manager only): `POST /` `{template_code, store_id, auditor_id, scheduled_at, notes}` (resolve current version, check auditor is an active AUDITOR, `auditor_conflict` -> 409, uuid4 id, status Planned, `log_action`); `PATCH /{aid}` reschedule/reassign/notes while Planned; `POST /{aid}/cancel` (Cancelled; Draft -> 409).
2. `audits.py`: `PATCH /{aid}` and `POST /{aid}/cancel` for legacy Planned audits.
3. `lib/auditRows.js` (pure): `normalizeLegacy`, `normalizeSop`, `mergeRows`, `kpiCounts`, `filterRows` onto one row shape `{kind,id,store_id,store,region,auditor,date,status,stage,score,percent}`.
4. `Scheduling.jsx` rewrite: kind toggle (Checklist audit / SOP tool), tool select from `api.sopTemplates`, store and auditor selects by id (`api.users('AUDITOR')`), real payloads, show 409 messages, edit/cancel call APIs, KPI tiles by stage clickable via `useUrlFilters`, `?id=` opens drawer, `?new=sop` opens form. Reuse existing table/drawer layout.
5. `AuditStatus.jsx`: merged list of both kinds with URL filters (stage, kind, store, region, id); remove fake scores and seeded-random detail; legacy detail loads real responses via `api.audit(id)`; SOP rows show a summary and "Open audit" -> `/sop-audits/:id/review` (or the wizard for the auditor's own Planned/Draft).
6. `SopAudits.jsx`: auditor "Assigned to me" section (Planned/Draft with `scheduled_at`, overdue highlighted), `start()` reuses an assigned audit, filters in URL, managers get "View scores" and "Schedule" buttons.
7. `sync.js`: `syncAssigned()` pulls Planned audits so they work offline, drops never-started local copies the server cancelled/404s, flags a 403 (reassigned) instead of retrying.
8. `seed_sop_demo.py`: add a few Planned audits, one overdue.

## Stream C - questionnaire editor and versioning
Owns: `routers/sop_admin.py`, new `app/sop_versions.py`, `import_sop.py`, `routers/sop_dashboard.py`, `components/sop-dashboard/logic.js`, `Questions.jsx`, `pages/SopToolEditor.jsx`, `components/sop-admin/*`, `api/sopAdmin.js`.
1. `sop_versions.py`: `validate_tree` (marks > 0 in 0.5 steps, unique section codes and keys, no empty sections); `diff_tree`; `publish_version(db, code, tree, user, base_version, note)` in one transaction: 409 if `base_version` is not current, no-op if unchanged, else copy to version+1 with new ids and preserved `stable_key` (new items key = id), recompute `min_points`/`total_marks` with the importer's rules, flip `is_current`, move Planned audits with no scores to the new version, `log_action`.
2. `sop_admin.py` (manager only): `GET /tools`, `GET /tools/{code}/versions/{v}`, `POST /tools/{code}/publish`.
3. `import_sop.py`: build tree from the sheet, match keys by section code + position against the current version, then `publish_version` (idempotent: second run publishes nothing).
4. `sop_dashboard.py`: load all audited versions, one tool per code, criteria keyed by `key`, `criterion_scores` carry `criterion_key`, `previous` keyed by `(store, template code)`.
5. `logic.js`: `buildIndex`, `pareto`, `tableRows` group by `key`; `?criterion=` holds a key.
6. `Questions.jsx`: add Tabs with `?tab=` (copy `Dashboard.jsx` L490-516): "Question bank" and "SOP tools" (managers only via `canAccess(role,'sop-tools')`).
7. `SopToolEditor.jsx`: working copy autosaved to localStorage by `code@base_version`; edit section names; add/remove/reorder sections and criteria with up/down buttons; criterion form (title, marks, Best/Average/Least, default N/A, proof flags); diff summary before publishing ("N changes; 12 audits stay on v1"); read-only view of old versions; handle the stale-base 409. Reuse `Modal`, `fieldClass`, `useToast`.
Rule: drafts finish on the version they started on; only new audits get the current version.

## Stream D (optional, last) - review and issues from SOP audits
Owns: migration 0006, `routers/sop_review.py`, `services.py` (constants + `raise_issues_from_sop`), `sop_audits.py` submit hook, `routers/issues.py`/`Issue.to_dict`, `components/sop-review/ReviewPanel.jsx`, `api/sopReview.js`, `statuses.js` (add Returned).
- A1: queue, approve, return with comment, history; Returned joins `SOP_AUDITOR_EDITABLE`; decide whether reports count Approved only.
- A2: on approve (or submit if A1 not built) raise one issue per low-scoring criterion, idempotent, using the existing `Issue.sop_audit_id`/`sop_criterion_id`, assigned to the store manager with a due date.

## Verification
Servers cannot be assumed running (they were stopped for memory), so most checks run without a browser:
- Backend (TestClient on scratch SQLite): scheduling 200/409 (unavailable, booked, cross-kind clash), non-manager 403, reschedule/reassign, cancel (Draft -> 409), auditor sees Planned, first PUT flips Planned -> Draft, PUT on Cancelled 409, store manager cannot see Planned, dashboard ignores Planned; publish v2 keeps v1 audit scores/wording (`compute_sop_score` on a v1 audit), template list shows only v2, v1 Draft still submits, creating on v1 -> 422, unchanged publish is a no-op, stale `base_version` -> 409, dashboard merges criteria by key and `prev_percent` carries across versions, `import_sop` twice publishes once.
- Migrations: 0003/0004 on a fresh DB; 0004 on a DB built from raw SQL with unnamed UNIQUE then stamped 0001; downgrade refuses with several versions; `alembic check` clean; `alembic heads` one line. Postgres untested - run on a scratch Postgres before relying on it.
- Frontend: `node --test` for `links.js`, `auditRows.js`, `editorLogic.js`, `logic.js` (against real `/api/sop-dashboard` output with two versions); esbuild SSR render of each changed page with fixture data checking expected `href`s and empty states; `vite build`.
- Needs a browser or phone (list for the user): chart hit areas and drawers, the editor itself, offline sync of an assigned audit, a phone holding a cached old version.
- Check line endings with `git ls-files --eol` before every commit (Windows tools can write CRLF).

## Assumptions (tell me if you disagree)
- Same auditor + same store + same day does not clash (so Cash and FMCG can be done in one visit); a booking at a different store on the same day does.
- Cancel, never delete, a scheduled audit (a phone that started it offline would otherwise recreate it).
- Auditors land on `/sop-audits` ("Assigned to me"); orphaned `MyAudits.jsx` is deleted only with your OK.
- Reassigning gives the old auditor's phone a clear "reassigned" notice and keeps their local data.
- Tests are committed (`backend/tests`, `frontend/tests`).
- Reports count Approved only once Stream D exists; until then Submitted + Approved.

## Risks
- Migration 0004 (dropping UNIQUE(code)) is the riskiest change; tested on SQLite only.
- Streams A and B both link into pages the other owns; the URL contract in `lib/links.js` is what keeps them aligned.
- Existing legacy pages contain fake/seeded data (AuditStatus detail, Dashboard Overview trend); this plan removes it from AuditStatus and flags the rest rather than rewriting the Overview.
