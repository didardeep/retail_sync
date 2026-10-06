import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CANCELLED_MESSAGE, REASSIGNED_MESSAGE, assignmentErrorMessage, auditsToHydrate,
  localAuditsToDrop, scheduleChanges,
} from '../src/lib/offline/assigned.js';

const local = [
  { id: 'a', status: 'Planned', remote: true, scheduled_at: '2031-01-01T10:00:00', notes: null },
  { id: 'b', status: 'Planned', remote: true },
  { id: 'c', status: 'Draft', remote: true },
  { id: 'd', status: 'Planned', remote: false },
]

test('only audits missing from the device are hydrated', () => {
  const server = [{ id: 'a' }, { id: 'x' }, { id: 'y' }]
  assert.deepEqual(auditsToHydrate(server, local), ['x', 'y'])
  assert.deepEqual(auditsToHydrate([], local), [])
})

test('never-started planned copies the server no longer lists are dropped', () => {
  const server = [{ id: 'a' }]
  assert.deepEqual(localAuditsToDrop(local, server, new Set()), ['b'])
})

test('drafts, unsynced and never-sent audits are never dropped', () => {
  assert.deepEqual(localAuditsToDrop(local, [], new Set(['b'])), ['a'])
  assert.deepEqual(localAuditsToDrop(local, [], ['a', 'b']), [])
})

test('scheduleChanges reports moved date or notes only', () => {
  const a = local[0]
  assert.equal(scheduleChanges(a, { scheduled_at: '2031-01-01T10:00:00', notes: null }), null)
  assert.deepEqual(scheduleChanges(a, { scheduled_at: '2031-01-02T10:00:00', notes: null }),
    { scheduled_at: '2031-01-02T10:00:00' })
  assert.deepEqual(scheduleChanges(a, { scheduled_at: '2031-01-01T10:00:00', notes: 'Bring till report' }),
    { notes: 'Bring till report' })
  assert.equal(scheduleChanges(a, undefined), null)
  assert.equal(scheduleChanges({ ...a, status: 'Draft' }, { scheduled_at: 'x' }), null)
})

test('assignment errors map to a clear message', () => {
  assert.equal(assignmentErrorMessage({ status: 403 }), REASSIGNED_MESSAGE)
  assert.equal(assignmentErrorMessage({ status: 409, detail: { status: 'Cancelled' } }), CANCELLED_MESSAGE)
  assert.equal(assignmentErrorMessage({ status: 409, detail: { status: 'Submitted' } }), null)
  assert.equal(assignmentErrorMessage({ status: 500 }), null)
  assert.equal(REASSIGNED_MESSAGE, 'This audit was reassigned to someone else')
})
