import test from 'node:test'
import assert from 'node:assert/strict'

import { checkDecision, decisionBody, evidenceCount, reviewFilter } from '../src/lib/auditReview.js'

const t = (note, category = 'wrong_answer') => ({ note, category })

test('approve is allowed only when nothing is ticked', () => {
  assert.equal(checkDecision({ decision: 'approve' }), '')
  assert.match(checkDecision({ decision: 'approve', ticked: { a: t('why') } }), /Untick/)
})

test('return needs a ticked question, a reason for each, and an overall reason', () => {
  assert.match(checkDecision({ decision: 'return', reason: 'Fix', ticked: {} }), /Tick at least one/)
  assert.match(checkDecision({ decision: 'return', reason: 'Fix', ticked: { a: t(' ') } }), /each ticked/)
  assert.match(checkDecision({ decision: 'return', reason: ' ', ticked: { a: t('why') } }), /what the auditor/)
  assert.equal(checkDecision({ decision: 'return', reason: 'Fix', ticked: { a: t('why') } }), '')
})

test('reject needs a reason', () => {
  assert.match(checkDecision({ decision: 'reject', reason: '  ' }), /Say why/)
  assert.equal(checkDecision({ decision: 'reject', reason: 'Wrong store' }), '')
  assert.match(checkDecision({ decision: 'maybe' }), /Choose/)
})

test('decisionBody sends the ticked questions, with categories, only when returning', () => {
  const ticked = { r1: t(' blurry ', 'unclear_photo'), r2: t('missing', 'missing_evidence') }
  assert.deepEqual(decisionBody('return', ' Fix ', ticked), {
    decision: 'return', reason: 'Fix',
    items: [
      { response_id: 'r1', note: 'blurry', category: 'unclear_photo' },
      { response_id: 'r2', note: 'missing', category: 'missing_evidence' },
    ],
  })
  assert.deepEqual(decisionBody('reject', 'No', ticked).items, [])
})

test('evidenceCount adds up the files; a fixed question is back to review', () => {
  assert.equal(evidenceCount([{ evidence: [1, 2] }, { evidence: [] }, {}]), 2)
  const rows = [{ review_status: 'replied' }, { review_status: 'approved' }, { review_status: 'query' }]
  assert.equal(reviewFilter(rows, 'pending').length, 1)
})
