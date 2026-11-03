# Plan: audit review page and issue review (Audit Manager)

## What the manager asked for

1. Reviewing an audit opens as a full page, not the side drawer.
2. The page shows every question, its answer, the auditor's remarks, and the
   evidence with a count ("3 attached") that can be opened.
3. Each question has a checkbox. A ticked question needs a reason for why it
   should be checked again.
4. At the end of the page: Approve, Reject (reason), Return for fixing (reason).
5. Issues: the manager no longer edits an issue. They read the reply and the
   evidence, then Accept it or Return it with a reason.

## Today

- `/audits/:id/approve` (AuditApproval.jsx) is already a full page, but the
  manager reaches the drawer first, and the page works one question at a time
  (Ask a question / Approve per question). There is no end-of-page decision.
- Issues: the manager gets the full edit form. Only the auditor has the
  accept / send back review.

## Design

### Audit review

- Audit list: for an audit that is Completed or Approved, a row click goes
  straight to the review page (the drawer stays for scheduled and ongoing audits).
- Review page: question cards with a checkbox, a reason box that opens when the
  box is ticked, and an evidence block showing the count and the files.
- Footer (sticky): Approve, Return for fixing, Reject.
  - Approve: every question is marked approved and the audit becomes Approved.
    Blocked while any question is ticked.
  - Return for fixing: needs at least one ticked question, each with a reason
    (and a "what is wrong" category), and an overall reason. Ticked questions get
    review status `query` with the reason; the audit becomes `Changes Requested`
    (the `didar` branch's status), so the auditor can edit only the ticked
    questions; the auditor and the store's auditees are told. When the auditor
    resubmits, the questions come back as `replied` ("fixed by auditor") and the
    audit is Completed again.
  - Reject: needs an overall reason. The audit becomes Rejected, is not scored,
    and the auditor is notified.
- One endpoint: `POST /api/audits/{id}/decision` with
  `{decision: approve|return|reject, reason, items: [{response_id, note}]}`.
- Migration 0012 adds `audits.decision_note` and `audits.decision_at`.

### Auditor side

- A returned audit opens in the wizard with the "Changes requested" banner, which
  now also shows the manager's overall reason; the flagged questions show their
  own reason.
- A rejected audit shows the reason on the review screen and is read-only.

### Issues

- The manager (and admin) opening an existing issue sees it read-only: the
  question, the reply, the follow-up evidence, with counts.
- On a Resolved issue: Accept (issue becomes Closed) or Return (reason
  required; issue becomes Open and the assignee is notified).
- The manager can still create issues and delete them. Editing fields is gone.
- Auditor review stays as it is.

## Decision log

| # | Decision | Why | Alternatives rejected |
|---|----------|-----|-----------------------|
| D1 | One `decision` endpoint for the three outcomes. | The three buttons are one action on the whole audit; one transaction keeps the audit, the questions and the notification consistent. | Keep per-question approve/ask calls: the page would need many calls and could end half-approved. |
| D2 | Ticking a question means "check this again"; unticked questions are fine. Approve is blocked while any is ticked. Chosen by the user. | Matches how the manager described it. | A tick meaning "approve this one": the opposite of what was asked. |
| D3 | Return for fixing uses the existing `Changes Requested` status (added on the `didar` branch). | It already limits the auditor to the queried questions, resubmits and re-scores, and it counts as in progress. | A second "returned" state: two ways to send an audit back. |
| D4 | Reject is a new final status `Rejected`, not scored. | "Reject" must differ from "return": the audit is not valid and should not count. | Reuse Cancelled: loses the reason and mixes with audits cancelled before they were done. |
| D5 | Ticked questions use the existing review status `query` with `review_note` and `review_category`. | Same data the per-question flow already writes, so the auditor screens and notifications work unchanged. | A new status or table for ticked questions: more than this needs. |
| D6 | The per-question review and `request-changes` endpoints stay (the auditor reply flow and Didar's tests use them); the manager page now calls `/decision`. | Avoids breaking merged work. | Delete them: breaks the auditor's reply screen. |
| D7 | For issues the manager uses `/issues/{id}/decision` from the `didar` branch (approve closes, deny reopens with a reason and optional evidence). | Already built, tested and recorded in the issue history. | My own accept/return on `/review`: a second endpoint doing the same thing. |
| D8 | An existing issue opens read-only for the manager: the reply, evidence with counts, an "Assigned to" picker, the approve/deny panel and the decisions history. No edit form. | What was asked: no "make changes", only accept or reject. New issues still use the form. | Keeping the edit form above the decision panel. |
| D9 | On return and reject both the auditor and the store's auditees are told. | The people links now exist, so the TODO's auditee notice is possible. | Auditor only (the earlier plan). |

## Out of scope here

Store details, people management, Pending Approval list, reassign auditor, and
the other TODO workflows.
