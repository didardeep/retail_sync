// One row shape for checklist audits from /api/audits, so the Audit page and
// the dashboards can list, count and filter them. Pure functions, no React.
//
// Row: { key, id, store_id, store, city, region, brand_id, brand, tool, auditor, auditor_id,
//        date, start, due_at, scheduled_on, submitted_at, status, stage,
//        score, percent, notes }
// start is the planned start (scheduled_at), due_at the planned end and
// scheduled_on when the audit was booked; each is null when not known.
// score/percent are null unless the audit really has one: an audit carries a
// 0-100 score once completed. Nothing is ever estimated.
import { STAGES, stageOf } from './statuses.js'

export const UNASSIGNED = 'unassigned'

export function normalizeAudit(audit) {
  const status = audit.status || 'Planned'
  const score = typeof audit.score === 'number' ? audit.score : null
  return {
    key: audit.id,
    checklist_id: audit.checklist_id || null,
    id: audit.id,
    store_id: audit.store_id || null,
    store: audit.store || null,
    city: audit.city || null,
    region: audit.region || null,
    brand_id: audit.brand_id || null,
    brand: audit.brand || null,
    tool: audit.audit_type || 'Checklist based Audit',
    auditor: audit.auditor || null,
    auditor_id: audit.auditor_id || null,
    date: audit.scheduled_at || audit.submitted_at || null,
    start: audit.scheduled_at || null,
    due_at: audit.due_at || null,
    scheduled_on: audit.created_at || null,
    submitted_at: audit.submitted_at || null,
    status,
    stage: stageOf(status),
    score,
    percent: score,
    notes: audit.notes || null,
    progress: audit.progress || null,
  }
}

function time(row) {
  const t = row.date ? new Date(row.date).getTime() : NaN
  return Number.isNaN(t) ? null : t
}

// Newest first; rows without a date go last. Ties keep a stable order by key.
export function auditRows(audits = []) {
  const rows = audits.map(normalizeAudit)
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

// Overdue: an audit with an end (due_at) that is not finished by then, whether
// or not it has started; without an end, a scheduled row dated before the
// start of `now`'s day.
export function isOverdue(row, now = new Date()) {
  if (row.due_at) {
    if (row.stage !== 'scheduled' && row.stage !== 'in_progress') return false
    const end = new Date(row.due_at).getTime()
    return !Number.isNaN(end) && now.getTime() > end
  }
  if (row.stage !== 'scheduled') return false
  const t = time(row)
  if (t === null) return false
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  return t < startOfToday.getTime()
}

// Filters are all optional; empty means "any". `auditor` may be the special
// value 'unassigned'. `brand`, `store` and `auditor` are ids; `region` is the name.
export function filterRows(rows, { stage, brand, store, region, auditor, q, id } = {}) {
  const needle = (q || '').trim().toLowerCase()
  return rows.filter((r) => {
    if (id && r.id !== id) return false
    if (stage && r.stage !== stage) return false
    if (brand && r.brand_id !== brand) return false
    if (store && r.store_id !== store) return false
    if (region && r.region !== region) return false
    if (auditor === UNASSIGNED) {
      if (r.auditor_id) return false
    } else if (auditor && r.auditor_id !== auditor) return false
    if (needle) {
      const hay = [r.id, r.store, r.city, r.brand, r.tool, r.auditor, r.status]
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

// Display helpers. Dates from the API carry no timezone, so they are shown as
// the wall-clock time that was entered.
export function formatDate(iso) {
  if (!iso) return '--'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '--'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// '2d 4h', '6h 30m', '45m' between two date-times; '' when either is missing
// or the end is before the start.
export function durationLabel(start, end) {
  if (!start || !end) return ''
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (Number.isNaN(ms) || ms < 0) return ''
  const mins = Math.round(ms / 60000)
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  return [d && `${d}d`, h && `${h}h`, !d && m && `${m}m`].filter(Boolean).join(' ') || '0m'
}

export function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
