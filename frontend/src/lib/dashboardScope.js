// Pure helpers for the Dashboard's scope (all stores / one store): what the
// heading says, which records are in scope, the one wording set the Overview
// and the single-store view share, and the two ranked lists. No React and no
// network, so the rules can be unit tested.

export const ALL = 'all'
export const STORE = 'store'

// The scope in the URL: ?store=<id>, otherwise everything.
export function scopeFromParams(params) {
  const store = params.get('store')
  if (store) return { kind: STORE, id: store }
  return { kind: ALL, id: '' }
}

// A scope that points at a store that no longer exists falls back to all.
export function resolveScope(scope, stores = []) {
  if (scope.kind === STORE && !stores.some((s) => s.id === scope.id)) return { kind: ALL, id: '' }
  return scope
}

export function storesInScope(stores = [], scope) {
  if (scope.kind === STORE) return stores.filter((s) => s.id === scope.id)
  return stores
}

// Keeps the records (audits, issues, observations...) of the in-scope stores.
export function inScope(list = [], scopedStores = []) {
  const ids = new Set(scopedStores.map((s) => s.id))
  return list.filter((x) => ids.has(x.store_id))
}

// "All stores" / "Phoenix Mall - Mumbai, West India".
export function scopeTitle(scope, stores = []) {
  if (scope.kind === STORE) {
    const s = stores.find((x) => x.id === scope.id)
    if (!s) return 'All stores'
    const place = [s.city, s.region].filter(Boolean).join(', ')
    return place ? `${s.name} - ${place}` : s.name
  }
  return 'All stores'
}

// Section titles. One set, shared by the Overview (all stores) and the
// single-store view, so the same section never has two names. A title says
// what the numbers are, over what, and for which scope.
export function wording(scope) {
  const one = scope.kind === STORE
  const where = one ? 'this store' : 'all stores'
  return {
    trend: 'Store Performance',
    storeBars: 'Store-wise Compliance Score (%)',
    format: 'Store Format Performance (Avg. Score)',
    distribution: 'Store Score Distribution',
    risk: one ? `Observations by Risk, ${where}` : 'All Observations by Risk',
    region: 'Audit Distribution by Region',
    topBottom: 'Highest and lowest scoring stores',
    observations: one ? 'Most recent observations' : 'Most common observations',
    repeats: one ? 'Issues raised more than once at this store' : 'Issues raised more than once',
    issues: one ? 'Open issues at this store' : `Recent issues, ${where}`,
  }
}

const norm = (text) => String(text || '').trim().replace(/\s+/g, ' ').toLowerCase()

// Groups records by the normalised text of `key`. Biggest group first, ties by
// text, so a list ranked by frequency is really ranked by frequency.
function groupByText(list, key) {
  const groups = new Map()
  for (const item of list) {
    const text = String(item[key] || '').trim().replace(/\s+/g, ' ')
    if (!text) continue
    const k = norm(text)
    if (!groups.has(k)) groups.set(k, { text, count: 0, items: [] })
    const g = groups.get(k)
    g.count += 1
    g.items.push(item)
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
}

// Most common observations, by how many times the same text was recorded.
export function topObservations(observations = [], limit = 5) {
  return groupByText(observations, 'observation').slice(0, limit)
}

// Issues raised more than once (same title), by number of repeats. An issue
// raised once is not a repeat, so it is not listed.
export function repeatIssues(issues = [], limit = 5) {
  return groupByText(issues, 'title').filter((g) => g.count > 1).slice(0, limit)
}

// Observations carry no date, only their sheet number, so the highest number
// is the most recent.
export function recentObservations(observations = [], limit = 5) {
  return [...observations]
    .sort((a, b) => (b.sr_no ?? 0) - (a.sr_no ?? 0))
    .slice(0, limit)
}
