# What we test, and what we do not

Snapshot taken on 2026-11-03 after commit `64b3475`. All 260 automated tests pass.

These are developer-written automated tests, not a full QA suite.

- **Backend (121 tests, `backend/tests/`):** call the real API against a temporary test database.
- **Frontend (139 tests, `frontend/tests/`):** test the logic behind the screens (filters, counts, sorting, rules). They do not open the screens.
- **Run them:** `cd backend && python -m pytest -q` and `cd frontend && npm test`.

## Backend: 121 tests

| Group | Tests | What is checked |
|---|---|---|
| Audit lifecycle | 14 + 10 + 4 | Start, answer and submit; scoring with weights (N/A ignored); double submit refused; someone else's audit refused; dates and auditor editable only while planned; booking clashes on the same day; blocked dates. |
| Manager review | 9 + 6 | Approve, return for fixing and reject; reasons required; approve blocked while a question is ticked; only a submitted audit can be decided; the auditor fixing and resubmitting. |
| Issues | 5 + 7 + part of 12 | Create, update and delete, and who can do each; bad statuses and priorities refused; the auditor's accept and send-back; the manager's approve and deny; assignee must be an auditee linked to the store; reassignment recorded in the history. |
| People and stores | 12 + 13 + 5 | Brand onboarding; the store catalog (a bad format refused); adding auditors and auditees; a store's people; removing or deactivating someone with open work; an auditor refused on manager-only actions. |
| Scheduling | 2 + the groups above | Several checklists make one audit with each question once; unknown or switched-off checklists refused. |
| Checklists and questions | 10 + 5 | Edited in place if unused, new version if used; bad checklists refused; only managers build them; question proposals pending; a rejection needs a reason. |
| Evidence and annexures | 12 + part of 10 | Photos and videos stored and read back; other file types refused; empty and oversized files leave nothing behind; login required; only the filer or a manager removes a file. |
| Alerts | 14 | Reminders before and after due dates; escalation to the region head only once; mail only to people with an address; a failed mail does not stop the alert; who can run them. |
| Foundation | 4 | One migration head; the booking rules. |

## Frontend: 139 tests

| Group | Tests | What is checked |
|---|---|---|
| Audit list | 11 + 13 + 4 | Filters, status and stage mapping, newest-booked-first sort, overdue rules, link building. |
| Auditor screens | 13 + 9 + 15 | Dashboard numbers (including "changes requested"), question order and progress, the offline queue and sync rules (per-audit counts, retry after an unreachable server). |
| Review and fixing | 5 + 5 + 3 + 4 | The manager's decision rules; flagged questions and moving between them; the pending list. |
| Manager dashboards | 10 + 10 + 11 | Brand and store scoping, score buckets, counts matching the lists they open. |
| Navigation and roles | 11 + 5 + 6 | Who sees which menu item, route guards and titles, status words. |
| Checklists | 8 | Which checklist fits which store; the multi-select helpers. |

## What is not covered

- **Random or odd input.** The tests include hand-picked bad cases: empty reasons, wrong roles, unknown ids, bad statuses, oversized or wrong files. They do not throw random text, very long text, special characters or emoji at the forms.
- **The screens themselves.** There are no automated click-through tests. A few flows were checked by hand in Chrome: the review page, the issue view, the pending list, the returned-audit view and the store page. The multiple-checklist form, the quick-jump rail and the sync fix have only been checked at the logic level.
- **Not tested at all:** performance, security testing beyond role checks, accessibility, phones, other browsers, two people editing at once.

## Suggested next step

A manual QA test plan: a checklist per role (manager, auditor, auditee, store manager) with the valid, invalid, random, boundary and double-click cases for each screen, and a place to mark pass or fail.
