import assert from 'node:assert/strict';
import test from 'node:test';

import {
  auditorPerformance, daysBetween, executionSummary, groupByTimeliness, issueSummary,
  needsAttention, overdueIssuesByStore, processCompliance, scoreTrend, wasOnTime,
} from '../src/lib/executionStats.js';

const NOW = new Date('2026-11-20T12:00:00').getTime();
const a = (id, status, extra = {}) => ({ id, status, auditor_id: 'u1', auditor: 'Amit', ...extra });

const audits = [
  a('on', 'Approved', { due_at: '2026-11-10T18:00:00', submitted_at: '2026-11-09T10:00:00', scheduled_at: '2026-11-08T09:00:00', score: 80 }),
  a('late', 'Completed', { due_at: '2026-11-10T18:00:00', submitted_at: '2026-11-12T10:00:00', scheduled_at: '2026-11-08T09:00:00', score: 60 }),
  a('over', 'Ongoing', { due_at: '2026-11-15T18:00:00', auditor_id: 'u2', auditor: 'Neha' }),
  a('back', 'Changes Requested', { due_at: '2026-12-01T18:00:00' }),
  a('future', 'Planned', { due_at: '2026-12-01T18:00:00' }),
  a('gone', 'Cancelled', { due_at: '2026-11-01T18:00:00' }),
];
const timing = {
  on: { started_at: '2026-11-08T10:00:00', approved_at: '2026-11-11T10:00:00', returns: 0 },
  late: { started_at: '2026-11-10T10:00:00', approved_at: null, returns: 1 },
};

test('on time means submitted by the due date', () => {
  assert.equal(wasOnTime(audits[0]), true);
  assert.equal(wasOnTime(audits[1]), false);
  assert.equal(wasOnTime(audits[2]), null);
  assert.equal(daysBetween('2026-11-01T00:00:00', '2026-11-03T12:00:00'), 2.5);
  assert.equal(daysBetween('2026-11-03', '2026-11-01'), null);
});

test('summary counts overdue, review and sent-back audits, and average days', () => {
  const s = executionSummary(audits, timing, NOW);
  assert.equal(s.onTimePct, 50);
  assert.equal(s.overdue, 1);
  assert.equal(s.awaitingReview, 1);
  assert.equal(s.sentBack, 1);
  assert.equal(s.ongoing, 1);
  assert.equal(s.avgDaysToFinish, 1.5); // 1 day and 2 days
  assert.equal(s.avgReviewDays, 2); // approved audit only
});

test('a planned audit with no due date is overdue once its start day is over', () => {
  const s = executionSummary([
    a('old', 'Planned', { scheduled_at: '2026-11-18T09:00:00' }),
    a('today', 'Planned', { scheduled_at: '2026-11-20T08:00:00' }),
    a('going', 'Ongoing', { scheduled_at: '2026-11-01T09:00:00' }),
  ], {}, NOW);
  assert.equal(s.overdue, 1);
});

test('timeliness leaves out cancelled audits', () => {
  const g = Object.fromEntries(groupByTimeliness(audits, NOW).map((x) => [x.key, x.count]));
  assert.deepEqual(g, { on_time: 1, late: 1, overdue: 1, not_due: 2 });
});

test('auditor rows put the auditor with overdue work first', () => {
  const rows = auditorPerformance(audits, timing, NOW);
  assert.deepEqual(rows.map((r) => r.auditor), ['Neha', 'Amit']);
  const amit = rows[1];
  assert.equal(amit.assigned, 4);
  assert.equal(amit.onTimePct, 50);
  assert.equal(amit.returns, 1);
});

test('needs attention lists overdue first, then sent back, then waiting for review', () => {
  const rows = needsAttention(audits, NOW);
  assert.deepEqual(rows.map((r) => r.kind), ['overdue', 'sent_back', 'review']);
  assert.match(rows[0].reason, /Overdue by 4 days/);
});

test('findings: score trend by quarter and process compliance', () => {
  const t = scoreTrend(audits);
  assert.equal(t[3].avg, 70);
  assert.equal(t[0].avg, null);
  const p = processCompliance([
    { process: 'EHS', yes: 9, no: 1, na: 2 },
    { process: 'Cash', yes: 1, no: 1, na: 0 },
    { process: 'Empty', yes: 0, no: 0, na: 4 },
  ]);
  assert.deepEqual(p.map((x) => [x.process, x.pct]), [['Cash', 50], ['EHS', 90]]);
});

test('issue summary and overdue issues by store', () => {
  const issues = [
    { status: 'Closed', created_at: '2026-11-01T00:00:00', closed_at: '2026-11-05T00:00:00' },
    { status: 'Open', overdue: true, store_id: 'S1', store: 'Alpha' },
    { status: 'Open', overdue: true, store_id: 'S1', store: 'Alpha' },
    { status: 'In Progress', overdue: true, store_id: 'S2', store: 'Beta' },
  ];
  assert.deepEqual(issueSummary(issues), { open: 3, overdue: 3, resolved: 0, closed: 1, avgDaysToClose: 4 });
  // Resolved is done, as on the Issues page: not open and not overdue.
  assert.deepEqual(issueSummary([{ status: 'Resolved', overdue: true }]), { open: 0, overdue: 0, resolved: 1, closed: 0, avgDaysToClose: null });
  assert.deepEqual(overdueIssuesByStore(issues).map((r) => [r.store, r.count]), [['Alpha', 2], ['Beta', 1]]);
});
