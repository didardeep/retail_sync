# Decision log: annexure tables on questions

An annexure table is a small grid the auditor fills in under one question (for example cash
counted per counter). It is separate from the older "Supporting annexures" panel, which files
whole documents against an audit.

| Decision | Why | Alternatives considered |
|---|---|---|
| The layout lives on the question (`Question.meta["annexure"]`), set once by the audit manager. | Every checklist that uses the question gets the same table, and a question edit already creates a new version, so finished audits keep the layout they were filled with. | Per checklist: more flexible but the same question could need configuring several times. |
| No new tables. The layout is JSON in `meta`; the filled rows are a JSON column on the answer (`audit_responses.annexure`, migration 0015). | The shape is small and always read and written together with the answer. Works the same on SQLite and Postgres. | A table per annexure/row/cell: allows SQL reporting on cells, but needs joins everywhere for little gain now. |
| Each column is text or number. Cells are stored as the typed text; a number column accepts a number or nothing. | Lets the auditor type "1,500" as written, and still keeps numeric columns clean for later totals. | Text only (simplest, but no check); typed values (loses what was typed). |
| Row names are optional. Named rows are only a starting point: the auditor can rename or delete any row. | The manager's decision. Matches how a spreadsheet behaves and avoids blocking an auditor when a store has a different number of counters. | Locked named rows. |
| "Default rows" sets how many rows show at the start; named rows beyond it still all show. | Matches the request: the manager picks how many empty rows appear. | None. |
| The table saves like remarks: it goes through the existing offline queue with the answer, and the audit's normal Submit sends everything. | Works with no signal, no second submit step to forget, and no new sync code (queue patches are passed through whole). | A separate online-only Submit per annexure. |
| The server validates the layout when a question is saved and the rows when an answer is saved (`backend/app/annexure_table.py`); the browser has a copy of the checks for instant feedback. | The server is the one that cannot be bypassed; the copy only improves the form. | Browser-only checks. |
| Limits: 20 columns, 200 rows, 500 characters per cell, 50 default rows. | Keeps a response small enough to sync over a poor connection. | No limits. |
| A number column can have "Show total" (`total: true` on the column). The grid shows a Total row, computed live from the typed cells. The total is not stored. | The manager chooses which columns need a sum. Computing it on display means it can never disagree with the cells, and there is nothing extra to sync or validate. | Storing the total with the answer; automatic totals on every number column. |
| Empty and unreadable cells count as nothing in a total; the Save button is already blocked for non-numbers. | A half-filled table still gives a sensible sum. | Showing an error in the total row. |
| Managers and others see the table read-only in review, approval and the read-only audit page. | They need to read it, not change it. | Hidden from reviewers. |
| An annexure must be filled before the audit can be submitted, unless the question is answered NA. "Filled" means at least one cell has a value; row names alone do not count, since they can come pre-filled from the layout. Checked on submit by the server (`missing_annexure`, error code `annexure_missing`) and shown beforehand in the app (`missingAnnexure`). | The manager's decision (26 Nov). NA means the question does not apply, so neither does its table. Moving between questions is not blocked, so the auditor can fill the table later. | Always required; a per-question "Required" tick on the layout. |

## Not included
Excel or PDF export of the tables, formulas other than the column total.
