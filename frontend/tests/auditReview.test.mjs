import assert from 'node:assert/strict';
import test from 'node:test';

import { openQueries, reviewFilter, reviewProgress } from '../src/lib/auditReview.js';
import { stageLabel } from '../src/lib/statuses.js';

const rows = [
  { id: 1, answer: 'Yes', review_status: 'approved' },
  { id: 2, answer: 'No', review_status: 'query' },
  { id: 3, answer: 'No', review_status: 'replied' },
  { id: 4, answer: 'NA' },
];
const ids = (list) => list.map((r) => r.id);

test('filters split the questions; a reply is back with the manager', () => {
  assert.deepEqual(ids(reviewFilter(rows)), [1, 2, 3, 4]);
  assert.deepEqual(ids(reviewFilter(rows, 'pending')), [3, 4]);
  assert.deepEqual(ids(reviewFilter(rows, 'query')), [2]);
  assert.deepEqual(ids(reviewFilter(rows, 'approved')), [1]);
  assert.deepEqual(ids(reviewFilter(rows, 'failed')), [2, 3]);
});

test('progress counts approved questions', () => {
  assert.deepEqual(reviewProgress(rows), { total: 4, approved: 1, queried: 1, pending: 2, percent: 25 });
  assert.equal(reviewProgress([]).percent, 0);
});

test('open queries are the asked and the answered ones', () => {
  assert.deepEqual(ids(openQueries(rows)), [2, 3]);
});

test('stage labels match the filter wording', () => {
  assert.equal(stageLabel('scheduled'), 'Scheduled');
  assert.equal(stageLabel('in_progress'), 'In progress');
});
