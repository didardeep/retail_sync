# Decision log: brands, auditees, issue assignment, dashboard (issues 1, 2, 3, 4, 7)

| Decision | Why | Alternatives |
|---|---|---|
| A store belongs to exactly one brand (Store.brand_id, NOT NULL) | Matches how banners work; makes per-brand averages unambiguous | Many-to-many store/brand; nullable brand |
| A brand is a banner / chain name | User decision | Parent company, region group |
| Existing and unbranded stores go to a brand called 'Unassigned' (migration 0007, Excel import, store create) | brand_id can be NOT NULL without losing data; managers move stores later | Block the import; leave null |
| Many auditees per store via a user_stores link table; store managers keep Store.manager_id | User decision; a manager is one person per store, auditees are a team | Single auditee column on Store; reuse manager_id |
| New role AUDITEE; sees only issues assigned to them (plus their linked stores); closed to audits, scores, observations, questions, chat | Persona doc: a focused list, nothing else | Give auditees the store manager pages |
| Brand create/update is for AUDIT_MANAGER and ADMIN; any staff can list brands | Issue 3 permissions | Admin only |
| Store format stays master data only (issue 1 closed) | User decision | Checklist question confirming format |
| Issues are never created automatically; the old auto-raise of failed critical questions on submit was removed | User decision: the auditor chooses per question and picks the assignee | Keep auto-raise for critical questions |
| Raise issue works on any answered question (not only No); assignee must be an active auditee linked to the audit's store, checked on the server (422 otherwise); one issue per question | Issue 7 ("or any answer the auditor picks") | UI-only check; allow several issues per question |
| Generic issue create/update applies the same linked-auditee rule when the assignee is an auditee | Closes the back door around the raise endpoint | Rule on the raise endpoint only |
| Auditee can set Open / In Progress / On Hold / Resolved and write a free-text reply (action_taken); the audit manager closes; each change is kept in issue meta history | Answers "who confirms it is closed"; manager sees status changes | Auditee closes; separate comments table |
| Store managers now see issues assigned to them and every issue at the stores they run | Persona doc pain point (they saw only issues assigned to them) | Keep assigned-only |
| Per-brand trend is served by GET /api/dashboard/brand-trend (brand and store filters), from quarterly store scores; score 0 or blank is "not scored" and left out of averages | One tested source for the chart; unscored stores do not drag a brand down | Compute on the client; use audit scores |
| Trend toggles (brand chips, store list) change only the trend chart; the header selector filters the whole page | Keeps the "number equals its list" rule for every other widget | Make the toggles page-wide |
| Dashboard scope is one of: all, brand, store, in the URL (?brand= / ?store=); single store renders the store view under the same heading and selector | One outline for every scope | Separate pages |
| One wording set (lib/dashboardScope.js wording()) used by the Overview and the store view, following the issue 4 table | Same section never has two names | Per-page titles |
| Top observations rank by how often the same text was recorded; repeat issues are titles raised more than once, ranked by repeats; single store shows most recent observations (highest sheet number, observations have no date) | Old lists were the first rows and the newest issues, not rankings. These lists are computed in the browser from the same records the other widgets use; there was no backend query behind them | Backend aggregation endpoint |
| Brand line colours are fixed by alphabetical brand order from the validated categorical palette, with a distinct marker per brand and a table view | Filtering must not repaint lines; colour is not the only cue | Cycle colours by visible order |
| Trend and KPI tiles may differ: trend uses imported quarterly scores, tiles count audits; the trend card says so | Making them agree needs a decision on the score source (open question 8 in the personas doc) | Switch the trend to audit scores |
