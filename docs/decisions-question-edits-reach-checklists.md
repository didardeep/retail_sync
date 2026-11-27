# Decision log: question edits reach checklists

Editing a question saves a new version and marks it current, but checklist items kept pointing
at the version they were added with. New audits copy their questions from the checklist items,
so they never saw an edit. Found when an annexure added to Q001 (now version 6) did not appear on
a new audit: both checklists that use Q001 were still on version 1.

| Decision | Why | Alternatives considered |
|---|---|---|
| When a question is edited, every checklist item on the old version moves to the new version in the same save (`edit_question` in `backend/app/routers/questions.py`). | One place to fix. The checklist editor shows the current wording, and new audits get it with no extra lookup. | Leave checklists alone and look up the current version by code when an audit is created. It also fixes the old data on its own, but the checklist editor would keep showing out-of-date wording. |
| Audits already created keep the version they were made with. | This is the reason versions exist: an answer must stay with the wording it was given against. | Updating open audits to the new version. That would change questions under an auditor mid-audit. |
| Migration 0018 moves checklist items that are already behind onto their question's current version. Downgrade does nothing. | Fixes every checklist that was edited before this change. The old pointers were the bug, so there is nothing worth restoring. | A one-off script, which is easy to forget on the site database. |
| The migration picks the highest current version if a code ever has two current rows, and leaves an item alone if its code has no current version. | Safe on both SQLite and Postgres, and never sets an item to nothing. | Failing the migration. |

| Planned audits with nothing answered also move to the new version on an edit. Migration 0020 did the same once for audits scheduled before this. | Questions are copied when an audit is scheduled, so a planned audit would otherwise keep old wording until it ended (AUD-1094 had Q001 v1). Nothing has been answered, so nothing is lost. | Also moving unanswered questions in Ongoing audits: a phone with an offline copy would still show the old wording, so wording could differ between the phone and the server. Leaving planned audits alone. |
