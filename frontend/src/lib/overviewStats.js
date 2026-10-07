// Pure grouping/bucketing helpers for the Dashboard Overview tab. Every donut
// slice, legend entry and drill-down list is derived from the same function
// output, so the number you see is the number you get when you click it.
import { stageOf } from './statuses.js'

export const RISK_LEVELS = ['Critical', 'High', 'Medium', 'Low', 'Unrated']
export const UNASSIGNED_REGION = 'Unassigned'

// Score buckets, evaluated top to bottom: each score lands in exactly one.
// Lower bound inclusive, upper bound exclusive, except that exactly 90 belongs
// to 75-90 and only scores above 90 are in the top bucket.
export const SCORE_BUCKETS = [
  { key: 'gt90', label: '>90', test: (v) => v > 90 },
  { key: '75-90', label: '75-90', test: (v) => v >= 75 },
  { key: '60-75', label: '60-<75', test: (v) => v >= 60 },
  { key: '40-60', label: '40-<60', test: (v) => v >= 40 },
  { key: 'lt40', label: '<40', test: () => true },
]

export function pct(count, total) {
  return total ? Math.round((count / total) * 100) : 0
}

// A usable score is a finite number above 0; null/0/missing means "not scored".
export function scoreFor(scoreMap, storeId, quarter) {
  const v = scoreMap?.[storeId]?.[quarter]
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

// Blank or unrecognised risk text is 'Unrated'.
export function riskLevelOf(observation) {
  const r = String(observation?.risk || '').trim().toLowerCase()
  return RISK_LEVELS.find((l) => l !== 'Unrated' && l.toLowerCase() === r) || 'Unrated'
}

// Observations grouped by risk level; only levels that have items, in
// RISK_LEVELS order.
export function groupObservationsByRisk(observations = []) {
  const groups = RISK_LEVELS.map((level) => ({ level, items: [] }))
  for (const o of observations) {
    groups.find((g) => g.level === riskLevelOf(o)).items.push(o)
  }
  return groups.filter((g) => g.items.length).map((g) => ({
    level: g.level, count: g.items.length, pct: pct(g.items.length, observations.length), items: g.items,
  }))
}

// Audits grouped by region name (exact name, as Audit Status filters it).
export function groupAuditsByRegion(audits = []) {
  const map = new Map()
  for (const a of audits) {
    const region = a.region || UNASSIGNED_REGION
    if (!map.has(region)) map.set(region, [])
    map.get(region).push(a)
  }
  return [...map.entries()]
    .map(([region, items]) => ({ region, count: items.length, pct: pct(items.length, audits.length), items }))
    .sort((a, b) => b.count - a.count || a.region.localeCompare(b.region))
}

// Mean of the numeric values to one decimal, or null when there are none.
export function averageScore(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v))
  if (!nums.length) return null
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
}

// Splits stores into scored (with the quarter's score) and not scored.
export function scoreStores(stores = [], scoreMap = {}, quarter = 'q4') {
  const scored = []
  const unscored = []
  for (const s of stores) {
    const score = scoreFor(scoreMap, s.id, quarter)
    if (score === null) unscored.push(s)
    else scored.push({ store: s, score })
  }
  return { scored, unscored }
}

// Exactly one bucket per scored store; unscored stores are in no bucket.
export function bucketScoredStores(scored = []) {
  const buckets = SCORE_BUCKETS.map((b) => ({ key: b.key, label: b.label, items: [] }))
  for (const entry of scored) {
    const idx = SCORE_BUCKETS.findIndex((b) => b.test(entry.score))
    buckets[idx].items.push(entry)
  }
  return buckets.map((b) => ({ ...b, count: b.items.length }))
}

// Average score per store format over scored stores only. A format whose
// stores are all unscored is returned with avg null.
export function formatAverages(stores = [], scoreMap = {}, quarter = 'q4') {
  const groups = new Map()
  for (const s of stores) {
    const fmt = s.format || 'Other'
    if (!groups.has(fmt)) groups.set(fmt, [])
    const v = scoreFor(scoreMap, s.id, quarter)
    if (v !== null) groups.get(fmt).push(v)
  }
  return [...groups.entries()].map(([format, vals]) => ({
    format, scoredCount: vals.length, avg: vals.length ? Math.round(averageScore(vals)) : null,
  }))
}

// Highest first (ties by name); the caller slices for top/bottom lists.
export function rankScored(scored = []) {
  return [...scored].sort((a, b) => b.score - a.score || String(a.store.name).localeCompare(String(b.store.name)))
}

// Classic (checklist) audit counts per stage, matching Audit Status when it is
// filtered with kind=legacy and the same stage.
export function legacyStageCounts(audits = []) {
  const counts = { scheduled: 0, in_progress: 0, completed: 0, approved: 0 }
  for (const a of audits) {
    const stage = stageOf('legacy', a.status || 'Planned')
    counts[stage] = (counts[stage] || 0) + 1
  }
  return counts
}
