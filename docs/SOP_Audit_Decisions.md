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
