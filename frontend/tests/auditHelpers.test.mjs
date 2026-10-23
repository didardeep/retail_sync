import test from 'node:test';
import assert from 'node:assert/strict';

import {
  auditLink, filterStoreSummaries, formatDay,
  normalizeStatus, normalizeView, optionStateLine, percentOf, regionList,
  filterStatusValue, rowAction, rowMatchesStatusFilter, scheduledForYou, statusChipLabel,
  statusFilterLabel, statusMatches,
} from '../src/components/audit/auditHelpers.js';

test('normalizeView maps the old assigned value and rejects unknown ones', () => {
  assert.equal(normalizeView('assigned'), 'scheduled');
  assert.equal(normalizeView('in_progress'), 'in_progress');
  assert.equal(normalizeView('bogus'), '');
  assert.equal(normalizeView(''), '');
});

test('normalizeStatus maps raw statuses onto stages', () => {
  assert.equal(normalizeStatus('Planned'), 'scheduled');
  assert.equal(normalizeStatus('Ongoing'), 'in_progress');
  assert.equal(normalizeStatus('Completed'), 'completed');
  assert.equal(normalizeStatus('approved'), 'approved');
  assert.equal(normalizeStatus(''), '');
  assert.equal(statusMatches({ stage: 'in_progress' }, 'Ongoing'), true);
  assert.equal(statusMatches({ stage: 'completed' }, 'Ongoing'), false);
  assert.equal(statusMatches({ stage: 'completed' }, ''), true);
});

test('dashboard stage keys and overdue filter the same rows the dashboard counts', () => {
  const now = new Date(2031, 4, 15, 12, 0, 0);
  const rows = [
    { stage: 'scheduled', date: '2031-05-10T10:00:00' },
    { stage: 'scheduled', date: '2031-05-20T10:00:00' },
    { stage: 'in_progress', date: '2031-05-01T10:00:00' },
    { stage: 'completed' }, { stage: 'approved' }, { stage: 'cancelled' },
  ];
  const count = (status) => rows.filter((r) => statusMatches(r, status, now)).length;
  assert.equal(count('scheduled'), 2);
  assert.equal(count('overdue'), 1);
  assert.equal(count('in_progress'), 1);
  assert.equal(count('completed'), 2);
  assert.equal(count('approved'), 1);
  assert.equal(count('cancelled'), 1);
  assert.equal(count(''), 6);
  assert.equal(normalizeStatus('overdue'), 'overdue');
  assert.equal(statusFilterLabel('overdue'), 'Overdue');
  assert.equal(statusFilterLabel('completed'), 'Submitted');
  assert.equal(statusFilterLabel('Ongoing'), 'In progress');
  assert.equal(statusFilterLabel(''), '');
});

test('percentOf handles counts, numbers and nothing', () => {
  assert.equal(percentOf({ answered: 5, total: 8 }), 63);
  assert.equal(percentOf({ answered: 0, total: 0 }), null);
  assert.equal(percentOf(41.6), 42);
  assert.equal(percentOf(null), null);
});

test('scheduledForYou puts overdue first, then date order', () => {
  const now = new Date('2031-05-10T12:00:00');
  const mk = (id, date, stage = 'scheduled') => ({ key: id, id, stage, date });
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

test('auditLink encodes the id', () => {
  assert.equal(auditLink('AUD-1'), '/audits/AUD-1');
  assert.equal(auditLink('a/b'), '/audits/a%2Fb');
});

test('merged Audit page: stage, status and view all filter, and the chip names the filter', () => {
  const now = new Date(2031, 4, 15, 12, 0, 0);
  const past = new Date(2031, 4, 10, 9, 0, 0).toISOString();
  const rows = [
    { stage: 'scheduled', date: past },
    { stage: 'scheduled', date: null },
    { stage: 'in_progress' },
    { stage: 'completed' },
    { stage: 'approved' },
    { stage: 'cancelled' },
  ];
  const count = (f) => rows.filter((r) => rowMatchesStatusFilter(r, f, now)).length;
  assert.equal(count({}), 6);
  assert.equal(count({ stage: 'scheduled' }), 2);
  assert.equal(count({ stage: 'overdue' }), 1);
  assert.equal(count({ stage: 'completed' }), 1);        // exact stage (manager tiles)
  assert.equal(count({ status: 'completed' }), 2);       // includes approved (auditor dashboard)
  assert.equal(count({ status: 'Planned' }), 2);
  assert.equal(count({ status: 'Ongoing' }), 1);
  assert.equal(count({ status: 'overdue' }), 1);
  assert.equal(count({ view: 'assigned' }), 2);
  assert.equal(count({ view: 'not_started' }), 6);
  assert.equal(count({ status: 'Completed', stage: 'cancelled' }), 2); // status wins

  assert.equal(statusChipLabel({}), '');
  assert.equal(statusChipLabel({ status: 'Planned' }), 'Scheduled');
  assert.equal(statusChipLabel({ status: 'completed' }), 'Submitted');
  assert.equal(statusChipLabel({ stage: 'completed' }), 'Completed');
  assert.equal(statusChipLabel({ stage: 'overdue' }), 'Overdue');
  assert.equal(statusChipLabel({ view: 'assigned' }), 'Scheduled');
  assert.equal(filterStatusValue({ status: 'Ongoing' }), 'in_progress');
  assert.equal(filterStatusValue({ stage: 'overdue' }), 'overdue');
  assert.equal(filterStatusValue({}), '');
});

test('rowAction: start or resume own editable audits, otherwise view', () => {
  const row = (stage, auditor_id = 'u1') => ({ stage, auditor_id });
  assert.equal(rowAction(row('scheduled'), 'u1'), 'start');
  assert.equal(rowAction(row('in_progress'), 'u1'), 'resume');
  assert.equal(rowAction(row('completed'), 'u1'), 'view');
  assert.equal(rowAction(row('approved'), 'u1'), 'view');
  assert.equal(rowAction(row('cancelled'), 'u1'), 'view');
  assert.equal(rowAction(row('scheduled', 'u2'), 'u1'), 'view');
  assert.equal(rowAction(row('scheduled'), ''), 'view');
});
