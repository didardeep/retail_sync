// Pure helpers for the auditor's Audit page. No React, no browser APIs, so
// they can be tested with node:test.
import { isOverdue } from '../../lib/auditRows.js'
import { STAGES, stageOf } from '../../lib/statuses.js'

// ---- URL keys -------------------------------------------------------------

// Chips above the store list. The URL key `view` carries the value; the old
// link value `assigned` means the Scheduled chip.
export const STORE_VIEWS = [
  { value: '', label: 'All' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'not_started', label: 'Not started' },
]

export function normalizeView(view) {
  if (view === 'assigned') return 'scheduled'
  return STORE_VIEWS.some((v) => v.value === view) ? view : ''
}

// The history status filter works in stages. Old links carry raw statuses
// (Planned, Ongoing, Completed ...); map those onto the stage they belong to.
export function normalizeStatus(status) {
  if (!status) return ''
  if (status === 'overdue') return status
  if (STAGES.some((s) => s.value === status)) return status
  return stageOf(status)
}

// Rows a status filter keeps. `completed` also keeps approved rows (both are
// "submitted" to the auditor, same as the dashboard); `overdue` keeps scheduled
// rows dated before today. The dashboard counts use the same rules.
export function statusMatches(row, status, now = new Date()) {
  const wanted = normalizeStatus(status)
  if (!wanted) return true
  if (wanted === 'overdue') return isOverdue(row, now)
  if (wanted === 'completed') return row.stage === 'completed' || row.stage === 'approved'
  return row.stage === wanted
}

const STATUS_LABELS = {
  scheduled: 'Scheduled', in_progress: 'In progress', completed: 'Submitted',
  approved: 'Approved', cancelled: 'Cancelled', overdue: 'Overdue',
}

// Label of the "Filter: ... (clear)" chip; '' when there is no status filter.
export function statusFilterLabel(status) {
  return STATUS_LABELS[normalizeStatus(status)] || ''
}

// The merged Audit page reads the status filter from `stage` (exact stage, as
// the manager Dashboard tiles link it), `status` (dashboard and old links:
// raw statuses allowed, `completed` includes approved) or the old store chip
// `view` (assigned/scheduled, in_progress). `overdue` works for stage and status.
// Priority: status, then stage, then view.
export function viewStage(view) {
  const v = normalizeView(view)
  return v === 'scheduled' || v === 'in_progress' ? v : ''
}

export function filterStatusValue({ stage = '', status = '', view = '' } = {}) {
  return normalizeStatus(status) || stage || viewStage(view)
}

export function rowMatchesStatusFilter(row, { stage = '', status = '', view = '' } = {}, now = new Date()) {
  if (status) return statusMatches(row, status, now)
  if (stage === 'overdue') return isOverdue(row, now)
  if (stage) return row.stage === stage
  const vs = viewStage(view)
  return vs ? row.stage === vs : true
}

// Label of the "Filter: ... (clear)" chip; '' when no status filter is active.
export function statusChipLabel({ stage = '', status = '', view = '' } = {}) {
  if (status) return statusFilterLabel(status)
  const value = stage || viewStage(view)
  if (value === 'overdue') return STATUS_LABELS.overdue
  const found = STAGES.find((s) => s.value === value)
  return found ? found.label : ''
}

// ---- Wizard link ----------------------------------------------------------

export const auditLink = (id) => `/audits/${encodeURIComponent(id)}`

export const isMine = (row, userId) => !!userId && row.auditor_id === userId

// What the auditor's action button does for a row: start or resume while it is
// theirs and still editable (scheduled or in progress), otherwise view.
export function rowAction(row, userId) {
  if (!isMine(row, userId)) return 'view'
  if (row.stage !== 'scheduled' && row.stage !== 'in_progress') return 'view'
  return row.stage === 'scheduled' ? 'start' : 'resume'
}

// ---- Progress -------------------------------------------------------------

// Accepts { answered, total } or a plain 0..100 number; null when unknown.
export function percentOf(progress) {
  if (progress == null) return null
  if (typeof progress === 'number') return Math.max(0, Math.min(100, Math.round(progress)))
  if (!progress.total) return null
  return Math.round((progress.answered / progress.total) * 100)
}

// ---- Scheduled list -------------------------------------------------------

function dateMs(row) {
  const t = row.date ? new Date(row.date).getTime() : NaN
  return Number.isNaN(t) ? null : t
}

// Scheduled audits: overdue ones first, then by date; undated last.
export function scheduledForYou(rows, now = new Date()) {
  const list = rows.filter((r) => r.stage === 'scheduled')
  return list.sort((a, b) => {
    const oa = isOverdue(a, now) ? 0 : 1
    const ob = isOverdue(b, now) ? 0 : 1
    if (oa !== ob) return oa - ob
    const ta = dateMs(a)
    const tb = dateMs(b)
    if (ta === null && tb === null) return a.key.localeCompare(b.key)
    if (ta === null) return 1
    if (tb === null) return -1
    return ta - tb || a.key.localeCompare(b.key)
  })
}

// ---- Stores ---------------------------------------------------------------

// summaries come from lib/auditorStats storeSummaries().
export function filterStoreSummaries(summaries, { q = '', region = '', view = '' } = {}) {
  const needle = q.trim().toLowerCase()
  const v = normalizeView(view)
  return summaries.filter((s) => {
    if (region && s.region !== region) return false
    if (needle && !`${s.name || ''} ${s.city || ''}`.toLowerCase().includes(needle)) return false
    if (v === 'scheduled') return s.scheduled > 0
    if (v === 'in_progress') return s.in_progress > 0
    if (v === 'not_started') return !s.scheduled && !s.in_progress
    return true
  })
}

export function regionList(summaries) {
  return [...new Set(summaries.map((s) => s.region).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

// ---- Display --------------------------------------------------------------

// '9 Oct'. Dates carry no timezone and are shown as entered.
export function formatDay(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// State line of one audit option (see lib/auditorStats auditOptions).
export function optionStateLine(option) {
  switch (option.state) {
    case 'scheduled': {
      const day = formatDay(option.row && option.row.date)
      return day ? `Scheduled for ${day}` : 'Scheduled'
    }
    case 'in_progress': {
      const pct = percentOf(option.progress)
      return pct === null ? 'In progress' : `In progress - ${pct}% done`
    }
    case 'submitted': {
      const pct = typeof option.score_percent === 'number' ? Math.round(option.score_percent) : null
      return pct === null ? 'Submitted' : `Submitted - ${pct}%`
    }
    default:
      return 'Not started'
  }
}

export const ACTION_LABELS = { start: 'Start', resume: 'Resume', view: 'View' }
