import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ALL_QUARTERS, auditorWorkload, auditsByQuarter, auditsInQuarter, completionRate,
  groupAuditsByFormat, planStage, quarterLabel, scoreFor,
} from '../src/lib/overviewStats.js';

const a = (id, date, status, extra = {}) => ({ id, scheduled_at: date, status, ...extra });

const audits = [
  a('1', '2026-01-10T09:00:00', 'Completed', { store_id: 'S1', auditor: 'Amit' }),
  a('2', '2026-02-10T09:00:00', 'Planned', { store_id: 'S2', auditor: 'Amit' }),
  a('3', '2026-05-10T09:00:00', 'Approved', { store_id: 'S1', auditor: 'Neha' }),
  a('4', '2026-11-10T09:00:00', 'Ongoing', { store_id: 'S3' }),
  a('5', '2026-11-12T09:00:00', 'Cancelled', { store_id: 'S2', auditor: 'Neha' }),
  a('6', '2025-11-12T09:00:00', 'Completed', { store_id: 'S1', auditor: 'Neha' }),
];

test('all quarters means every audit of the year', () => {
  assert.deepEqual(auditsInQuarter(audits, ALL_QUARTERS, 2026).map((x) => x.id), ['1', '2', '3', '4', '5']);
  assert.deepEqual(auditsInQuarter(audits, 'q4', 2026).map((x) => x.id), ['4', '5']);
  assert.equal(quarterLabel(ALL_QUARTERS), 'All quarters');
  assert.equal(quarterLabel('q2'), 'Q2');
});

test('a store score for all quarters is the average of its scored quarters', () => {
  const map = { S1: { q1: 80, q2: 90, q3: null, q4: 0 } };
  assert.equal(scoreFor(map, 'S1', ALL_QUARTERS), 85);
  assert.equal(scoreFor(map, 'S2', ALL_QUARTERS), null);
  assert.equal(scoreFor(map, 'S1', 'q2'), 90);
});

test('plan stage folds approved and rejected into completed', () => {
  assert.deepEqual(['Planned', 'Ongoing', 'Changes Requested', 'Completed', 'Approved', 'Rejected', 'Cancelled'].map((status) => planStage({ status })),
    ['scheduled', 'in_progress', 'in_progress', 'done', 'done', 'done', 'cancelled']);
});

test('every quarter is counted by stage, empty ones too', () => {
  const rows = auditsByQuarter(audits, 2026);
  assert.deepEqual(rows.map((r) => [r.quarter, r.total, r.scheduled, r.in_progress, r.done, r.cancelled]), [
    ['q1', 2, 1, 0, 1, 0], ['q2', 1, 0, 0, 1, 0], ['q3', 0, 0, 0, 0, 0], ['q4', 2, 0, 1, 0, 1],
  ]);
});

test('audits group by their store format with completed counts', () => {
  const stores = [{ id: 'S1', format: 'COCO' }, { id: 'S2', format: 'FOFO' }, { id: 'S3' }];
  const year = auditsInQuarter(audits, ALL_QUARTERS, 2026);
  assert.deepEqual(groupAuditsByFormat(year, stores).map((g) => [g.format, g.count, g.done, g.pct]),
    [['COCO', 2, 2, 40], ['FOFO', 2, 0, 40], ['Other', 1, 0, 20]]);
});

test('auditor workload and completion rate leave cancelled audits out of open work', () => {
  const year = auditsInQuarter(audits, ALL_QUARTERS, 2026);
  assert.deepEqual(auditorWorkload(year), [
    { auditor: 'Amit', total: 2, done: 1, open: 1 },
    { auditor: 'Neha', total: 2, done: 1, open: 0 },
    { auditor: 'Unassigned', total: 1, done: 0, open: 1 },
  ]);
  // 2 completed of the 4 that are not cancelled.
  assert.equal(completionRate(year), 50);
  assert.equal(completionRate([]), 0);
});
