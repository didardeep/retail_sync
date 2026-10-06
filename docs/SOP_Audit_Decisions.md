# SOP Audits -- Decision Log

Each entry: decision, why, alternatives rejected. New decisions are appended as they are made.
Entries marked (user) were chosen explicitly by the product owner.

## D1. New `sop_*` tables, separate from the existing Question/Checklist/Audit model
- Why: the SOP model is marks plus a 3-level rubric. The existing model is Yes/No/Partial with weights. There is no Alembic, so altering existing tables forces a DB reset and risks breaking the current audit flow.
- Rejected: extending `Question`/`AuditResponse` with new columns; mapping Max/Avg/Min onto Yes/Partial/No (wrong for FMCG's one-third minimum and for typed scores).

## D2. Templates are imported from the xlsx, not hard-coded
- Why: the business owns the audit tools in Excel. A new or revised tool should be a data import, not a release.
- Rejected: hard-coded JSON in the frontend; a manual admin form for entering criteria.

## D3. Auditor types a score (0..marks, steps of 0.5); rubric points are guidance only (user)
- Why: allows partial performance that falls between rubric levels.
- Rejected: tap-to-pick Max/Avg/Min (consistent but rigid); pick plus override.

## D4. Rubric guide points stored per criterion, with a per-template minimum rule
- Why: the two sheets define "Minimum" differently (Cash = 0, FMCG = one third of marks), so one global rule would be wrong.
- Rejected: treating minimum as 0 everywhere.

## D5. N/A removes a criterion from the maximum; criteria titled "(N/A)" default to N/A
- Why: matches the sheet. FMCG states a total of 92, which is 100 minus the two 4-mark N/A items.
- Rejected: scoring N/A as 0, which unfairly lowers the percentage.

## D6. One question per screen; Next saves the answer (user)
- Why: fits a phone screen, focuses the auditor, gives a natural save point per answer.
- Rejected: one long scrolling form per section.

## D7. Explicit review screen before submit (user)
- Why: catches unanswered criteria and missing proof before the audit is locked.
- Rejected: submitting straight from the last question.

## D8. Proof rules configurable per criterion (user)
- Why: some checks (e.g. float cash) always need evidence, others rarely do.
- Rejected: always optional (weak audit trail); required whenever score < max (too much friction).

## D9. Capacitor wrapping the existing React app (user)
- Why: one codebase for web and mobile, reuses components, native camera and network plugins.
- Rejected: React Native/Expo (full UI rewrite); PWA only (no app-store distribution, weaker camera).

## D10. Offline-first: write to IndexedDB first, sync through an outbox
- Why: stores have poor connectivity and a lost audit is costly. A local write makes Next instant and survives app kill or reboot.
- Rejected: online-only with error toasts; localStorage (size limits, no Blobs for photos).
- Implementation note: IndexedDB is accessed via the small `idb` wrapper (smaller than Dexie, same capability for our needs).

## D11. Client-generated UUIDs, idempotent PUT upsert, idempotent submit
- Why: an audit can be created fully offline, and sync retries never create duplicates.
- Rejected: server-assigned IDs (need connectivity to start); POST create plus separate update.

## D12. Photos compressed on the device before storing and uploading
- Why: phone photos are 3-8 MB; store mobile data and device storage are limited.
- Rejected: uploading originals.

## D13. Store managers read-only on their stores' audits; auditors see only their own
- Why: follows the existing RBAC scoping in `audits.py`.
- Rejected: hiding SOP audits from store managers entirely.

## D14. Offline queue survives token expiry; logout warns about unsynced items
- Why: the JWT lasts 12 hours and an auditor can be offline longer. Unsynced work must never be silently discarded.
- Rejected: clearing local data on logout or expiry.

## D15. Sync driven by revision counters on local records, not a separate queue; `idb` instead of Dexie
- Why: every local edit bumps `rev`; a push records `synced_rev` as of the revision it sent, so an edit made while a request is in flight is never marked synced and lost. No second structure has to be kept in step with the data. `idb` is a thin IndexedDB wrapper, smaller than Dexie, and all that is needed.
- Rejected: an explicit outbox table (two places to keep consistent); Dexie (extra weight for no benefit here).
- Supersedes the wording in D10 about an "outbox".

## D16. Login session stored in localStorage instead of sessionStorage
- Why: the mobile app can be killed and reopened; the auditor must still reach their unsynced audits. The JWT still expires after 12 hours server-side.
- Cost: on the web, the login now survives closing the tab, for everyone.
- Rejected: keeping sessionStorage (login lost on app restart).

## D17. Alembic migrations replace create_all; constraints use a naming convention
- Why: `create_all` never alters existing tables, so every schema change meant resetting the database, which does not work with two people developing or with real data. Alembic adds columns in place. Named constraints are required so later migrations can drop or change them on SQLite as well as Postgres.
- Behaviour: the app runs `alembic upgrade head` on startup. A database created before migrations stops with a clear message (rebuild with `seed.py --reset`, or `alembic stamp 0001`). All `--reset` scripts go through `reset_db()`, which also drops the version table.
- Rejected: keep `create_all` and reset the DB for each change; hand-written ALTER scripts.
- Status: tested on SQLite only.

## D18. Issues link to SOP audits through new columns, not the old audit_id
- Why: `Issue.audit_id` is a foreign key to the old `audits` table; SOP audits live in `sop_audits` with UUID ids. Added `issues.sop_audit_id` and `issues.sop_criterion_id` (migration 0002) so an issue can point at the audit and the exact criterion that raised it, and be queried by them.
- Rejected: storing the link only in `Issue.meta` (no foreign key, hard to query).
