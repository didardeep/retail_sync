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
| M7 | The manager only reviews: no evidence upload on an issue denial, and no annexure filing on the review page. The manager's issue view shows the evidence the assignee provided inside the "Action taken" panel, with a count. | Asked for by the user: the manager looks at evidence, the people doing the work provide it. | Keeping Didar's optional "evidence for a denial" picker. |
| M8 | The new-issue assignee list shows only the auditees of the chosen store, and is disabled until a store is picked. | The server refuses any other auditee, so listing them only produced a failed save. | Listing everyone, as before. |
| M9 | An audit sent back is shown to the auditor in four places: a "Changes requested" tile on their dashboard (counted there instead of under "In progress"), a "Changes requested" status in the Audit list with a matching filter, an amber action-needed line at the top of the bell, and, inside the audit, a panel listing every flagged question with its reason and category, a quick-jump rail, and a "Submit changes" button. | The user found the old yellow box did not say which questions, the auditor got no clear sign it was back, and submitting meant going through the review step. | A bigger banner only. |
| M10 | While fixing, Next and Back move between the flagged questions only; after the last one the button becomes "Submit changes", which submits directly and asks for confirmation if a flagged question is still unchanged. A question counts as changed once the auditor saves anything on it (kept per return in session storage). | Stepping through locked questions was pointless, and the review step added nothing for a fix. | Walking through every question as before. |

## Not ported (on purpose)

The standalone store page, my people / reassign / schedule dialogs and endpoints, the separate
`store_auditors` table and its two migrations, and my question changes (Didar's cover them).
