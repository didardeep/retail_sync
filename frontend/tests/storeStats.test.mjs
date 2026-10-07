import test from 'node:test';
import assert from 'node:assert/strict';

import {
  activeRows, auditPath, doneRows, forStore, latestScoredQuarter, openIssues, overdueIssues,
  priorityBreakdown, quarterScore, scoreTrend, scoredResults, stageBreakdown, storeKpis,
  topOpenIssues,
} from '../src/lib/storeStats.js';
import { mergeRows } from '../src/lib/auditRows.js';

const legacy = [
  { id: 'L1', store_id: 'S1', scheduled_at: '2031-05-20T10:00:00', status: 'Planned' },
  { id: 'L2', store_id: 'S1', scheduled_at: '2031-04-30T10:00:00', submitted_at: '2031-04-30T18:00:00', status: 'Completed', score: 70 },
  { id: 'L3', store_id: 'S1', scheduled_at: '2031-03-01T10:00:00', status: 'Approved', score: 90 },
  { id: 'L4', store_id: 'S1', scheduled_at: '2031-03-05T10:00:00', status: 'Ongoing' },
  { id: 'L5', store_id: 'S2', scheduled_at: '2031-03-05T10:00:00', status: 'Completed', score: 50 },
];
const sop = [
  { id: 'a1', store_id: 'S1', scheduled_at: '2031-05-10T09:00:00', submitted_at: '2031-05-10T11:00:00', status: 'Submitted', percent: 85 },
  { id: 'a2', store_id: 'S1', scheduled_at: '2031-05-11T09:00:00', status: 'Draft', percent: 40 },
  { id: 'a3', store_id: 'S1', scheduled_at: '2031-05-12T09:00:00', status: 'Cancelled' },
];
const rows = mergeRows(forStore(legacy, 'S1'), forStore(sop, 'S1'));

const issues = [
  { id: 'i1', store_id: 'S1', priority: 'Critical', status: 'Open', overdue: true },
  { id: 'i2', store_id: 'S1', priority: 'Low', status: 'Resolved' },
  { id: 'i3', store_id: 'S1', priority: 'High', status: 'In Progress' },
  { id: 'i4', store_id: 'S1', priority: 'High', status: 'Closed', overdue: true },
  { id: 'i5', store_id: 'S1', priority: 'weird', status: 'On Hold' },
  { id: 'i6', store_id: 'S2', priority: 'Low', status: 'Open' },
];

test('forStore keeps only that store', () => {
  assert.equal(forStore(issues, 'S1').length, 5);
  assert.equal(forStore(issues, '').length, 6);
});

test('open issues are everything not Resolved or Closed', () => {
  assert.deepEqual(openIssues(forStore(issues, 'S1')).map((i) => i.id), ['i1', 'i3', 'i5']);
  assert.deepEqual(overdueIssues(forStore(issues, 'S1')).map((i) => i.id), ['i1']);
});

test('priority breakdown counts equal list lengths and add up to open issues', () => {
  const mine = forStore(issues, 'S1');
  const groups = priorityBreakdown(mine);
  for (const g of groups) assert.equal(g.count, g.items.length);
  assert.equal(groups.reduce((n, g) => n + g.count, 0), openIssues(mine).length);
  assert.deepEqual(groups.map((g) => g.level), ['Critical', 'High', 'Unrated']);
  assert.equal(groups[0].pct, 33);
  assert.deepEqual(priorityBreakdown([]), []);
});

test('top open issues sort by priority and skip closed ones', () => {
  assert.deepEqual(topOpenIssues(forStore(issues, 'S1'), 2).map((i) => i.id), ['i1', 'i3']);
});

test('stage breakdown uses statuses.js stages and equals the rows shown', () => {
  const slices = stageBreakdown(rows);
  const by = Object.fromEntries(slices.map((s) => [s.key, s.count]));
  assert.deepEqual(by, { scheduled: 1, in_progress: 2, completed: 2, approved: 1, cancelled: 1 });
  for (const s of slices) assert.equal(s.count, s.rows.length);
  assert.equal(slices.reduce((n, s) => n + s.count, 0), rows.length);
});

test('done and active rows match the stage counts', () => {
  assert.equal(doneRows(rows).length, 3);
  assert.equal(activeRows(rows).length, 3);
});

test('scored results are submitted audits with a percent, oldest first', () => {
  const res = scoredResults(rows);
  assert.deepEqual(res.map((r) => r.id), ['L3', 'L2', 'a1']);
  assert.ok(res.every((r) => typeof r.percent === 'number'));
  assert.equal(scoredResults(rows, 2).length, 2);
  assert.deepEqual(scoredResults(rows, 2).map((r) => r.id), ['L2', 'a1']);
});

test('audit path: scored goes to review, checklist to its page', () => {
  assert.equal(auditPath(rows.find((r) => r.id === 'a1')), '/sop-audits/a1/review');
  assert.equal(auditPath(rows.find((r) => r.id === 'L2')), '/audits/L2');
});

test('scores: missing quarters are null, never zero', () => {
  const scores = [{ store_id: 'S1', q1: 80, q2: null, q3: 70, q4: null }];
  assert.equal(quarterScore(scores, 'S1', 'q1'), 80);
  assert.equal(quarterScore(scores, 'S1', 'q2'), null);
  assert.equal(quarterScore(scores, 'S9', 'q1'), null);
  assert.equal(latestScoredQuarter(scores, 'S1'), 'q3');
  assert.equal(latestScoredQuarter(scores, 'S9'), null);
  assert.deepEqual(scoreTrend(scores, 'S1').map((p) => p.value), [80, null, 70, null]);
  assert.deepEqual(scoreTrend([], 'S1').map((p) => p.value), [null, null, null, null]);
});

test('kpis pair each number with its list', () => {
  const scores = [{ store_id: 'S1', q1: 80 }];
  const k = storeKpis({ rows, issues: forStore(issues, 'S1'), scores, storeId: 'S1', quarter: 'q1' });
  assert.equal(k.score, 80);
  assert.equal(k.done.length, 3);
  assert.equal(k.active.length, 3);
  assert.equal(k.open.length, 3);
  assert.equal(k.overdue.length, 1);
  assert.equal(storeKpis({ rows, issues: [], scores, storeId: 'S1', quarter: null }).score, null);
});
