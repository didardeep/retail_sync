// Pure rules for checklists and data exceptions, kept here so they can be tested.

const distinct = (values) => [...new Set(values.filter(Boolean))].sort()

// The formats and categories that exist in the store list, for the builder.
export function storeChoices(stores = []) {
  return {
    formats: distinct(stores.map((s) => s.format)),
    categories: distinct(stores.map((s) => s.store_category)),
  }
}

// A checklist applies to a store unless its conditions name other values.
// An empty list means every store.
export function checklistFitsStore(checklist, store) {
  if (checklist.is_active === false) return false
  if (!store) return true
  const { format = [], category = [] } = checklist.conditions || {}
  if (format.length && !format.includes(store.format)) return false
  if (category.length && !category.includes(store.store_category)) return false
  return true
}

// One line for the list: who a checklist is for.
export function conditionsLabel(conditions) {
  const parts = [...(conditions?.format || []), ...(conditions?.category || [])]
  return parts.length ? parts.join(', ') : 'All stores'
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
