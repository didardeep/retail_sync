import test from 'node:test';
import assert from 'node:assert/strict';

import {
  attachExtras, classicAuditLink, filterStoreSummaries, formatDay, mergeSopSources,
  normalizeStatus, normalizeView, optionStateLine, percentOf, regionList,
  scheduledForYou, statusMatches,
} from '../src/components/audit/auditHelpers.js';
import { mergeRows } from '../src/lib/auditRows.js';

test('normalizeView maps the old assigned value and rejects unknown ones', () => {
  assert.equal(normalizeView('assigned'), 'scheduled');
  assert.equal(normalizeView('in_progress'), 'in_progress');
  assert.equal(normalizeView('bogus'), '');
  assert.equal(normalizeView(''), '');
});

test('normalizeStatus maps raw SOP statuses onto stages', () => {
  assert.equal(normalizeStatus('Planned'), 'scheduled');
  assert.equal(normalizeStatus('Draft'), 'in_progress');
  assert.equal(normalizeStatus('Submitted'), 'completed');
  assert.equal(normalizeStatus('approved'), 'approved');
  assert.equal(normalizeStatus(''), '');
  assert.equal(statusMatches({ stage: 'in_progress' }, 'Draft'), true);
  assert.equal(statusMatches({ stage: 'completed' }, 'Draft'), false);
  assert.equal(statusMatches({ stage: 'completed' }, ''), true);
});

test('percentOf handles counts, numbers and nothing', () => {
  assert.equal(percentOf({ answered: 5, total: 8 }), 63);
  assert.equal(percentOf({ answered: 0, total: 0 }), null);
  assert.equal(percentOf(41.6), 42);
  assert.equal(percentOf(null), null);
});

test('mergeSopSources: local wins, remote fills gaps, progress attached', () => {
  const remote = [
    { id: 'a', store_id: 'S1', store: 'Alpha', template: 'Cash', template_code: 'CASH',
      status: 'Planned', scheduled_at: '2031-01-01T10:00:00', auditor_id: 'u1', notes: 'hi' },
    { id: 'b', store_id: 'S2', store: 'Beta', template: 'FMCG', template_code: 'FMCG',
      status: 'Submitted', percent: 80, score: 40, auditor_id: 'u1' },
  ];
  const local = [
    { id: 'a', store_id: 'S1', store_name: 'Alpha', template_name: 'Cash', template_code: 'CASH',
      status: 'Draft', auditor_id: 'u1', updated_at: '2031-01-02' },
  ];
  const out = mergeSopSources(local, remote, { a: { answered: 3, total: 6 } });
  assert.equal(out.length, 2);
  const a = out.find((r) => r.id === 'a');
  assert.equal(a.status, 'Draft');
  assert.equal(a.scheduled_at, '2031-01-01T10:00:00');
  assert.equal(a.notes, 'hi');
  assert.deepEqual(a.progress, { answered: 3, total: 6 });
  assert.equal(out.find((r) => r.id === 'b').percent, 80);
});

test('attachExtras re-attaches progress and sync flags by kind and id', () => {
  const sop = [{ id: 'a', store_id: 'S1', status: 'Draft', progress: { answered: 1, total: 2 }, submit_pending: true }];
  const legacy = [{ id: 'L1', store_id: 'S1', status: 'Ongoing', checklist_id: 'c1', progress: { answered: 2, total: 4 } }];
  const rows = attachExtras(mergeRows(legacy, sop), sop, legacy);
  const s = rows.find((r) => r.id === 'a');
  const l = rows.find((r) => r.id === 'L1');
  assert.deepEqual(s.progress, { answered: 1, total: 2 });
  assert.equal(s.submit_pending, true);
  assert.equal(l.checklist_id, 'c1');
  assert.equal(l.progress.total, 4);
});

test('scheduledForYou puts overdue first, then date order', () => {
  const now = new Date('2031-05-10T12:00:00');
  const mk = (id, date, stage = 'scheduled') => ({ key: `sop:${id}`, kind: 'sop', id, stage, date });
  const rows = [
    mk('later', '2031-05-20T09:00:00'),
    mk('overdue2', '2031-05-08T09:00:00'),
    mk('overdue1', '2031-05-01T09:00:00'),
    mk('today', '2031-05-10T15:00:00'),
    mk('nodate', null),
    mk('done', '2031-05-01T09:00:00', 'completed'),
  ];
  assert.deepEqual(
    scheduledForYou(rows, now).map((r) => r.id),
    ['overdue1', 'overdue2', 'today', 'later', 'nodate'],
  );
});

test('filterStoreSummaries: search, region and chips', () => {
  const stores = [
    { store_id: '1', name: 'Alpha', city: 'Delhi', region: 'North', scheduled: 2, in_progress: 0 },
    { store_id: '2', name: 'Beta', city: 'Pune', region: 'West', scheduled: 0, in_progress: 1 },
    { store_id: '3', name: 'Gamma', city: 'Delhi', region: 'North', scheduled: 0, in_progress: 0 },
  ];
  const ids = (f) => filterStoreSummaries(stores, f).map((s) => s.store_id);
  assert.deepEqual(ids({}), ['1', '2', '3']);
  assert.deepEqual(ids({ q: 'delhi' }), ['1', '3']);
  assert.deepEqual(ids({ region: 'West' }), ['2']);
  assert.deepEqual(ids({ view: 'scheduled' }), ['1']);
  assert.deepEqual(ids({ view: 'assigned' }), ['1']);
  assert.deepEqual(ids({ view: 'in_progress' }), ['2']);
  assert.deepEqual(ids({ view: 'not_started' }), ['3']);
  assert.deepEqual(regionList(stores), ['North', 'West']);
});

test('optionStateLine reads naturally', () => {
  assert.equal(optionStateLine({ state: 'not_started' }), 'Not started');
  assert.equal(
    optionStateLine({ state: 'scheduled', row: { date: '2031-10-09T10:00:00' } }),
    `Scheduled for ${formatDay('2031-10-09T10:00:00')}`,
  );
  assert.match(optionStateLine({ state: 'scheduled', row: { date: '2031-10-09T10:00:00' } }), /9 Oct/);
  assert.equal(
    optionStateLine({ state: 'in_progress', progress: { answered: 31, total: 50 } }),
    'In progress - 62% done',
  );
  assert.equal(optionStateLine({ state: 'in_progress', progress: null }), 'In progress');
  assert.equal(optionStateLine({ state: 'submitted', score_percent: 78.2 }), 'Submitted - 78%');
});

test('classicAuditLink encodes the id', () => {
  assert.equal(classicAuditLink('AUD-1'), '/audits/AUD-1');
  assert.equal(classicAuditLink('a/b'), '/audits/a%2Fb');
});
