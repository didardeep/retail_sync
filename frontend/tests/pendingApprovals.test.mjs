import test from 'node:test'
import assert from 'node:assert/strict'

import { pendingApprovals, waitingDays } from '../src/lib/pendingApprovals.js'

const audits = [
  { id: 'new', status: 'Completed', submitted_at: '2026-11-02T10:00:00' },
  { id: 'old', status: 'Completed', submitted_at: '2026-10-28T10:00:00' },
  { id: 'none', status: 'Completed', submitted_at: null },
  { id: 'back1', status: 'Changes Requested', decision_note: 'Fix photos', decision_at: '2026-11-01T09:00:00' },
  { id: 'back2', status: 'Changes Requested', decision_note: 'Fix cash', decision_at: '2026-11-02T09:00:00' },
  { id: 'running', status: 'Ongoing', decision_note: null },
  { id: 'done', status: 'Approved' },
]

test('waiting audits are the submitted ones, oldest first, undated last', () => {
  assert.deepEqual(pendingApprovals(audits).waiting.map((a) => a.id), ['old', 'new', 'none'])
})

test('returned audits are the Changes Requested ones, newest first', () => {
  assert.deepEqual(pendingApprovals(audits).returned.map((a) => a.id), ['back2', 'back1'])
})

test('waitingDays counts whole days since submission', () => {
  const now = new Date('2026-11-03T12:00:00')
  assert.equal(waitingDays({ submitted_at: '2026-10-28T10:00:00' }, now), 6)
  assert.equal(waitingDays({ submitted_at: '2026-11-03T08:00:00' }, now), 0)
  assert.equal(waitingDays({ submitted_at: null }, now), 0)
})
