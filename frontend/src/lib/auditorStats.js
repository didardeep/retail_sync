// Pure helpers behind the auditor Dashboard and the Audit page. They take rows
// in the shape from lib/auditRows.js (mergeRows) and never touch the network.
import { isOverdue } from './auditRows.js'

const isDone = (r) => r.stage === 'completed' || r.stage === 'approved'

function ms(iso) {
  const t = iso ? new Date(iso).getTime() : NaN
  return Number.isNaN(t) ? null : t
}

// Ascending by time; rows without a date go last.
function byDateAsc(a, b) {
  const ta = ms(a.date)
  const tb = ms(b.date)
  if (ta === null && tb === null) return 0
  if (ta === null) return 1
  if (tb === null) return -1
  return ta - tb
}

// Integer 0..100 from row.progress {answered,total}, or null when unknown.
export function progressPercent(row) {
  const p = row && row.progress
  if (!p || typeof p.total !== 'number' || !(p.total > 0)) return null
  const answered = typeof p.answered === 'number' ? p.answered : 0
  return Math.max(0, Math.min(100, Math.round((answered / p.total) * 100)))
}

export function auditorKpis(rows, now = new Date()) {
  const k = {
    scheduled: 0, in_progress: 0, completed: 0, cancelled: 0, overdue: 0,
    total: rows.length, avg_percent: null, audits_this_month: 0, stores_this_month: 0,
  }
  let sum = 0
  let n = 0
  const stores = new Set()
  for (const r of rows) {
    if (r.stage === 'scheduled') k.scheduled += 1
    else if (r.stage === 'in_progress') k.in_progress += 1
    else if (isDone(r)) k.completed += 1
    else if (r.stage === 'cancelled') k.cancelled += 1
    if (isOverdue(r, now)) k.overdue += 1
    if (isDone(r) && typeof r.percent === 'number') {
      sum += r.percent
      n += 1
    }
    const t = ms(r.submitted_at)
    if (t !== null) {
      const d = new Date(t)
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
        k.audits_this_month += 1
        if (r.store_id) stores.add(r.store_id)
      }
    }
  }
  if (n) k.avg_percent = Math.round((sum / n) * 10) / 10
  k.stores_this_month = stores.size
  return k
}

// Earliest scheduled row (overdue ones come first simply by being earliest).
export function nextUp(rows, now = new Date()) { // eslint-disable-line no-unused-vars
  const scheduled = rows.filter((r) => r.stage === 'scheduled').sort(byDateAsc)
  return scheduled[0] || null
}

export function finishList(rows) {
  return rows
    .filter((r) => r.stage === 'in_progress')
    .sort((a, b) => (ms(b.updated_at) ?? ms(b.date) ?? -Infinity) - (ms(a.updated_at) ?? ms(a.date) ?? -Infinity))
}

export function recentSubmitted(rows, limit = 5) {
  const when = (r) => ms(r.submitted_at) ?? ms(r.date) ?? -Infinity
  return rows.filter(isDone).sort((a, b) => when(b) - when(a)).slice(0, limit)
}

export function storeSummaries(stores, rows) {
  const out = (stores || []).map((s) => {
    const mine = rows.filter((r) => r.store_id === s.id)
    const scheduled = mine.filter((r) => r.stage === 'scheduled').sort(byDateAsc)
    const done = mine.filter(isDone).sort(
      (a, b) => (ms(b.submitted_at) ?? ms(b.date) ?? -Infinity) - (ms(a.submitted_at) ?? ms(a.date) ?? -Infinity),
    )
    const last = done[0]
    return {
      store_id: s.id,
      name: s.name,
      city: s.city || null,
      region: s.region || null,
      scheduled: scheduled.length,
      in_progress: mine.filter((r) => r.stage === 'in_progress').length,
      completed: done.length,
      last_date: last ? (last.submitted_at || last.date || null) : null,
      last_percent: last && typeof last.percent === 'number' ? last.percent : null,
      next_date: scheduled[0] ? scheduled[0].date || null : null,
    }
  })
  const group = (s) => (s.scheduled > 0 ? 0 : s.in_progress > 0 ? 1 : 2)
  return out.sort((a, b) => {
    const ga = group(a)
    const gb = group(b)
    if (ga !== gb) return ga - gb
    if (ga === 0) {
      const ta = ms(a.next_date)
      const tb = ms(b.next_date)
      if (ta !== tb) return ta === null ? 1 : tb === null ? -1 : ta - tb
    }
    return String(a.name || '').localeCompare(String(b.name || ''))
  })
}

// Pick the row that best describes a tool at a store:
// in progress, else scheduled, else the latest submitted.
function pickRow(candidates) {
  const inProgress = candidates.filter((r) => r.stage === 'in_progress')
    .sort((a, b) => (ms(b.date) ?? -Infinity) - (ms(a.date) ?? -Infinity))
  if (inProgress[0]) return { row: inProgress[0], state: 'in_progress' }
  const scheduled = candidates.filter((r) => r.stage === 'scheduled').sort(byDateAsc)
  if (scheduled[0]) return { row: scheduled[0], state: 'scheduled' }
  const done = candidates.filter(isDone).sort(
    (a, b) => (ms(b.submitted_at) ?? ms(b.date) ?? -Infinity) - (ms(a.submitted_at) ?? ms(a.date) ?? -Infinity),
  )
  if (done[0]) return { row: done[0], state: 'submitted' }
  return { row: null, state: 'not_started' }
}

function option(key, kind, name, refId, candidates) {
  const { row, state } = pickRow(candidates)
  return {
    key,
    kind,
    type_label: kind === 'sop' ? 'Scored' : 'Checklist',
    name,
    ref_id: refId,
    state,
    row,
    progress: row ? progressPercent(row) : null,
    score_percent: row && state === 'submitted' && typeof row.percent === 'number' ? row.percent : null,
    action: state === 'in_progress' ? 'resume' : 'start',
  }
}

export function auditOptions(storeId, rows, templates, checklists) {
  const mine = rows.filter((r) => r.store_id === storeId)
  const opts = []
  for (const t of templates || []) {
    const cands = mine.filter((r) => r.kind === 'sop' && r.tool_code === t.code)
    opts.push(option(`sop:${t.id}`, 'sop', t.name, t.id, cands))
  }
  const best = new Map()
  for (const c of checklists || []) {
    if (c.is_active === false) continue
    const prev = best.get(c.name)
    if (!prev || (c.version || 1) > (prev.version || 1)) best.set(c.name, c)
  }
  for (const c of best.values()) {
    const cands = mine.filter((r) => r.kind === 'legacy' && r.checklist_id === c.id)
    opts.push(option(`legacy:${c.id}`, 'legacy', c.name, c.id, cands))
  }
  return opts
}

// ---- Dashboard charts -----------------------------------------------------
// Every chart number below is computed here and the Audit page filters rows with
// the same rules (components/audit/auditHelpers statusMatches), so a slice or
// bar always equals the rows shown after clicking it.

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Same palette as the main dashboard: brand, amber, green, grey.
export const STATUS_SLICES = [
  { key: 'scheduled', label: 'Scheduled', color: '#00338D' },
  { key: 'in_progress', label: 'In progress', color: '#f59e0b' },
  { key: 'completed', label: 'Submitted', color: '#0e9f6e' },
  { key: 'cancelled', label: 'Cancelled', color: '#9ca3af' },
]

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

// The last `months` calendar months ending at now's month, oldest first.
function monthWindow(now, months) {
  const out = []
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push({ month: monthKey(d), label: MONTH_NAMES[d.getMonth()] })
  }
  return out
}

function monthOf(iso) {
  const t = ms(iso)
  return t === null ? null : monthKey(new Date(t))
}

// One entry per status slice. completed includes approved rows; counts always
// equal rows.length, and rows are the rows the Audit page shows for that key.
export function statusBreakdown(rows, now = new Date()) { // eslint-disable-line no-unused-vars
  return STATUS_SLICES.map((s) => {
    const list = rows.filter((r) => (s.key === 'completed' ? isDone(r) : r.stage === s.key))
    return { key: s.key, label: s.label, count: list.length, color: s.color, rows: list }
  })
}

// Average percent of submitted audits per month, by submitted_at (fallback date).
export function monthlyScoreTrend(rows, now = new Date(), months = 6) {
  const sums = new Map()
  for (const r of rows) {
    if (!isDone(r) || typeof r.percent !== 'number') continue
    const m = monthOf(r.submitted_at || r.date)
    if (!m) continue
    const cur = sums.get(m) || { sum: 0, n: 0 }
    cur.sum += r.percent
    cur.n += 1
    sums.set(m, cur)
  }
  return monthWindow(now, months).map(({ month, label }) => {
    const cur = sums.get(month)
    return {
      month, label, count: cur ? cur.n : 0,
      avg: cur ? Math.round((cur.sum / cur.n) * 10) / 10 : null,
    }
  })
}

// Scheduled-stage audits by their scheduled month vs completed by submitted month.
export function monthlyScheduledVsCompleted(rows, now = new Date(), months = 6) {
  const scheduled = new Map()
  const completed = new Map()
  const bump = (map, m) => { if (m) map.set(m, (map.get(m) || 0) + 1) }
  for (const r of rows) {
    if (r.stage === 'scheduled') bump(scheduled, monthOf(r.date))
    else if (isDone(r)) bump(completed, monthOf(r.submitted_at || r.date))
  }
  return monthWindow(now, months).map(({ month, label }) => ({
    month, label, scheduled: scheduled.get(month) || 0, completed: completed.get(month) || 0,
  }))
}

// Latest completed audit with a percent per store, best score first.
export function storeLatestScores(rows) {
  const latest = new Map()
  for (const r of rows) {
    if (!isDone(r) || typeof r.percent !== 'number' || !r.store_id) continue
    const when = ms(r.submitted_at) ?? ms(r.date) ?? -Infinity
    const prev = latest.get(r.store_id)
    if (!prev || when > prev.when) latest.set(r.store_id, { when, row: r })
  }
  return [...latest.values()]
    .map(({ row }) => ({
      store_id: row.store_id, store: row.store || 'Store', percent: row.percent,
      date: row.submitted_at || row.date || null,
    }))
    .sort((a, b) => b.percent - a.percent || a.store.localeCompare(b.store))
}
