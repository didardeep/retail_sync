// Pure rules for the audit manager's question-by-question review.

export const REVIEW_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'To review' },
  { value: 'query', label: 'Queried' },
  { value: 'approved', label: 'Approved' },
  { value: 'failed', label: 'Answered No' },
]

// A reply brings a query back to the manager, so it counts as to review.
const toReview = (r) => !r.review_status || r.review_status === 'replied'

export function reviewFilter(responses = [], filter = 'all') {
  switch (filter) {
    case 'pending': return responses.filter(toReview)
    case 'query': return responses.filter((r) => r.review_status === 'query')
    case 'approved': return responses.filter((r) => r.review_status === 'approved')
    case 'failed': return responses.filter((r) => r.answer === 'No')
    default: return responses
  }
}

export function reviewProgress(responses = []) {
  const total = responses.length
  const approved = reviewFilter(responses, 'approved').length
  return {
    total, approved,
    queried: reviewFilter(responses, 'query').length,
    pending: reviewFilter(responses, 'pending').length,
    percent: total ? Math.round((approved / total) * 100) : 0,
  }
}

// Questions the manager asked about, for the auditor to answer.
export const openQueries = (responses = []) =>
  responses.filter((r) => r.review_status === 'query' || r.review_status === 'replied')

// The manager's verdict on a whole audit. `ticked` maps a question id to
// { note, category }: why it should be checked again. Returns the message to show,
// or '' when the decision can go ahead.
export function checkDecision({ decision, reason = '', ticked = {} }) {
  const notes = Object.values(ticked)
  if (decision === 'approve') {
    return notes.length ? 'Untick the questions before approving' : ''
  }
  if (decision === 'return') {
    if (!notes.length) return 'Tick at least one question to check again'
    if (notes.some((n) => !(n.note || '').trim())) return 'Say why each ticked question is checked again'
    return reason.trim() ? '' : 'Say what the auditor should fix'
  }
  if (decision === 'reject') {
    return reason.trim() ? '' : 'Say why the audit is rejected'
  }
  return 'Choose approve, return or reject'
}

// The body for POST /audits/:id/decision.
export function decisionBody(decision, reason, ticked) {
  return {
    decision,
    reason: reason.trim(),
    items: decision === 'return'
      ? Object.entries(ticked).map(([response_id, t]) => ({ response_id, note: t.note.trim(), category: t.category || null }))
      : [],
  }
}

// Number of evidence files across the answers.
export const evidenceCount = (responses = []) =>
  responses.reduce((sum, r) => sum + (r.evidence?.length || 0), 0)
