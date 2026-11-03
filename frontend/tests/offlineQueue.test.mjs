import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyPending, classifyError, enqueueChange, isSameEntry, nextEntry, reconcile,
  retryDelay, sendOrder, submitBlock, syncSummary,
} from '../src/lib/offlineQueue.js';

const ch = (resp_id, patch, audit_id = 'A1') => ({ audit_id, resp_id, patch });
const audit = (status = 'Ongoing', id = 'A1') => ({
  id, status, responses: [{ id: 'r1', answer: null }, { id: 'r2', answer: 'Yes', remarks: 'old' }],
});

test('enqueueChange folds changes to one question and keeps the newest seq', () => {
  let q = enqueueChange([], ch('r1', { answer: 'Yes' }), 1);
  q = enqueueChange(q, ch('r2', { answer: 'No' }), 2);
  q = enqueueChange(q, ch('r1', { remarks: 'ok' }), 3);
  assert.equal(q.length, 2);
  const r1 = q.find((e) => e.resp_id === 'r1');
  assert.deepEqual(r1.patch, { answer: 'Yes', remarks: 'ok' });
  assert.equal(r1.seq, 3);
});

test('enqueueChange: the later value wins and the input is not mutated', () => {
  const base = enqueueChange([], ch('r1', { answer: 'Yes' }), 1);
  const next = enqueueChange(base, ch('r1', { answer: 'No' }), 2);
  assert.equal(next[0].patch.answer, 'No');
  assert.equal(base[0].patch.answer, 'Yes');
});

test('entries are sent in seq order and conflicted audits are skipped', () => {
  const q = [
    { audit_id: 'A1', resp_id: 'r2', patch: {}, seq: 5 },
    { audit_id: 'A2', resp_id: 'r1', patch: {}, seq: 2 },
    { audit_id: 'A1', resp_id: 'r1', patch: {}, seq: 9 },
  ];
  assert.deepEqual(sendOrder(q).map((e) => e.seq), [2, 5, 9]);
  assert.equal(nextEntry(q).seq, 2);
  assert.equal(nextEntry(q, ['A2']).seq, 5);
  assert.equal(nextEntry(q, ['A1', 'A2']), null);
  assert.equal(nextEntry([]), null);
});

test('isSameEntry only drops an entry nothing newer replaced', () => {
  assert.equal(isSameEntry({ seq: 4 }, { seq: 4 }), true);
  assert.equal(isSameEntry({ seq: 6 }, { seq: 4 }), false);
  assert.equal(isSameEntry(undefined, { seq: 4 }), false);
});

test('applyPending lays only this audit queued changes over the audit', () => {
  const entries = [
    { audit_id: 'A1', resp_id: 'r1', patch: { answer: 'No' }, seq: 1 },
    { audit_id: 'A2', resp_id: 'r2', patch: { answer: 'No' }, seq: 2 },
  ];
  const out = applyPending(audit('Planned'), entries);
  assert.equal(out.responses[0].answer, 'No');
  assert.equal(out.responses[1].answer, 'Yes');
  assert.equal(out.status, 'Ongoing');
  assert.equal(applyPending(audit(), []).responses[0].answer, null);
});

test('reconcile: no queued changes shows the server copy', () => {
  const server = audit();
  assert.deepEqual(reconcile({ server, cached: null, entries: [] }), { audit: server, conflict: null });
});

test('reconcile: the device wins on an editable audit', () => {
  const entries = [{ audit_id: 'A1', resp_id: 'r2', patch: { answer: 'No' }, seq: 1 }];
  const { audit: a, conflict } = reconcile({ server: audit(), cached: null, entries });
  assert.equal(conflict, null);
  assert.equal(a.responses[1].answer, 'No');
});

test('reconcile: server copy is not overwritten when it was submitted meanwhile', () => {
  const entries = [{ audit_id: 'A1', resp_id: 'r1', patch: { answer: 'Yes' }, seq: 1 }];
  const cached = applyPending(audit(), entries);
  const { audit: a, conflict } = reconcile({ server: audit('Completed'), cached, entries });
  assert.equal(conflict.reason, 'status');
  assert.match(conflict.message, /Completed/);
  assert.equal(a.responses[0].answer, 'Yes');
});

test('reconcile: offline uses the cached copy with queued changes', () => {
  const entries = [{ audit_id: 'A1', resp_id: 'r1', patch: { answer: 'NA' }, seq: 1 }];
  const { audit: a, conflict } = reconcile({ server: null, cached: audit(), entries });
  assert.equal(conflict, null);
  assert.equal(a.responses[0].answer, 'NA');
});

test('classifyError', () => {
  assert.equal(classifyError({ offline: true }).kind, 'offline');
  assert.equal(classifyError(new Error('x')).kind, 'offline');
  assert.equal(classifyError({ status: 401 }).kind, 'auth');
  assert.equal(classifyError({ status: 409 }).kind, 'conflict');
  assert.equal(classifyError({ status: 404 }).kind, 'conflict');
  assert.equal(classifyError({ status: 422, message: 'bad' }).kind, 'conflict');
  assert.equal(classifyError({ status: 500 }).kind, 'retry');
  assert.equal(classifyError({ status: 503 }).kind, 'retry');
});

test('retryDelay backs off and is capped', () => {
  assert.deepEqual([0, 1, 2, 3].map(retryDelay), [1000, 2000, 4000, 8000]);
  assert.equal(retryDelay(20), 30000);
  assert.equal(retryDelay(-1), 1000);
});

test('syncSummary covers every chip state', () => {
  const on = { online: true };
  assert.equal(syncSummary(on).label, 'Online');
  assert.equal(syncSummary({ online: false }).label, 'Offline');
  assert.equal(syncSummary({ online: false, pending: 3 }).label, 'Offline - 3 changes waiting');
  assert.equal(syncSummary({ ...on, pending: 1 }).label, '1 change waiting');
  assert.equal(syncSummary({ ...on, pending: 2, syncing: true }).state, 'syncing');
  assert.equal(syncSummary({ ...on, pending: 2, failing: true }).state, 'retrying');
  assert.equal(syncSummary({ ...on, pending: 2, conflict: true }).state, 'conflict');
  assert.equal(syncSummary({ online: false, conflict: true }).state, 'conflict');
  assert.equal(syncSummary({ ...on, auth: true }).state, 'auth');
});

test('submitBlock never lets an audit with unsynced answers through', () => {
  assert.equal(submitBlock({ online: true, pending: 0 }), null);
  assert.match(submitBlock({ online: false, pending: 0 }), /offline/);
  assert.match(submitBlock({ online: true, pending: 2 }), /2 changes are not synced/);
  assert.match(submitBlock({ online: true, pending: 1 }), /1 change is not synced/);
  assert.match(submitBlock({ online: true, pending: 0, conflict: true }), /conflict/);
});

test('countByAudit counts unsent changes per audit', async () => {
  const { countByAudit } = await import('../src/lib/offlineQueue.js')
  const queue = [{ audit_id: 'A' }, { audit_id: 'B' }, { audit_id: 'A' }]
  assert.deepEqual(countByAudit(queue), { A: 2, B: 1 })
  assert.deepEqual(countByAudit([]), {})
  assert.deepEqual(countByAudit(undefined), {})
})

test('an unreachable server while the browser is online is retried, a real offline is not', async () => {
  const { shouldRetryAfterNetworkError } = await import('../src/lib/offlineQueue.js')
  assert.equal(shouldRetryAfterNetworkError({ kind: 'offline' }, true), true)
  assert.equal(shouldRetryAfterNetworkError({ kind: 'offline' }, false), false)
  assert.equal(shouldRetryAfterNetworkError({ kind: 'retry' }, true), false)
  assert.equal(shouldRetryAfterNetworkError({ kind: 'conflict' }, true), false)
})
