// Pure rules for checklists and data exceptions, kept here so they can be tested.

const distinct = (values) => [...new Set(values.filter(Boolean))].sort()

// The formats, store types and categories a checklist can be limited to, for
// the builder: the standard formats and types plus whatever the stores use.
export function storeChoices(stores = [], { formats = [], types = [] } = {}) {
  return {
    formats: distinct([...formats, ...stores.map((s) => s.format)]),
    types: distinct([...types, ...stores.map((s) => s.type)]),
    categories: distinct(stores.map((s) => s.store_category)),
  }
}

// A checklist applies to a store unless its conditions name other values.
// An empty list means every store. A list of stores means exactly those
// stores, whatever their format or type.
export function checklistFitsStore(checklist, store) {
  if (checklist.is_active === false) return false
  if (!store) return true
  const { format = [], type = [], category = [], stores = [] } = checklist.conditions || {}
  if (stores.length) return stores.includes(store.id)
  if (format.length && !format.includes(store.format)) return false
  if (type.length && !type.includes(store.type)) return false
  if (category.length && !category.includes(store.store_category)) return false
  return true
}

// One line for the list: who a checklist is for. With the store list it names
// up to two stores and counts the rest.
export function conditionsLabel(conditions, allStores = []) {
  const ids = conditions?.stores || []
  if (ids.length) {
    const names = ids.map((id) => allStores.find((s) => s.id === id)?.name || id)
    return names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2} more`
  }
  const parts = [...(conditions?.format || []), ...(conditions?.type || []), ...(conditions?.category || [])]
  return parts.length ? parts.join(', ') : 'All stores'
}

// Checklists grouped by name, newest version first, groups by name. Each
// group's first entry is its latest version.
export function versionGroups(checklists = []) {
  const groups = new Map()
  for (const c of checklists) {
    if (!groups.has(c.name)) groups.set(c.name, [])
    groups.get(c.name).push(c)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, versions]) => ({ name, versions: [...versions].sort((a, b) => (b.version || 0) - (a.version || 0)) }))
}

// Questions per process, keeping the order given.
export function groupByProcess(questions = []) {
  const groups = new Map()
  for (const q of questions) {
    const name = q.process || 'Other'
    if (!groups.has(name)) groups.set(name, [])
    groups.get(name).push(q)
  }
  return [...groups.entries()].map(([process, items]) => ({ process, items }))
}

// How many exceptions of each kind, biggest first.
export function exceptionKinds(rows = []) {
  const counts = new Map()
  for (const r of rows) counts.set(r.kind, (counts.get(r.kind) || 0) + 1)
  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind))
}

// The checklists that apply to a store (all of them when no store is picked yet).
export const fittingChecklists = (checklists = [], store) => checklists.filter((c) => checklistFitsStore(c, store))

// Tick or untick one checklist in a list of ids.
export const toggleId = (ids, id) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])

// When the store changes, keep only the chosen checklists that still apply to it.
export function keepFitting(ids, checklists, store) {
  const ok = new Set(fittingChecklists(checklists, store).map((c) => c.id))
  return ids.filter((id) => ok.has(id))
}

// One line under the list: how many are chosen and about how many questions they bring.
export function checklistSummary(ids, checklists) {
  const chosen = checklists.filter((c) => ids.includes(c.id))
  if (!chosen.length) return 'No checklist: the audit is scheduled without questions.'
  const questions = chosen.reduce((sum, c) => sum + (c.question_count || 0), 0)
  return `${chosen.length} ${chosen.length === 1 ? 'checklist' : 'checklists'} chosen, up to ${questions} questions (a question in two checklists is asked once).`
}
