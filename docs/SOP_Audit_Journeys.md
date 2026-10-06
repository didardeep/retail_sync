# SOP Audits -- User Journeys

Each journey is written from the user's point of view, with the steps, the outcome, and
the current status in the app. Status key:

- **Tested** -- built and exercised end to end in a browser (see notes)
- **Built** -- implemented but not yet exercised on a device or in this exact path
- **Gap** -- not built yet; listed because the journey needs it

Roles: Auditor (visits stores), Audit Manager (runs the programme), Store Manager (is audited).

---

## Auditor journeys

### J1. Run a normal audit in store (online) -- Tested
1. Open SOP Audits, choose the store, then choose Cash or FMCG, then Start audit.
2. For each question: read the question, Best rubric and Least rubric (Average is collapsed), type a score, press Next.
3. Optionally add a comment or photo through "Add proof / comment".
4. After the last question, land on Review: scores by section, running total and percentage.
5. Submit audit, confirm.

Outcome: audit is Submitted on the server with section subtotals, the total and the percentage. The chip shows Synced.

### J2. Audit in a store with no signal, finish later -- Tested (simulated offline)
1. Auditor has opened the app at least once with internet, so stores and audit tools are cached.
2. Starts the audit in the store. The signal drops, or was never there.
3. Keeps answering, adds comments and photos. The chip reads "Offline - N saved on device".
4. Presses Save & exit mid-way (or the app is closed), and comes back later.
5. Resume draft picks up at the question they were on.
6. When a connection returns and the app is open, everything syncs by itself and the chip changes to Synced.

Outcome: no answer, comment or photo is lost; nothing is duplicated.
Not yet checked: closing and reopening on a real phone.

### J3. Fix gaps before submitting -- Tested
1. Auditor skips a question, or leaves out a required comment or photo.
2. On Review, Submit audit is disabled and a banner says how many items need attention. Each is marked in red ("Not answered", "Photo required", "Comment required").
3. Tap a flagged row to jump straight to that question, fix it, return to Review.
4. Banner turns green, Submit audit is enabled.

Outcome: nothing incomplete can be submitted.

### J4. Question does not apply (N/A) -- Tested
1. Auditor ticks N/A on a question (some tools mark questions as N/A by default).
2. The question is removed from the maximum, so the store is not penalised.

Outcome: e.g. Cash maximum drops from 77 to 73 when a 4-mark question is N/A.

### J5. Rules changed while the auditor was offline -- Tested
1. A manager makes a photo mandatory for a question after the auditor's phone downloaded the old rules.
2. The auditor completes the audit and submits offline. The phone accepts it.
3. On reconnect the server refuses it. The audit unlocks back to Draft with a message and, after refresh, the review screen flags exactly which question needs a photo.
4. Auditor adds the photo and submits again.

Outcome: the audit is never silently lost, and the auditor is told what to fix.

### J6. Offline longer than the login lasts -- Built (untested)
1. Auditor is offline for more than 12 hours (for example a multi-day trip), so the login expires.
2. They can keep filling in audits. The chip reads "Sign in again to sync" once a connection returns.
3. They sign in again; queued audits sync.

Outcome: nothing is lost, the queue waits for a valid login.

### J7. Pick up an audit started on another device -- Built (untested)
1. Auditor started a draft on one phone, which synced.
2. On a second device they open the list, tap the draft, and it is downloaded and resumed.

---

## Audit Manager journeys

### J8. Review submitted audits across stores -- Built (dashboard checked with real data, not yet by eye in a browser)
1. Open Dashboard & Analytics, then the SOP Audits tab.
2. See the store ranking, gap by section, where marks are lost, coverage, trend and every audit. Click a store, section or question to focus the rest of the page; chips show what is active and Clear all resets.
3. Click a row in the audits table to open that audit: every score, comment and photo, section by section, read-only.
4. Export CSV downloads the rows currently shown.

Outcome: a manager can compare stores, find the weak sections and questions, spot stores that have not been audited recently, and drill down to the audit.
Still missing: a review/approve step (A1), Excel and multi-store compiled reports (A3).

### J9. Edit the questionnaires, including which questions need proof -- Built (API tested; the editor screen has not been checked in a browser)
1. Manager or admin opens Audit Questions, then the SOP tools tab, and chooses a tool.
2. Edits wording, marks, the Best / Average / Least text, the proof switches, and adds, removes or reorders questions and sections.
3. Reviews the change summary, adds a note and publishes. This creates a new version: audits already done keep the marks and wording they were scored with, and new audits use the new version (see J5).

The old per-question switch endpoint was retired; proof rules change by publishing a version.

### J10. Plan and assign SOP audits -- Built (API and live smoke tested; the pages have not been checked in a browser)
1. Manager or admin schedules a Cash or FMCG audit on the Audit Scheduling page for a store, date and auditor. A clash with the auditor's blocked dates or another store that day is refused with a clear message.
2. The auditor sees it under "Assigned to me", starts it (it becomes a Draft on the first save) and it also works offline once downloaded.
3. It appears on Audit Status for managers, and a cancelled audit stays visible as Cancelled.

Auditors can still start an unplanned audit themselves for ad hoc visits.

---

## Store Manager journeys

### J11. See how my store did -- Built
1. Store manager opens SOP Audits and sees submitted audits for their own stores only.
2. Opens one to see scores, comments and photos. Drafts are not visible.

Outcome: transparency on results. They cannot edit anything.

### J12. Act on what was found -- Gap
1. A low score or a missed question produces an issue assigned to the store manager with a due date (this is how the older checklist audits work).
2. Store manager records the action taken and closes the issue.
3. Audit manager sees what is overdue.

Today SOP audits do not create issues, so the follow-up loop exists only for the older audits. This is the biggest gap between "collecting good data" and "getting stores to improve".

---

## Cross-cutting journeys

### J13. Is my work safe? -- Tested
At any time the sync chip answers it: Saved on device, Syncing, Synced, Offline - N saved on device, Sign in again to sync, Needs attention. Tapping it syncs now.

### J14. Sign out with unsynced work -- Built
Signing out warns that N audits have not synced, and states they remain on the device and sync after signing in again.

---

## Suggested order for closing gaps
1. J12 -- connect SOP results to issues for store managers (turns data into action).
2. J10 -- scheduling and assignment of SOP audits.
3. J9 -- manager screen for proof rules.
4. Real-phone test of J2, J6, J7 once the Capacitor wrapper exists.
