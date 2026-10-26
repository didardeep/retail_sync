// Pure helpers for the Dashboard's scope (all brands / one brand / one store):
// what the heading says, which records are in scope, the one wording set the
// Overview and the single-store view share, and the two ranked lists. No React
// and no network, so the rules can be unit tested.

export const ALL = 'all'
export const BRAND = 'brand'
export const STORE = 'store'

// The two header dropdowns, brand and store, can be used together or alone.
// `current` and `change` hold { brand, store } ids ('' for all); the result is
// the new URL query. Picking a brand drops a store that is not in it.
export function pickerParams(stores = [], current = {}, change = {}) {
  const next = { brand: '', store: '', ...current, ...change }
  const store = stores.find((s) => s.id === next.store)
  if ('brand' in change && next.brand && store && store.brand_id !== next.brand) next.store = ''
  const out = {}
  if (next.brand) out.brand = next.brand
  if (next.store) out.store = next.store
  return out
}

// The scope in the URL: ?store=<id> (with or without ?brand) or ?brand=<id>,
// otherwise everything.
export function scopeFromParams(params) {
  const store = params.get('store')
  if (store) return { kind: STORE, id: store }
  const brand = params.get('brand')
  if (brand) return { kind: BRAND, id: brand }
  return { kind: ALL, id: '' }
}


// A scope that points at a store or brand that no longer exists falls back to all.
export function resolveScope(scope, stores = [], brands = []) {
  if (scope.kind === STORE && !stores.some((s) => s.id === scope.id)) return { kind: ALL, id: '' }
  if (scope.kind === BRAND && !brands.some((b) => b.id === scope.id)) return { kind: ALL, id: '' }
  return scope
}

export function storesInScope(stores = [], scope) {
  if (scope.kind === STORE) return stores.filter((s) => s.id === scope.id)
  if (scope.kind === BRAND) return stores.filter((s) => s.brand_id === scope.id)
  return stores
}

// Keeps the records (audits, issues, observations...) of the in-scope stores.
export function inScope(list = [], scopedStores = []) {
  const ids = new Set(scopedStores.map((s) => s.id))
  return list.filter((x) => ids.has(x.store_id))
}

// "All brands, all stores" / the brand name / "Phoenix Mall - Mumbai, West India".
export function scopeTitle(scope, stores = [], brands = []) {
  if (scope.kind === STORE) {
    const s = stores.find((x) => x.id === scope.id)
    if (!s) return 'All brands, all stores'
    const place = [s.city, s.region].filter(Boolean).join(', ')
    return place ? `${s.name} - ${place}` : s.name
  }
  if (scope.kind === BRAND) {
    return brands.find((b) => b.id === scope.id)?.name || 'All brands, all stores'
  }
  return 'All brands, all stores'
}

// Section titles. One set, shared by the Overview (all brands or one brand) and
// the single-store view, so the same section never has two names. A title says
// what the numbers are, over what, and for which scope.
export function wording(scope, brandName = '') {
  const one = scope.kind === STORE
  const where = one ? 'this store' : scope.kind === BRAND ? brandName : 'all stores'
  return {
    trend: one ? 'Audit score by quarter' : 'Average audit score by quarter, per brand',
    storeBars: 'Audit score by outlet / mall',
    format: 'Average audit score by store format',
    distribution: 'Stores by score range',
    risk: `Observations by risk level, ${where}`,
    region: 'Audits by region',
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

// One colour per brand, fixed by the brand's place in the alphabetical list of
// all brands, so hiding or filtering never repaints the lines that remain.
// Order and values: the validated categorical palette (blue, orange, aqua,
// magenta, violet, green, yellow, red).
export const BRAND_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#e87ba4', '#6250d6', '#008300', '#eda100', '#e34948']
export const BRAND_POINTS = ['circle', 'rectRot', 'triangle', 'rect', 'star', 'crossRot', 'rectRounded', 'cross']

export function brandStyles(brands = []) {
  const sorted = [...brands].sort((a, b) => a.name.localeCompare(b.name))
  const out = {}
  sorted.forEach((b, i) => {
    out[b.id] = { color: BRAND_COLORS[i % BRAND_COLORS.length], point: BRAND_POINTS[i % BRAND_POINTS.length] }
  })
  return out
}

// The query for /api/dashboard/brand-trend. `storeIds` null means every store
// of the scope; otherwise only the stores the user ticked.
export function trendQuery({ brandIds = [], storeIds = null } = {}) {
  const parts = []
  if (brandIds.length) parts.push(`brand_ids=${encodeURIComponent(brandIds.join(','))}`)
  if (storeIds) parts.push(`store_ids=${encodeURIComponent(storeIds.length ? storeIds.join(',') : '-')}`)
  return parts.length ? `?${parts.join('&')}` : ''
}
