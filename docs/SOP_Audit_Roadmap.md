# SOP Audits -- Improvement Roadmap

Ideas gathered by reading two sibling projects (code and docs only; neither was run):

- **ESG portal** (`E:\KPMG\Sustainability`) -- Maker/Checker data collection, review, analytics, reporting.
- **Pulse One** (`E:\KPMG\large_acc`) -- large account deal management: navigation, global search, role dashboards.

Each item says where the idea came from, so the reasoning can be re-checked.
Status: all items below are NOT built unless noted.

## A. Workflow and data (from the ESG portal)

| # | Item | Why | Source |
|---|------|-----|--------|
| A1 | Manager review: approve or return an audit with comments; auditor sees the status and can fix and resubmit; only approved audits count in reports and reach the store manager | ESG's Maker/Checker step. Today a submitted audit is final with no second pair of eyes | ESG `review_router.py` (submit / approve / return / comments) |
| A2 | Issues from low scores: a failed or low-scoring criterion raises an issue for the store manager with a due date | Closes the loop (journey J12). The older audits already do this; SOP audits do not | Existing `services.raise_issue_from_response` |
| A3 | Export: download one audit, or a compiled multi-store report, as Excel | ESG's "Generate report" workbook | ESG `generate-report` |
| A4 | Tool admin screen: edit questions, marks, rubric text and proof flags in the app instead of re-importing the Excel | ESG's questionnaire editor. Flags can only be set via API today | ESG `QuestionnaireEditor.tsx` |
| A5 | Scheduling and assignment of SOP audits (journey J10) | ESG's admin assigns who does what; managers cannot plan coverage today | ESG `AssignModulesDrawer.tsx` |
| A6 | Seed demo data: a handful of finished audits across stores and dates, so dashboards are not empty | ESG seeds a full demo organization | ESG `seed.py` |
| A7 | Compare with the previous audit of the same store ("up 6 points since last visit") | ESG roll-forward and prior-year comparison | ESG `roll-forward` |

## B. SOP dashboard (from Pulse One and ESG)

Pulse One's Leadership dashboard is the model. Ideas to take:

| # | Item | Why | Source |
|---|------|-----|--------|
| B1 | **Cross-filtering**: click a store, region or section bar and every other widget and the table filters to it, with a visible "N of M" count and a Clear button | Makes charts clickable instead of decorative | Pulse `LeadershipPanel.jsx` (`selectedAccountIds`, "Click to filter") |
| B2 | **Pareto view**: which stores or which criteria account for most of the lost marks (the 80/20) | Points managers at the few places that matter. For SOP: "criteria failing most often across stores" | Pulse revenue concentration / Pareto |
| B3 | **Gap to best-in-class** by section and store (score vs max), the same way Pulse shows actual vs budgeted margin | Section-level gaps show where to coach | Pulse "Margin Gap" |
| B4 | **Freshness and coverage panel**: last audit date per store, stores not audited in N days, period covered | Tells readers whether the numbers can be trusted | Pulse "data freshness" dialog |
| B5 | **At-risk table**: searchable, sortable, filterable, click a row to drill to the store, then the audit, then the question | Dashboards should end in an action | Pulse at-risk table |
| B6 | Role tabs on one page with the tab in the URL (`?tab=`) so back button and shared links work | Pulse `DashboardsPage.jsx` | Pulse |
| B7 | Clean up Retail Sync's existing Dashboard labels. `Dashboard.jsx` contains strings such as "Duplicate of KPI 3" and "KPI 1 Summary"; check whether these are visible and give them meaningful names | Pulse's own to-do shows KPI names and order matter to readers | Pulse `leadership_dashboard_todo.txt` |

Cautions from Pulse One itself:
- Its Leadership panel is one 1,500-line file. Build ours as small widget components.
- Its Finance dashboard is thin (one chart, almost no clicks), so "more charts" is not the goal; clickable, filterable charts are.
- Its dashboard to-do shows renaming and re-ordering KPIs late. Agree KPI definitions early.

## C. Navigation and clickability (from Pulse One)

| # | Item | Why | Source |
|---|------|-----|--------|
| C1 | **Global search** (Ctrl/Cmd+K): jump to any page, store, audit or issue | Pulse indexes pages, accounts, projects and invoices (server-side for large lists) | Pulse `GlobalSearch.jsx` |
| C2 | **One shared nav definition** feeding both the sidebar and search, so they cannot drift | Retail Sync has the sidebar list in `Layout.jsx` and page titles in a separate map | Pulse `navTargets.js` |
| C3 | **Grouped, collapsible sidebar sections** | Retail Sync has a flat list of 10 items and will keep growing | Pulse `AppSidebar.jsx` |
| C4 | **Working notification bell** with unread count and a dropdown linking to the item | In `Layout.jsx` the bell and the settings gear are buttons with no action | Pulse `DashboardLayout.jsx` |
| C5 | **URL-based state**: filters, selected store and open record live in the URL, so back, refresh and shared links work | Retail Sync pages use no URL parameters for filters | Pulse `useSearchParams` in `DashboardsPage.jsx` |
| C6 | **Detail pages with ids in the URL** (store, audit, issue) and whole rows clickable | Retail Sync records open in modals and drawers with no address | Pulse `/projects/:id`, `/accounts/:id` |
| C7 | **One reusable filter bar** (search, dropdowns, Export) used by every list | Consistent behavior, less duplicated code | Pulse `FilterBar.jsx` |
| C8 | Light/dark theme toggle (low priority) | Pulse has `useTheme` | Pulse |

## Suggested order

1. **A1 + B1/B5**: review step and a clickable store dashboard. Together they make the tool feel finished.
2. **A6**: seed data, so everything above is demonstrable.
3. **C4, C5, C6**: the dead bell and URL-less pages are the most visible rough edges.
4. **A2, A3**: issues from low scores and export.
5. **B2, B3, B4, A7**: the deeper analytics.
6. **C1-C3, A4, A5**: search, grouped nav, tool admin, scheduling.
7. Capacitor phone wrapper, after the web app is settled.

## Status (branch `track-b-dashboard`)

Built, first slice of Track B:

| Item | State |
|------|-------|
| A6 demo seed data | Done: `backend/seed_sop_demo.py`, runs from `seed.py` (skip with `--no-sop-demo`) |
| A7 change vs previous audit | Done: per audit and as an average tile |
| B1 cross-filtering | Done: click a store, section or question bar; chips and Clear all |
| B2 Pareto | Done: marks lost per question with cumulative line |
| B3 gap by section | Done |
| B4 coverage / freshness | Done: stores with no audit in 30 days |
| B5 at-risk table | Done: sortable, searchable, click row opens the audit, "scored low on this question" list |
| B6 tab and filters in the URL | Done (`?tab=sop&tool=...`) |
| A3 export | Partly: CSV of the audits table. Excel and compiled multi-store report not done |
| B7 clean-up of old dashboard labels | Not done |
| C1-C8 navigation | Not started |

Verified without a browser: calculations (Node tests against real API output), every widget rendered on the server with real data in six filter states, production build, API access rules (manager only), and the earlier SOP API regression test. **Not yet checked by eye in a browser**: layout, chart appearance, click behaviour on real charts.

## Splitting the work between two people

Goal: two tracks that touch different files, so merges are boring.

### Step 0 (before anyone branches, ~1 hour, together)
1. ~~Commit the current SOP base to `tanmay`.~~ **Done** (three commits: backend, frontend, docs). Both tracks branch from the commit after the migrations commit.
   ~~Add Alembic and the issue link columns.~~ **Done**: see `DB_Migrations.md`. Both people must run `alembic upgrade head` (or `python seed.py --reset`) after pulling.
2. Agree the **contract** both sides code against:
   - Audit status values: `Draft`, `Submitted`, `Returned`, `Approved`. Dashboards count `Submitted` and `Approved` until review exists; keep that list in one constant in `services.py` so it changes in one place.
   - Response shapes of the new endpoints (below), written as examples in this file.
3. Agree file ownership (table below). Anyone needing a change in a file they do not own asks the owner, or makes a one-line change in its own small PR.
4. Split the API client: each track adds its methods to its own new file (`api/sopReview.js` for A, `api/sopDashboard.js` for B) instead of both editing `client.js`.

### Track A -- Review and follow-up workflow (backend-heavy)
| Item | What |
|------|------|
| A1 | Manager review: approve / return with comments, auditor resubmits |
| A2 | Issues from low-scoring criteria |
| A4 | Tool admin screen (edit questions, marks, rubric, proof flags) |
| A5 | Scheduling and assignment of SOP audits |

Owns: `models.py` (append only), `schemas.py`, `routers/sop_audits.py` (extend), new `routers/sop_review.py`, new `routers/sop_admin.py`, `pages/SopAuditReview.jsx`, new pages `SopReviewQueue.jsx`, `SopToolAdmin.jsx`, `SopSchedule.jsx`.

### Track B -- Dashboard, navigation and demo data (frontend-heavy)
| Item | What |
|------|------|
| B1-B5, B7 | SOP dashboard: cross-filter, Pareto, gap, freshness, at-risk table, label clean-up |
| A7 | "vs last audit" figures (computed in the dashboard endpoint) |
| A3 | Export (multi-store compiled report; single-audit export reuses it) |
| A6 | Demo seed data (new `seed_sop_demo.py`) |
| C1-C8 | Navigation: shared nav definition, grouped sidebar, working bell, URL state, detail pages, filter bar, search |

Owns: `Layout.jsx`, `App.jsx`, `rolesMap.js`, new `routers/sop_dashboard.py` (read-only), new `routers/sop_export.py`, new dashboard and export pages and components, `seed_sop_demo.py`, `Dashboard.jsx`.

### Where the tracks could collide, and the fix
| Shared file | Risk | Fix |
|-------------|------|-----|
| `Layout.jsx`, `App.jsx`, `rolesMap.js` | A adds pages that need a nav entry and route while B restructures navigation | B does C2 (shared nav definition) **first**, in the first day or two. A then adds its entries to that one list, one line each. Until it lands, A uses a temporary route and merges the nav entry later |
| `main.py` | Both register a new router | One line each at different places; trivial merge. Or do it in Step 0 with empty stub routers |
| `models.py` | Only A changes it, but B's seed script reads new fields | B seeds only `Draft`/`Submitted` rows until A1 lands, then adds `Approved` rows |
| `routers/sop_audits.py` | B needs read queries | B writes its queries in its own router files, never in this one |
| Audit status meaning | A introduces `Approved`; B counts what is "final" | The one constant described in Step 0 |
| `SopAudits.jsx` (list page) | A wants a "review" status badge, B wants URL filters | B owns the file; A sends a small change or waits for the URL-state work |

### Issue link (affects A2) -- decided and built
`Issue.audit_id` is a foreign key to the **old** `audits` table, and SOP audit ids are UUIDs in a different table. Decision: add `Issue.sop_audit_id` and `Issue.sop_criterion_id` (migration 0002). SOP-sourced issues set these and leave `audit_id` / `response_id` empty. Alembic now exists, so further columns no longer need a database reset: each track adds its own migration (see `DB_Migrations.md`, including how to avoid two heads).

### Independent of both (anyone, later)
- **Capacitor phone wrapper:** touches only new files (`android/`, Capacitor config) plus `package.json`. It also needs a backend reachable over HTTPS and is best started once the web app is stable.
- Real-device testing of journeys J2, J6, J7.

### Rough balance
Track B is larger (dashboard plus navigation plus export plus seed). If it runs long, hand C1-C3 and C8 (search, grouped sidebar, theme) to whoever finishes Track A first; they are the most self-contained.

## Not decided
- Whether SOP audits should feed the existing dashboard or get a new one (B-series assumes a new SOP tab on the existing Dashboards area).
- Whether managers approve every audit or only those below a score threshold (A1).
