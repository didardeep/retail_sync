import test from 'node:test';
import assert from 'node:assert/strict';

import {
  distinctOptions, filterRows, isOverdue, kpiCounts, mergeRows, normalizeLegacy,
  normalizeSop, scoreLabel,
} from '../src/lib/auditRows.js';

const legacy = [
  { id: 'AUD-1001', store_id: 'S1', store: 'Alpha', city: 'Delhi', region: 'North',
    auditor_id: 'u1', auditor: 'Asha', audit_type: 'Checklist based Audit',
    scheduled_at: '2031-05-02T10:00:00', status: 'Planned', score: null },
  { id: 'AUD-1002', store_id: 'S2', store: 'Beta', city: 'Pune', region: 'West',
    auditor_id: 'u2', auditor: 'Ravi', audit_type: 'Surprise',
    scheduled_at: '2031-04-01T10:00:00', status: 'Completed', score: 82.5 },
]
const sop = [
  { id: 'a-1', store_id: 'S1', store: 'Alpha', city: 'Delhi', region: 'North',
    auditor_id: 'u1', auditor: 'Asha', template: 'Cash audit', template_code: 'CASH',
    template_version: 2, scheduled_at: '2031-05-10T09:00:00', status: 'Planned',
    score: null, percent: null },
  { id: 'a-2', store_id: 'S2', store: 'Beta', city: 'Pune', region: 'West',
    auditor_id: 'u2', auditor: 'Ravi', template: 'FMCG audit', template_code: 'FMCG',
    template_version: 1, scheduled_at: null, submitted_at: '2031-04-20T12:00:00',
    status: 'Submitted', score: 40, percent: 80 },
  { id: 'a-3', store_id: 'S2', store: 'Beta', region: 'West', auditor_id: null,
    auditor: null, template: 'Cash audit', template_code: 'CASH', template_version: 1,
    scheduled_at: '2031-03-01T09:00:00', status: 'Draft', score: 5, percent: 20 },
  { id: 'a-4', store_id: 'S3', store: 'Gamma', region: null, auditor_id: 'u1',
    auditor: 'Asha', template: 'Cash audit', template_code: 'CASH', template_version: 1,
    scheduled_at: '2031-02-01T09:00:00', status: 'Cancelled', percent: null },
]

test('normalizeLegacy maps the shared row shape', () => {
  const r = normalizeLegacy(legacy[1])
  assert.equal(r.key, 'legacy:AUD-1002')
  assert.equal(r.kind, 'legacy')
  assert.equal(r.tool, 'Surprise')
  assert.equal(r.stage, 'completed')
  assert.equal(r.score, 82.5)
  assert.equal(r.date, '2031-04-01T10:00:00')
  assert.equal(r.version, null)
})

test('legacy audit without a score has no score', () => {
  const r = normalizeLegacy(legacy[0])
  assert.equal(r.score, null)
  assert.equal(r.percent, null)
  assert.equal(scoreLabel(r), '--')
  assert.equal(r.stage, 'scheduled')
})

test('normalizeSop maps tool, version, date and stage', () => {
  const planned = normalizeSop(sop[0])
  assert.equal(planned.key, 'sop:a-1')
  assert.equal(planned.tool, 'Cash audit')
  assert.equal(planned.tool_code, 'CASH')
  assert.equal(planned.version, 2)
  assert.equal(planned.stage, 'scheduled')
  assert.equal(planned.date, '2031-05-10T09:00:00')
  const done = normalizeSop(sop[1])
  assert.equal(done.date, '2031-04-20T12:00:00')   // falls back to submitted_at
  assert.equal(done.percent, 80)
  assert.equal(scoreLabel(done), '80%')
})

test('a draft running total is not shown as a score', () => {
  const draft = normalizeSop(sop[2])
  assert.equal(draft.stage, 'in_progress')
  assert.equal(draft.percent, null)
  assert.equal(draft.score, null)
  assert.equal(scoreLabel(draft), '--')
})

test('mergeRows sorts newest first and puts undated rows last', () => {
  const rows = mergeRows(legacy, [...sop, { id: 'a-5', status: 'Draft' }])
  assert.deepEqual(rows.map((r) => r.id),
    ['a-1', 'AUD-1001', 'a-2', 'AUD-1002', 'a-3', 'a-4', 'a-5'])
})

test('kpiCounts counts per stage and unassigned', () => {
  const rows = mergeRows(legacy, sop)
  assert.deepEqual(kpiCounts(rows), {
    total: 6, unassigned: 1, scheduled: 2, in_progress: 1, completed: 2,
    approved: 0, cancelled: 1,
  })
  assert.equal(kpiCounts([]).total, 0)
})

test('filterRows by each key', () => {
  const rows = mergeRows(legacy, sop)
  const ids = (f) => filterRows(rows, f).map((r) => r.id).sort()
  assert.deepEqual(ids({}), rows.map((r) => r.id).sort())
  assert.deepEqual(ids({ stage: 'scheduled' }), ['AUD-1001', 'a-1'])
  assert.deepEqual(ids({ kind: 'legacy' }), ['AUD-1001', 'AUD-1002'])
  assert.deepEqual(ids({ store: 'S3' }), ['a-4'])
  assert.deepEqual(ids({ region: 'West' }), ['AUD-1002', 'a-2', 'a-3'])
  assert.deepEqual(ids({ auditor: 'u1' }), ['AUD-1001', 'a-1', 'a-4'])
  assert.deepEqual(ids({ auditor: 'unassigned' }), ['a-3'])
  assert.deepEqual(ids({ id: 'a-2' }), ['a-2'])
  assert.deepEqual(ids({ q: 'fmcg' }), ['a-2'])
  assert.deepEqual(ids({ q: 'pune', kind: 'legacy' }), ['AUD-1002'])
  assert.deepEqual(ids({ stage: 'completed', region: 'North' }), [])
})

test('isOverdue only for scheduled rows dated before today', () => {
  const now = new Date('2031-05-05T12:00:00')
  const rows = mergeRows(legacy, sop)
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
  assert.equal(isOverdue(byId['AUD-1001'], now), true)    // 2 May is before 5 May
  assert.equal(isOverdue(byId['a-1'], now), false)
  assert.equal(isOverdue(byId['a-3'], now), false)         // in progress, not scheduled
  assert.equal(isOverdue(byId['AUD-1001'], new Date('2031-05-03T08:00:00')), true)
  assert.equal(isOverdue(byId['AUD-1001'], new Date('2031-05-02T20:00:00')), false)
})

test('distinctOptions comes from the data and skips blanks', () => {
  const rows = mergeRows(legacy, sop)
  assert.deepEqual(distinctOptions(rows, 'region', 'region'), [
    { value: 'North', label: 'North' }, { value: 'West', label: 'West' },
  ])
  assert.deepEqual(distinctOptions(rows, 'auditor_id', 'auditor').map((o) => o.label),
    ['Asha', 'Ravi'])
})
