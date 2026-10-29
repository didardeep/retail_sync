import test from 'node:test';
import assert from 'node:assert/strict';

import {
  auditRows, distinctOptions, durationLabel, filterRows, isOverdue, kpiCounts, normalizeAudit,
  scoreLabel,
} from '../src/lib/auditRows.js';

const audits = [
  { id: 'AUD-1001', store_id: 'S1', store: 'Alpha', city: 'Delhi', region: 'North',
    auditor_id: 'u1', auditor: 'Asha', audit_type: 'Checklist based Audit',
    scheduled_at: '2031-05-02T10:00:00', status: 'Planned', score: null },
  { id: 'AUD-1002', store_id: 'S2', store: 'Beta', city: 'Pune', region: 'West',
    auditor_id: 'u2', auditor: 'Ravi', audit_type: 'Surprise',
    scheduled_at: '2031-04-01T10:00:00', status: 'Completed', score: 82.5 },
  { id: 'AUD-1003', store_id: 'S2', store: 'Beta', region: 'West', auditor_id: null,
    auditor: null, scheduled_at: '2031-03-01T09:00:00', status: 'Ongoing', score: null },
  { id: 'AUD-1004', store_id: 'S3', store: 'Gamma', region: null, auditor_id: 'u1',
    auditor: 'Asha', scheduled_at: '2031-02-01T09:00:00', status: 'Cancelled' },
]

test('normalizeAudit maps the shared row shape', () => {
  const r = normalizeAudit(audits[1])
  assert.equal(r.key, 'AUD-1002')
  assert.equal(r.tool, 'Surprise')
  assert.equal(r.stage, 'completed')
  assert.equal(r.score, 82.5)
  assert.equal(r.date, '2031-04-01T10:00:00')
})

test('an audit without a score has no score', () => {
  const r = normalizeAudit(audits[0])
  assert.equal(r.score, null)
  assert.equal(r.percent, null)
  assert.equal(scoreLabel(r), '--')
  assert.equal(r.stage, 'scheduled')
})

test('auditRows sorts newest first and puts undated rows last', () => {
  const rows = auditRows([...audits, { id: 'AUD-1005', status: 'Ongoing' }])
  assert.deepEqual(rows.map((r) => r.id),
    ['AUD-1001', 'AUD-1002', 'AUD-1003', 'AUD-1004', 'AUD-1005'])
})

test('kpiCounts counts per stage and unassigned', () => {
  const rows = auditRows(audits)
  assert.deepEqual(kpiCounts(rows), {
    total: 4, unassigned: 1, scheduled: 1, in_progress: 1, completed: 1,
    approved: 0, cancelled: 1,
  })
  assert.equal(kpiCounts([]).total, 0)
})

test('filterRows by each key', () => {
  const rows = auditRows(audits)
  const ids = (f) => filterRows(rows, f).map((r) => r.id).sort()
  assert.deepEqual(ids({}), rows.map((r) => r.id).sort())
  assert.deepEqual(ids({ stage: 'scheduled' }), ['AUD-1001'])
  assert.deepEqual(ids({ store: 'S3' }), ['AUD-1004'])
  assert.deepEqual(ids({ region: 'West' }), ['AUD-1002', 'AUD-1003'])
  assert.deepEqual(ids({ auditor: 'u1' }), ['AUD-1001', 'AUD-1004'])
  assert.deepEqual(ids({ auditor: 'unassigned' }), ['AUD-1003'])
  assert.deepEqual(ids({ id: 'AUD-1002' }), ['AUD-1002'])
  assert.deepEqual(ids({ q: 'surprise' }), ['AUD-1002'])
  assert.deepEqual(ids({ q: 'pune', stage: 'completed' }), ['AUD-1002'])
  assert.deepEqual(ids({ stage: 'completed', region: 'North' }), [])
})

test('isOverdue only for scheduled rows dated before today', () => {
  const now = new Date('2031-05-05T12:00:00')
  const rows = auditRows(audits)
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
  assert.equal(isOverdue(byId['AUD-1001'], now), true)    // 2 May is before 5 May
  assert.equal(isOverdue(byId['AUD-1003'], now), false)   // in progress, not scheduled
  assert.equal(isOverdue(byId['AUD-1001'], new Date('2031-05-03T08:00:00')), true)
  assert.equal(isOverdue(byId['AUD-1001'], new Date('2031-05-02T20:00:00')), false)
})

test('distinctOptions comes from the data and skips blanks', () => {
  const rows = auditRows(audits)
  assert.deepEqual(distinctOptions(rows, 'region', 'region'), [
    { value: 'North', label: 'North' }, { value: 'West', label: 'West' },
  ])
  assert.deepEqual(distinctOptions(rows, 'auditor_id', 'auditor').map((o) => o.label),
    ['Asha', 'Ravi'])
})

test('normalizeAudit passes progress and checklist_id through', () => {
  const l = normalizeAudit({ ...audits[0], checklist_id: 'CL1', progress: { answered: 2, total: 5 } })
  assert.deepEqual(l.progress, { answered: 2, total: 5 })
  assert.equal(l.checklist_id, 'CL1')
  assert.equal(normalizeAudit(audits[0]).progress, null)
  assert.equal(normalizeAudit(audits[0]).checklist_id, null)
})

test('a Cancelled audit normalizes to the cancelled stage', () => {
  assert.equal(normalizeAudit({ ...audits[0], status: 'Cancelled' }).stage, 'cancelled')
})

test('with an end date, overdue means not finished by the end', () => {
  const planned = normalizeAudit({ ...audits[0], due_at: '2031-05-02T18:00:00' })
  const started = normalizeAudit({ ...audits[2], due_at: '2031-03-02T18:00:00' })
  const done = normalizeAudit({ ...audits[1], due_at: '2031-04-01T18:00:00' })
  assert.equal(planned.start, '2031-05-02T10:00:00')
  assert.equal(isOverdue(planned, new Date('2031-05-02T17:00:00')), false)
  assert.equal(isOverdue(planned, new Date('2031-05-02T19:00:00')), true)
  assert.equal(isOverdue(started, new Date('2031-03-03T08:00:00')), true)   // in progress past its end
  assert.equal(isOverdue(done, new Date('2031-06-01T00:00:00')), false)     // finished
})

test('created_at becomes scheduled_on', () => {
  assert.equal(normalizeAudit({ ...audits[0], created_at: '2031-04-20T09:00:00' }).scheduled_on, '2031-04-20T09:00:00')
  assert.equal(normalizeAudit(audits[0]).scheduled_on, null)
})

test('durationLabel', () => {
  assert.equal(durationLabel('2031-05-10T09:00:00', '2031-05-12T13:00:00'), '2d 4h')
  assert.equal(durationLabel('2031-05-10T09:00:00', '2031-05-10T15:30:00'), '6h 30m')
  assert.equal(durationLabel('2031-05-10T09:00:00', '2031-05-10T09:45:00'), '45m')
  assert.equal(durationLabel('2031-05-10T09:00:00', null), '')
  assert.equal(durationLabel('2031-05-10T09:00:00', '2031-05-09T09:00:00'), '')
})
