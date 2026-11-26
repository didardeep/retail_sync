// Numbers for the dashboard's Audit Execution and Findings views. Pure functions
// over the audit and issue lists, plus the per-audit timing from
// POST /api/dashboard/audit-details ({ [auditId]: { started_at, approved_at, returns } }).
// The info buttons describe these rules (lib/scoreCriteria.js): keep them in step.

const OPEN = new Set(['Planned', 'Ongoing', 'Changes Requested'])
const SUBMITTED = new Set(['Completed', 'Approved'])
const DAY = 24 * 60 * 60 * 1000

export const isOpen = (a) => OPEN.has(a.status || 'Planned')
export const isSubmitted = (a) => SUBMITTED.has(a.status)

const time = (v) => (v ? new Date(v).getTime() : NaN)

// Days from `from` to `to`, or null when either is missing or `to` is earlier.
export function daysBetween(from, to) {
  const d = time(to) - time(from)
  return Number.isFinite(d) && d >= 0 ? d / DAY : null
}

const round1 = (v) => Math.round(v * 10) / 10
function average(values) {
  const list = values.filter((v) => typeof v === 'number' && Number.isFinite(v))
  return list.length ? round1(list.reduce((s, v) => s + v, 0) / list.length) : null
}

// An open audit whose planned end has passed. With no planned end, a Planned
// audit whose start day is before today. Same rule as the Audit page
// (lib/auditRows.js isOverdue), so a tile and the list it opens agree.
export function isOverdue(a, now = Date.now()) {
  if (!isOpen(a)) return false
  if (a.due_at) return Number.isFinite(time(a.due_at)) && time(a.due_at) < now
  if ((a.status || 'Planned') !== 'Planned' || !Number.isFinite(time(a.scheduled_at))) return false
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  return time(a.scheduled_at) < startOfToday.getTime()
}

// When an audit fell due: its planned end, or its planned start when it has none.
export const dueOf = (a) => a.due_at || a.scheduled_at || null

// A submitted audit with a planned end: on time when submitted by then.
export function wasOnTime(a) {
  if (!isSubmitted(a) || !a.due_at || !a.submitted_at) return null
  return time(a.submitted_at) <= time(a.due_at)
}

// Where each live (not cancelled or rejected) audit stands against its due date.
export const TIMELINESS = [
  { key: 'on_time', label: 'Submitted on time' },
  { key: 'late', label: 'Submitted late' },
  { key: 'overdue', label: 'Overdue, not submitted' },
  { key: 'not_due', label: 'Open, not yet due' },
]

export function timelinessOf(a, now = Date.now()) {
  if (isSubmitted(a)) {
    const onTime = wasOnTime(a)
    return onTime === false ? 'late' : 'on_time'
  }
  if (!isOpen(a)) return null
  return isOverdue(a, now) ? 'overdue' : 'not_due'
}

export function groupByTimeliness(audits = [], now = Date.now()) {
  const groups = Object.fromEntries(TIMELINESS.map((t) => [t.key, []]))
  for (const a of audits) {
    const key = timelinessOf(a, now)
    if (key) groups[key].push(a)
  }
  return TIMELINESS.map((t) => ({ ...t, items: groups[t.key], count: groups[t.key].length }))
}

const daysToFinish = (a, timing) => daysBetween(timing[a.id]?.started_at, a.submitted_at)
const daysToReview = (a, timing) => (a.status === 'Approved' ? daysBetween(a.submitted_at, timing[a.id]?.approved_at) : null)

// The headline numbers of the Execution view.
export function executionSummary(audits = [], timing = {}, now = Date.now()) {
  const judged = audits.map(wasOnTime).filter((v) => v !== null)
  const onTime = judged.filter(Boolean).length
  return {
    onTimePct: judged.length ? Math.round((onTime / judged.length) * 100) : null,
    onTime,
    judged: judged.length,
    overdue: audits.filter((a) => isOverdue(a, now)).length,
    ongoing: audits.filter((a) => a.status === 'Ongoing').length,
    awaitingReview: audits.filter((a) => a.status === 'Completed').length,
    sentBack: audits.filter((a) => a.status === 'Changes Requested').length,
    avgDaysToFinish: average(audits.filter(isSubmitted).map((a) => daysToFinish(a, timing))),
    avgReviewDays: average(audits.map((a) => daysToReview(a, timing))),
  }
}

// One row per auditor: how their audits are going against the due dates.
export function auditorPerformance(audits = [], timing = {}, now = Date.now()) {
  const map = new Map()
  for (const a of audits) {
    if (!isOpen(a) && !isSubmitted(a)) continue
    const key = a.auditor_id || ''
    if (!map.has(key)) {
      map.set(key, { auditorId: key, auditor: a.auditor || 'Unassigned', assigned: 0, submitted: 0, onTime: 0, late: 0, overdue: 0, returns: 0, finish: [] })
    }
    const row = map.get(key)
    row.assigned += 1
    row.returns += timing[a.id]?.returns || 0
    if (isSubmitted(a)) {
      row.submitted += 1
      const onTime = wasOnTime(a)
      if (onTime === true) row.onTime += 1
      if (onTime === false) row.late += 1
      row.finish.push(daysToFinish(a, timing))
    } else if (isOverdue(a, now)) {
      row.overdue += 1
    }
  }
  return [...map.values()]
    .map(({ finish, ...row }) => {
      const judged = row.onTime + row.late
      return { ...row, onTimePct: judged ? Math.round((row.onTime / judged) * 100) : null, avgDays: average(finish) }
    })
    .sort((a, b) => b.overdue - a.overdue || b.assigned - a.assigned || a.auditor.localeCompare(b.auditor))
}

// Audits a manager should act on, most pressing first: overdue, sent back and
// not yet resubmitted, or submitted and waiting for review.
export function needsAttention(audits = [], now = Date.now()) {
  const rows = []
  for (const a of audits) {
    if (isOverdue(a, now)) {
      const days = Math.floor((now - time(dueOf(a))) / DAY)
      rows.push({ audit: a, kind: 'overdue', rank: 0, days, reason: days >= 1 ? `Overdue by ${days} ${days === 1 ? 'day' : 'days'}` : 'Due date passed today' })
    } else if (a.status === 'Changes Requested') {
      rows.push({ audit: a, kind: 'sent_back', rank: 1, days: 0, reason: 'Sent back to the auditor' })
    } else if (a.status === 'Completed') {
      const days = Math.floor(Math.max(0, now - time(a.submitted_at)) / DAY) || 0
      rows.push({ audit: a, kind: 'review', rank: 2, days, reason: days >= 1 ? `Waiting for review for ${days} ${days === 1 ? 'day' : 'days'}` : 'Waiting for review' })
    }
  }
  return rows.sort((x, y) => x.rank - y.rank || y.days - x.days)
}

// ---- Findings ----------------------------------------------------------------

const QUARTER_KEYS = ['q1', 'q2', 'q3', 'q4']
const quarterIndex = (iso) => Math.floor(new Date(iso).getMonth() / 3)

// Average score of the submitted audits scheduled in each quarter of the year.
export function scoreTrend(audits = []) {
  const buckets = QUARTER_KEYS.map(() => [])
  for (const a of audits) {
    if (!isSubmitted(a) || typeof a.score !== 'number' || !a.scheduled_at) continue
    buckets[quarterIndex(a.scheduled_at)].push(a.score)
  }
  return QUARTER_KEYS.map((q, i) => ({ quarter: q, avg: average(buckets[i]), count: buckets[i].length }))
}

// Yes share of the Yes and No answers in each process; NA is left out.
export function processCompliance(byProcess = []) {
  return byProcess
    .map((p) => {
      const judged = p.yes + p.no
      return { ...p, judged, pct: judged ? Math.round((p.yes / judged) * 100) : null }
    })
    .filter((p) => p.judged)
    .sort((a, b) => a.pct - b.pct || a.process.localeCompare(b.process))
}

// ---- Issues ------------------------------------------------------------------

// Resolved (fixed, waiting for the auditor to accept) counts as done, as on the
// Issues page, so the two pages give the same numbers.
const ISSUE_DONE = ['Resolved', 'Closed']
const isIssueDone = (i) => ISSUE_DONE.includes(i.status)
const isIssueOverdue = (i) => !!i.overdue && !isIssueDone(i)

export function issueSummary(issues = []) {
  const done = issues.filter(isIssueDone)
  const closed = issues.filter((i) => i.status === 'Closed')
  return {
    open: issues.length - done.length,
    overdue: issues.filter(isIssueOverdue).length,
    resolved: done.length - closed.length,
    closed: closed.length,
    avgDaysToClose: average(closed.map((i) => daysBetween(i.created_at, i.closed_at))),
  }
}

// Stores with overdue issues, most overdue first.
export function overdueIssuesByStore(issues = []) {
  const map = new Map()
  for (const i of issues) {
    if (!isIssueOverdue(i)) continue
    const key = i.store_id || ''
    if (!map.has(key)) map.set(key, { storeId: key, store: i.store || 'Unknown store', count: 0 })
    map.get(key).count += 1
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.store.localeCompare(b.store))
}
