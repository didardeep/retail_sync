import test from 'node:test';
import assert from 'node:assert/strict';

import {
  auditOptions, auditorKpis, finishList, nextUp, progressPercent,
  recentSubmitted, storeSummaries,
} from '../src/lib/auditorStats.js';
import { mergeRows } from '../src/lib/auditRows.js';

const NOW = new Date(2031, 4, 15, 12, 0, 0); // 15 May 2031, local

const legacy = [
  { id: 'L1', store_id: 'S1', store: 'Alpha', checklist_id: 'CL1', audit_type: 'Surprise',
    scheduled_at: '2031-05-20T10:00:00', status: 'Planned' },
  { id: 'L2', store_id: 'S1', store: 'Alpha', checklist_id: 'CL1', audit_type: 'Surprise',
    scheduled_at: '2031-04-30T10:00:00', submitted_at: '2031-04-30T18:00:00',
    status: 'Completed', score: 70 },
  { id: 'L3', store_id: 'S2', store: 'Beta', checklist_id: 'CL2',
    scheduled_at: '2031-05-01T10:00:00', status: 'Cancelled' },
];
const sop = [
  { id: 'a1', store_id: 'S1', store: 'Alpha', template: 'Cash', template_code: 'CASH',
    scheduled_at: '2031-05-10T09:00:00', status: 'Planned' },
  { id: 'a2', store_id: 'S2', store: 'Beta', template: 'Cash', template_code: 'CASH',
    scheduled_at: '2031-05-12T09:00:00', status: 'Draft', progress: { answered: 3, total: 4 } },
  { id: 'a3', store_id: 'S2', store: 'Beta', template: 'FMCG', template_code: 'FMCG',
    scheduled_at: '2031-05-02T09:00:00', submitted_at: '2031-05-01T23:59:59',
    status: 'Submitted', percent: 90, score: 9 },
  { id: 'a4', store_id: 'S1', store: 'Alpha', template: 'FMCG', template_code: 'FMCG',
    submitted_at: '2031-06-01T00:00:00', status: 'Approved', percent: 81, score: 8 },
  { id: 'a5', store_id: 'S3', store: 'Gamma', template: 'Cash', template_code: 'CASH',
    scheduled_at: '2031-05-15T08:00:00', status: 'Planned' },
];
const rows = mergeRows(legacy, sop);

test('progressPercent', () => {
  assert.equal(progressPercent({ progress: { answered: 1, total: 3 } }), 33);
  assert.equal(progressPercent({ progress: { answered: 4, total: 4 } }), 100);
  assert.equal(progressPercent({ progress: { answered: 9, total: 4 } }), 100);
  assert.equal(progressPercent({ progress: { answered: 0, total: 0 } }), null);
  assert.equal(progressPercent({ progress: null }), null);
  assert.equal(progressPercent({}), null);
});

test('auditorKpis counts stages, overdue, average and month', () => {
  const k = auditorKpis(rows, NOW);
  assert.equal(k.total, 8);
  assert.equal(k.scheduled, 3); // L1, a1, a5
  assert.equal(k.in_progress, 1);
  assert.equal(k.completed, 3); // L2, a3, a4
  assert.equal(k.cancelled, 1); // classic Cancelled
  assert.equal(k.overdue, 1); // a1 only; a5 is today
  assert.equal(k.avg_percent, 80.3); // (70 + 90 + 81) / 3
  assert.equal(k.audits_this_month, 1); // a3 on 1 May; L2 is April, a4 is June
  assert.equal(k.stores_this_month, 1);
});

test('auditorKpis with no rows', () => {
  const k = auditorKpis([], NOW);
  assert.equal(k.total, 0);
  assert.equal(k.avg_percent, null);
  assert.equal(k.stores_this_month, 0);
});

test('nextUp is the earliest scheduled row, overdue first', () => {
  assert.equal(nextUp(rows, NOW).id, 'a1');
  assert.equal(nextUp(rows.filter((r) => r.id !== 'a1'), NOW).id, 'a5');
  assert.equal(nextUp([], NOW), null);
  assert.equal(nextUp(rows.filter((r) => r.stage !== 'scheduled'), NOW), null);
});

test('finishList returns in-progress rows', () => {
  assert.deepEqual(finishList(rows).map((r) => r.id), ['a2']);
  assert.equal(finishList(rows)[0].progress.answered, 3);
});

test('recentSubmitted sorts by submitted_at and honours the limit', () => {
  assert.deepEqual(recentSubmitted(rows).map((r) => r.id), ['a4', 'a3', 'L2']);
  assert.deepEqual(recentSubmitted(rows, 2).map((r) => r.id), ['a4', 'a3']);
});

test('storeSummaries orders scheduled, then in progress, then by name', () => {
  const stores = [
    { id: 'S1', name: 'Alpha', city: 'Delhi', region: 'North' },
    { id: 'S2', name: 'Beta' },
    { id: 'S3', name: 'Gamma' },
    { id: 'S4', name: 'Delta' },
  ];
  const out = storeSummaries(stores, rows);
  assert.deepEqual(out.map((s) => s.store_id), ['S1', 'S3', 'S2', 'S4']);
  const s1 = out[0];
  assert.equal(s1.scheduled, 2);
  assert.equal(s1.next_date, '2031-05-10T09:00:00');
  assert.equal(s1.completed, 2);
  assert.equal(s1.last_percent, 81);
  const s2 = out[2];
  assert.equal(s2.in_progress, 1);
  assert.equal(s2.completed, 1);
  assert.equal(out[3].last_date, null);
  assert.equal(out[3].next_date, null);
});

test('auditOptions builds one option per tool and active latest checklist', () => {
  const templates = [
    { id: 't1', code: 'CASH', name: 'Cash', version: 1 },
    { id: 't2', code: 'FMCG', name: 'FMCG', version: 1 },
  ];
  const checklists = [
    { id: 'CL1', name: 'Store visit', version: 1, is_active: true },
    { id: 'CL9', name: 'Store visit', version: 2, is_active: true },
    { id: 'CL2', name: 'Old', version: 1, is_active: false },
  ];
  const s2 = auditOptions('S2', rows, templates, checklists);
  assert.deepEqual(s2.map((o) => o.key), ['sop:t1', 'sop:t2', 'legacy:CL9']);
  assert.equal(s2[0].state, 'in_progress');
  assert.equal(s2[0].action, 'resume');
  assert.equal(s2[0].progress, 75);
  assert.equal(s2[1].state, 'submitted');
  assert.equal(s2[1].action, 'start');
  assert.equal(s2[1].score_percent, 90);
  assert.equal(s2[1].row.id, 'a3');
  assert.equal(s2[2].state, 'not_started');
  assert.equal(s2[2].row, null);
  assert.equal(s2[2].type_label, 'Checklist');

  const s1 = auditOptions('S1', rows, templates, [checklists[0]]);
  assert.equal(s1[0].state, 'scheduled');
  assert.equal(s1[0].action, 'start');
  assert.equal(s1[0].ref_id, 't1');
  assert.equal(s1[0].type_label, 'Scored');
  assert.equal(s1[1].row.id, 'a4');
  assert.equal(s1[2].state, 'scheduled'); // L1 planned beats L2 submitted
  assert.equal(s1[2].row.id, 'L1');
});
