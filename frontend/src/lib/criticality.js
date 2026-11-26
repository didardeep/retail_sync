// Question criticality: High, Medium or Low. It sets how much a question counts
// in the audit score. Keep in step with backend app.models.CRITICALITY_WEIGHT.

export const CRITICALITIES = ['High', 'Medium', 'Low']
export const CRITICALITY_WEIGHT = { High: 3, Medium: 2, Low: 1 }

const BADGE = {
  High: 'border border-red-200 bg-red-50 text-red-700',
  Medium: 'border border-amber-200 bg-amber-50 text-amber-800',
  Low: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
}

// The level of a question or answer row. Rows from before criticality existed
// fall back to the old flag and 1-5 weight, the same way the server migrated them.
export function criticalityOf(q) {
  if (CRITICALITIES.includes(q?.criticality)) return q.criticality
  if (q?.is_critical) return 'High'
  const w = Number(q?.weight) || 0
  return w >= 5 ? 'High' : w >= 3 ? 'Medium' : 'Low'
}

export const criticalityClass = (level) => BADGE[level] || BADGE.Low
