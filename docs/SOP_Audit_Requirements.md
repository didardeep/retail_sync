# SOP Audits -- Requirements

Source: `docs/SOP_Audit_Checklists.xlsx` (Cash Audit Tool: 5 sections, 21 criteria, 77 marks; FMCG Audit Tool: 5 sections, 23 criteria, 92 marks after excluding two N/A criteria). See `SOP_Audit_Decisions.md` for the reasoning behind each choice.

User journeys (with built / tested / gap status): see `SOP_Audit_Journeys.md`.
Improvement ideas and suggested order: see `SOP_Audit_Roadmap.md`.

## Flow
1. Auditor selects a store, then an audit tool (works offline from cached data).
2. One criterion per screen, grouped by section. Each shows the question, the best-score rubric with points, the least-score rubric with points, an optional average rubric, a score box, N/A toggle and an "Add proof / comment" button.
3. Next saves the answer and advances. Save & exit is always visible.
4. A review screen lists every section and flags problems. Submit locks the audit.

## Functional requirements

### FR-1 Templates
- 1.1 Tools, sections and criteria are imported from the xlsx; adding a tool is a data import.
- 1.2 Each criterion stores title, marks, max/avg/min text, guide points (max = marks, avg = marks/2 or none if "NA", min = 0 for Cash or marks/3 for FMCG), default N/A flag, requires_comment, requires_photo.
- 1.3 An Audit Manager can toggle requires_comment / requires_photo per criterion.

### FR-2 Start / resume
- 2.1 Select store, then tool, then start. Works offline if stores and templates are cached.
- 2.2 An existing draft for the same store and tool is offered for resume instead of creating a duplicate.
- 2.3 Home lists the auditor's drafts and recent submissions.

### FR-3 Question screen
- 3.1 Shows section, title, max points, Best rubric, Least rubric, collapsible Average rubric.
- 3.2 Score input `[ __ ] / N`, numeric keypad, range 0..N, step 0.5, inline error when out of range.
- 3.3 N/A toggle disables the input and removes the criterion from the maximum.
- 3.4 Proof sheet: comment box, camera/gallery picker, thumbnails, removable.
- 3.5 Next saves locally, queues for sync, advances. Prev goes back. Section jump menu.
- 3.6 Save & exit always visible; answers also saved on blur and when the app is backgrounded.
- 3.7 Progress: "Section B - Q3 of 5" plus overall bar (answered / applicable).
- 3.8 Sync chip: Saved on device / Syncing / Synced / Offline.

### FR-4 Review and submit
- 4.1 Review groups criteria by section with subtotals, total and percentage.
- 4.2 Flags unanswered criteria and missing required proof; tapping jumps to the question.
- 4.3 Overall remarks field.
- 4.4 Submit enabled only when nothing is flagged; confirm dialog.
- 4.5 Offline submit becomes "Submitted - pending sync", locked locally, sent on reconnect.
- 4.6 Submitted audits are read-only with a section-wise summary.

### FR-5 Sync
- 5.1 Automatic on reconnect plus manual "Sync now".
- 5.2 Retry with backoff; failed items stay queued.
- 5.3 Writes are idempotent via client UUIDs.
- 5.4 Queue is kept if the token expires offline.

### FR-6 History and roles
- 6.1 History filterable by store, tool and status.
- 6.2 Auditors: own audits. Store Managers: their stores, read-only. Audit Managers: all.
- 6.3 Create, submit and proof-rule changes go to the audit log.

## Non-functional requirements
- Durability: every answer is written to IndexedDB before the UI advances; no loss on network drop, app kill or reboot; request persistent storage.
- Performance: question-to-question under 100 ms with no network wait; photos compressed on device (longest side 1600 px, about 300 KB); works on low-end Android.
- Usability: one-handed, 44 px tap targets, sticky bottom action bar, numeric keypad, readable at 360 px width, light/dark theme.
- Security: server-side role and ownership checks on every endpoint; attachments only via authenticated endpoints; no passwords stored on device; logout warns if unsynced items exist.
- Integrity: server validates score range, required proof and status transitions (Draft to Submitted only); client and server timestamps both kept.
- Compatibility: Android 8+ and iOS 14+ via Capacitor; same build in desktop browsers.
- Maintainability: data-driven templates; offline layer isolated in `frontend/src/lib/offline`; ASCII-only Python strings.
- Configurability: API base from `VITE_API_BASE` (relative `/api` on web, absolute in the mobile build).
