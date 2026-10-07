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
