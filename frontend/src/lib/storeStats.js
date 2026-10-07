// Pure helpers behind the "My Store" dashboard. They take rows in the shape from
// lib/auditRows.js (mergeRows) and raw issue / store-score records, and never
// touch the network. Every chart number and every drawer list on the page comes
// from the same function here, so a count always equals the list it opens.
import { stageOf } from './statuses.js'
import { sopAuditReviewLink } from './links.js'

export const QUARTERS = ['q1', 'q2', 'q3', 'q4']
export const BENCHMARK = 90
export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low']

// Same colours as the risk donut on the main dashboard (Unrated is grey).
export const PRIORITY_COLORS = {
  Critical: '#9b1c1c', High: '#e02424', Medium: '#f59e0b', Low: '#0e9f6e', Unrated: '#9ca3af',
}

// Same palette as the auditor dashboard: brand, amber, green, teal, grey.
export const STAGE_SLICES = [
  { key: 'scheduled', label: 'Scheduled', color: '#00338D' },
  { key: 'in_progress', label: 'In progress', color: '#f59e0b' },
  { key: 'completed', label: 'Completed', color: '#0e9f6e' },
  { key: 'approved', label: 'Approved', color: '#06b6d4' },
  { key: 'cancelled', label: 'Cancelled', color: '#9ca3af' },
]

const isDone = (r) => r.stage === 'completed' || r.stage === 'approved'

function ms(iso) {
  const t = iso ? new Date(iso).getTime() : NaN
  return Number.isNaN(t) ? null : t
}

function pctOf(count, total) {
  return total ? Math.round((count / total) * 100) : 0
}

// Keeps only the records of one store (the API already scopes by role; this
// makes the picked store explicit for admins and managers).
export function forStore(list, storeId) {
  if (!storeId) return list || []
  return (list || []).filter((x) => x.store_id === storeId)
}

// ---- Scores ---------------------------------------------------------------

export function scoreRecord(scores, storeId) {
  return (scores || []).find((s) => s.store_id === storeId) || null
}

// A stored quarter score as a number, or null when the store has none.
export function quarterScore(scores, storeId, quarter) {
  const rec = scoreRecord(scores, storeId)
  const v = rec ? rec[quarter] : null
  return typeof v === 'number' ? v : null
}

// The latest quarter (q4 down to q1) that has a stored score, or null.
export function latestScoredQuarter(scores, storeId) {
  for (let i = QUARTERS.length - 1; i >= 0; i -= 1) {
    if (quarterScore(scores, storeId, QUARTERS[i]) !== null) return QUARTERS[i]
  }
  return null
}

// One point per quarter; value is null where no score is stored (a gap, not 0).
export function scoreTrend(scores, storeId) {
  return QUARTERS.map((q) => ({ quarter: q, label: q.toUpperCase(), value: quarterScore(scores, storeId, q) }))
}

// ---- Issues ---------------------------------------------------------------

export function isOpenIssue(issue) {
  return issue.status !== 'Resolved' && issue.status !== 'Closed'
}

export function openIssues(issues) {
  return (issues || []).filter(isOpenIssue)
}

// Open issues the API marks overdue (the same flag the Issues page shows).
export function overdueIssues(issues) {
  return openIssues(issues).filter((i) => i.overdue === true)
}

// Open issues by priority. Anything that is not one of the four levels is
// grouped as Unrated, so counts always add up to the number of open issues.
// Only groups that have issues are returned.
export function priorityBreakdown(issues) {
  const open = openIssues(issues)
  const groups = [...PRIORITIES, 'Unrated'].map((level) => ({
    level,
    color: PRIORITY_COLORS[level],
    items: open.filter((i) => (PRIORITIES.includes(i.priority) ? i.priority === level : level === 'Unrated')),
  }))
  return groups
    .filter((g) => g.items.length > 0)
    .map((g) => ({ ...g, count: g.items.length, pct: pctOf(g.items.length, open.length) }))
}

// First `limit` open issues, most urgent priority first (stable within a level).
export function topOpenIssues(issues, limit = 5) {
  const rank = (i) => {
    const r = PRIORITIES.indexOf(i.priority)
    return r === -1 ? PRIORITIES.length : r
  }
  return openIssues(issues)
    .map((issue, idx) => ({ issue, idx }))
    .sort((a, b) => rank(a.issue) - rank(b.issue) || a.idx - b.idx)
    .map((x) => x.issue)
    .slice(0, limit)
}

// ---- Audits ---------------------------------------------------------------

// Rows are the output of mergeRows (newest first) already filtered to the store.
export function doneRows(rows) {
  return rows.filter(isDone)
}

export function activeRows(rows) {
  return rows.filter((r) => r.stage === 'scheduled' || r.stage === 'in_progress')
}

// One slice per stage; rows are exactly what the Audit page lists for
// that stage and store.
export function stageBreakdown(rows) {
  const total = rows.length
  return STAGE_SLICES.map((s) => {
    const list = rows.filter((r) => (r.stage || stageOf(r.kind, r.status)) === s.key)
    return { key: s.key, label: s.label, color: s.color, count: list.length, pct: pctOf(list.length, total), rows: list }
  })
}

// Submitted audits that have a percent, oldest first, last `limit` of them.
export function scoredResults(rows, limit = 12) {
  const when = (r) => ms(r.submitted_at) ?? ms(r.date) ?? Infinity
  return rows
    .filter((r) => isDone(r) && typeof r.percent === 'number')
    .sort((a, b) => when(a) - when(b))
    .slice(-limit)
}

export function recentRows(rows, limit = 8) {
  return rows.slice(0, limit)
}

// Where a row opens: scored audits their review page, checklist audits their page.
export function auditPath(row) {
  return row.kind === 'sop' ? sopAuditReviewLink(row.id) : `/audits/${encodeURIComponent(row.id)}`
}

// All numbers for the tile row, each paired with the list it opens.
export function storeKpis({ rows, issues, scores, storeId, quarter }) {
  const done = doneRows(rows)
  const active = activeRows(rows)
  const open = openIssues(issues)
  const overdue = overdueIssues(issues)
  return {
    quarter,
    score: quarter ? quarterScore(scores, storeId, quarter) : null,
    done, active, open, overdue,
  }
}
