# Decision log: question version control

Managers need to know who changed a question, when, why and what changed, which audits
used which version, and to be able to go back. Auditors do not need any of it: an audit
always shows the wording it was answered with.

| Decision | Why | Alternatives considered |
|---|---|---|
| Each question version stays a full row (like a git commit). Two columns were added: `edited_by_id` (author) and `change_note` (optional message). Migration 0019. | The table already stored full snapshots, so only the author and the reason were missing. | Real git on exported files: two sources of truth, no SQL joins for "which audits used v3", and locking for many users. SQLAlchemy-Continuum: shadow tables for every model; worth it only if stores, users and others need the same history. |
| What changed is worked out when someone looks, by comparing two snapshots field by field (`_changes` in `routers/questions.py`, `compareVersions` in `lib/questionVersions.js`). Nothing extra is stored. | Like `git diff`: snapshots hold everything, so a stored diff could only disagree with them. | Storing a diff with each version. |
| Saving with nothing changed creates no version. | The page sends the whole form; without this every Save made a new version and claimed every field changed. | Always creating a version. |
| Editing a version that is no longer current is refused (409, names who changed it). | Two managers with the same question open could silently overwrite each other. Same idea as git refusing a push that is behind. | Last save wins. |
| Restore copies an old version's content into a new current version; nothing is deleted. Checklists follow it like any edit. | History is never rewritten (like `git revert`), and the restore itself shows up in the history. | Making the old row current again, which loses the record of the change. |
| One helper (`_save_version`) makes every new version, for edits and restores. It also copies the fields the edit form does not send. | The old edit code dropped photo/video, data analyst, data analyst reference and annex reference on every edit (visible in Q001 v2). | Fixing only the edit endpoint. |
| The audit log entry for an edit now records the real changes (`{field: [old, new]}`), the note, and the new version's id. | The old entries listed every field sent and had an empty id (the log was written before the id existed). | Keeping the field list. |
| Past authors were filled in from the audit log, matched on the code and version in each entry; first versions use whoever proposed the question; imported questions show "Imported". | Gives real history for edits made before this change. | Leaving old versions without an author. |
| UI: a "Change history" button in the Audit Questions toolbar (managers only) opens a side panel listing every change, newest first, with filters for person, period and text. Not a tab: the question bank stays the page's only view. Clicking a change opens the version panel on top (closing it returns to the list): versions with author, date, reason, what changed and how many audits used each (expandable to the list), a compare of any two versions, and Restore. The edit dialog has an optional "Reason for change" and a "View history" link. | Keeps the question list unchanged (no extra buttons per row) and answers both "what changed recently" and "what happened to this question". | A history button on every row; a separate page; a "Change history" tab beside the question bank (tried first, dropped as too prominent). |
| The audit review page shows a badge such as "v1, now v6" on answers given on an older version. | The reviewer sees it where it matters, and the current version needs no badge. | Showing the version on every question. |
| Reason for change is optional. Restore is for Audit Manager and Admin, the same people who can edit questions. | A required box gets filled with "update". | Required reason. |

## Not included
Dashboard markers where a question changed (parked). The same history for checklists, whose
versions are linked by name and break when a checklist is renamed.
