# Plan: merging the tick-based review onto Didar's branch

Two people built the Audit Manager TODO in parallel. This branch (`review-on-didar`) starts from
`origin/didar` and adds only the parts the other side did not have. The earlier local work is kept
in the branch `tanmay-snapshot` for reference.

## What came from where

| Area | Source | Note |
|---|---|---|
| Brand onboarding, store catalog, store people, create and hand over people, reassign auditor, scheduling suggestions, question reject reason and save confirmation | `didar` | Kept as is. |
| Auditor-to-store link | `didar` | Reuses `user_stores`; the role says auditor or auditee. The separate `store_auditors` table was dropped. |
| `Changes Requested` status, queried-only editing, review categories, issue approve / deny | `didar` | The tick-based review sits on top of them. |
| Review page with a tick box and a reason per question, evidence counts, Approve / Return for fixing / Reject at the end | this branch | `POST /api/audits/{id}/decision`, migration `0012`. |
| `Rejected` status | this branch | Final, not scored. |
| Pending Approval page | this branch | `/approvals`. |
| Issue view for the manager: read-only, with approve / deny, a reassign picker and evidence counts; reassign recorded in the history | this branch (UI) on `didar` (API) | |
| Auditors linked to the stores they already audit | this branch | Migration `0013` and `seed.py`. |
| PWA (manifest, icons, service worker, `npm run pwa`) | this branch | See `decisions-pwa.md`. |
| Question-code generator no longer breaks on codes that are not `Q###` | this branch | Small fix in `questions.py`. |

## Decision log

| # | Decision | Why | Alternatives rejected |
|---|----------|-----|-----------------------|
| M1 | Start from `origin/didar` and add this branch's unique parts. Chosen by the user. | Their branch already has the shared plumbing, tested; merging two designs of it meant 17 conflicting files and two migration heads. | Merge `didar` into the old branch and resolve every conflict by hand. |
| M2 | A ticked question becomes a `query`, and Return for fixing becomes `Changes Requested`. | The auditor screens, notifications and locking already work on those states. | A separate `fix` status (the earlier design): two parallel ways to send work back. |
| M3 | The manager page keeps Didar's "what is wrong" category on each ticked question. | The TODO lists it, and it was already in their data model. | Dropping it to keep the page simpler. |
| M4 | Reassigning the auditor stays where Didar put it (Audit list row and drawer). The earlier reassign dialog was not ported, so the review page has no reassign button. | One reassign screen, not two. | A second entry on the review page. |
| M5 | The store page stays Didar's tabbed Store Insights dialog, not a separate `/stores/:id` page. | Same data; their People tab already adds, creates, removes and hands over work. | Porting the standalone page. |
| M6 | A data migration (`0013`) links each auditor to the stores they already audit, and `seed.py` does the same. | Without it every store shows "no auditor" until someone links one by hand. | Leaving the links empty. |

## Not ported (on purpose)

The standalone store page, my people / reassign / schedule dialogs and endpoints, the separate
`store_auditors` table and its two migrations, and my question changes (Didar's cover them).
