import test from 'node:test'
import assert from 'node:assert/strict'

import { categoryLabel, fixProgress, flaggedQuestions, stepFlagged } from '../src/lib/changesRequested.js'

const response = (n, extra = {}) => ({
  id: `r${n}`, process: 'Cashiering', question_code: `Q${n}`, question_text: `Question ${n}`, answer: 'Yes', ...extra,
})
const audit = {
  responses: [
    response(1), response(2, { review_status: 'query', review_note: 'Photo is blurred', review_category: 'unclear_photo', reviewed_by: 'Manager' }),
    response(3), response(4, { review_status: 'query', review_note: 'Wrong total' }), response(5),
  ],
}

test('flaggedQuestions lists the queried questions with their reasons and positions', () => {
  const f = flaggedQuestions(audit)
  assert.deepEqual(f.map((x) => [x.id, x.index, x.code]), [['r2', 1, 'Q2'], ['r4', 3, 'Q4']])
  assert.equal(f[0].note, 'Photo is blurred')
  assert.equal(f[0].category, 'unclear_photo')
  assert.equal(f[1].by, 'Audit manager')
})

test('an audit with nothing flagged has an empty list', () => {
  assert.deepEqual(flaggedQuestions({ responses: [response(1)] }), [])
  assert.deepEqual(flaggedQuestions({}), [])
})

test('fixProgress counts the flagged questions that were changed', () => {
  const f = flaggedQuestions(audit)
  assert.deepEqual(fixProgress(f, []), { done: 0, total: 2, left: 2, allDone: false })
  assert.deepEqual(fixProgress(f, ['r2', 'zzz']), { done: 1, total: 2, left: 1, allDone: false })
  assert.equal(fixProgress(f, ['r2', 'r4']).allDone, true)
  assert.equal(fixProgress([], ['r2']).allDone, false)
})

test('stepFlagged moves between flagged questions and ends with null', () => {
  const f = flaggedQuestions(audit)
  assert.equal(stepFlagged(f, 1, 1), 3)
  assert.equal(stepFlagged(f, 3, 1), null)
  assert.equal(stepFlagged(f, 0, 1), 1)
  assert.equal(stepFlagged(f, 3, -1), 1)
  assert.equal(stepFlagged(f, 1, -1), null)
})

test('category labels are readable', () => {
  assert.equal(categoryLabel('missing_evidence'), 'Missing evidence')
  assert.equal(categoryLabel('nope'), '')
  assert.equal(categoryLabel(null), '')
})
