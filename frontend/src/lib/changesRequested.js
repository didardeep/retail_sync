// What the auditor sees when the audit manager sends an audit back: the flagged
// questions, which of them they have changed, and how to move between them.
import { orderedQuestions } from './classicAudit.js'

export const CATEGORY_LABELS = {
  wrong_answer: 'Wrong answer',
  missing_evidence: 'Missing evidence',
  unclear_photo: 'Unclear photo',
  other: 'Other',
}

export const categoryLabel = (value) => CATEGORY_LABELS[value] || ''

// The flagged (queried) questions in the order the wizard shows them, with
// the position each has in that order.
export function flaggedQuestions(audit) {
  return orderedQuestions(audit)
    .map((r, index) => ({ r, index }))
    .filter(({ r }) => r.review_status === 'query')
    .map(({ r, index }) => ({
      index,
      id: r.id,
      code: r.question_code || `Q${index + 1}`,
      text: r.question_text || '',
      note: r.review_note || '',
      category: r.review_category || null,
      by: r.reviewed_by || 'Audit manager',
    }))
}

// How many flagged questions the auditor has touched since the audit came back.
export function fixProgress(flagged, changedIds) {
  const changed = new Set(changedIds || [])
  const done = flagged.filter((f) => changed.has(f.id)).length
  return { done, total: flagged.length, left: flagged.length - done, allDone: flagged.length > 0 && done === flagged.length }
}

// The next (delta 1) or previous (delta -1) flagged question after position
// `current`, or null when there is none in that direction.
export function stepFlagged(flagged, current, delta) {
  if (delta > 0) return flagged.find((f) => f.index > current)?.index ?? null
  const before = flagged.filter((f) => f.index < current)
  return before.length ? before[before.length - 1].index : null
}
