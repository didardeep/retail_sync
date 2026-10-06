// One row shape for both kinds of audit (classic checklist audits from
// /api/audits and SOP audits from /api/sop-audits), so Scheduling and Audit
// Status can list, count and filter them together. Pure functions, no React.
//
// Row: { key, kind, id, store_id, store, city, region, tool, tool_code,
//        auditor, auditor_id, date, submitted_at, status, stage, score,
//        percent, version, notes }
// score/percent are null unless the audit really has one: a classic audit
// carries a 0-100 score once completed; an SOP audit has a percent once it is
// submitted. Nothing is ever estimated.
import { STAGES, stageOf } from './statuses.js'

export const UNASSIGNED = 'unassigned'

export function normalizeLegacy(audit) {
  const status = audit.status || 'Planned'
  const score = typeof audit.score === 'number' ? audit.score : null
  return {
    key: `legacy:${audit.id}`,
    kind: 'legacy',
    id: audit.id,
    store_id: audit.store_id || null,
    store: audit.store || null,
    city: audit.city || null,
    region: audit.region || null,
    tool: audit.audit_type || 'Checklist based Audit',
    tool_code: null,
    auditor: audit.auditor || null,
    auditor_id: audit.auditor_id || null,
    date: audit.scheduled_at || audit.submitted_at || null,
    submitted_at: audit.submitted_at || null,
    status,
    stage: stageOf('legacy', status),
    score,
    percent: score,
    version: null,
    notes: audit.notes || null,
  }
}

export function normalizeSop(audit) {
  const status = audit.status || 'Draft'
  const stage = stageOf('sop', status)
  // A Draft's percent is only a running total, so it is not shown as a score.
  const final = stage === 'completed' || stage === 'approved'
  const percent = final && typeof audit.percent === 'number' ? audit.percent : null
  return {
    key: `sop:${audit.id}`,
    kind: 'sop',
    id: audit.id,
    store_id: audit.store_id || null,
    store: audit.store || null,
    city: audit.city || null,
    region: audit.region || null,
    tool: audit.template || audit.template_code || 'SOP audit',
    tool_code: audit.template_code || null,
    auditor: audit.auditor || null,
    auditor_id: audit.auditor_id || null,
    date: audit.scheduled_at || audit.submitted_at || null,
    submitted_at: audit.submitted_at || null,
    status,
    stage,
    score: final && typeof audit.score === 'number' ? audit.score : null,
    percent,
    version: audit.template_version || null,
    notes: audit.notes || null,
  }
}

function time(row) {
  const t = row.date ? new Date(row.date).getTime() : NaN
  return Number.isNaN(t) ? null : t
}

// Newest first; rows without a date go last. Ties keep a stable order by key.
export function mergeRows(legacy = [], sop = []) {
  const rows = [...legacy.map(normalizeLegacy), ...sop.map(normalizeSop)]
  return rows.sort((a, b) => {
    const ta = time(a)
    const tb = time(b)
    if (ta === null && tb === null) return a.key.localeCompare(b.key)
    if (ta === null) return 1
    if (tb === null) return -1
    return tb - ta || a.key.localeCompare(b.key)
  })
}

// Counts per stage, plus total and rows with nobody assigned.
export function kpiCounts(rows) {
  const counts = { total: rows.length, unassigned: 0 }
  for (const s of STAGES) counts[s.value] = 0
  for (const r of rows) {
    counts[r.stage] = (counts[r.stage] || 0) + 1
    if (!r.auditor_id) counts.unassigned += 1
  }
  return counts
}

// A scheduled row whose date is before the start of `now`'s day.
export function isOverdue(row, now = new Date()) {
  if (row.stage !== 'scheduled') return false
  const t = time(row)
  if (t === null) return false
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  return t < startOfToday.getTime()
}

// Filters are all optional; empty means "any". `auditor` may be the special
// value 'unassigned'. `store` and `auditor` are ids; `region` is the name.
export function filterRows(rows, { stage, kind, store, region, auditor, q, id } = {}) {
  const needle = (q || '').trim().toLowerCase()
  return rows.filter((r) => {
    if (id && r.id !== id) return false
    if (stage && r.stage !== stage) return false
    if (kind && r.kind !== kind) return false
    if (store && r.store_id !== store) return false
    if (region && r.region !== region) return false
    if (auditor === UNASSIGNED) {
      if (r.auditor_id) return false
    } else if (auditor && r.auditor_id !== auditor) return false
    if (needle) {
      const hay = [r.id, r.store, r.city, r.tool, r.auditor, r.status]
        .filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(needle)) return false
    }
    return true
  })
}

// '82%' for a real score, '--' otherwise.
export function scoreLabel(row) {
  return typeof row.percent === 'number' ? `${Math.round(row.percent)}%` : '--'
}

// Sorted, de-duplicated option lists for filter selects, taken from the data.
export function distinctOptions(rows, valueKey, labelKey) {
  const seen = new Map()
  for (const r of rows) {
    if (r[valueKey] && !seen.has(r[valueKey])) seen.set(r[valueKey], r[labelKey] || r[valueKey])
  }
  return [...seen.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
