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
