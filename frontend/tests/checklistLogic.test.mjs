import test from 'node:test';
import assert from 'node:assert/strict';

import {
  filterSopTools, groupQuestions, sopKeys, visibleQuestions,
} from '../src/components/checklist/checklistLogic.js';

const tools = [{
  id: 't1', name: 'Cash Audit', code: 'CASH',
  sections: [
    { id: 's1', name: 'Till', criteria: [
      { id: 'c1', title: 'Count the float', max_text: 'Exact match' },
      { id: 'c2', title: 'Seal bags', min_text: 'Unsealed' },
    ] },
    { id: 's2', name: 'Safe', criteria: [{ id: 'c3', title: 'Key custody' }] },
  ],
}];

test('empty search returns everything', () => {
  assert.equal(filterSopTools(tools, ''), tools);
  assert.equal(sopKeys(tools).length, 1 + 2 + 3);
});

test('search matches rubric text and keeps only matching criteria', () => {
  const r = filterSopTools(tools, 'unsealed');
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].sections.map(s => s.id), ['s1']);
  assert.deepEqual(r[0].sections[0].criteria.map(c => c.id), ['c2']);
});

test('a matching section name keeps all its criteria; no match drops the tool', () => {
  assert.equal(filterSopTools(tools, 'till')[0].sections[0].criteria.length, 2);
  assert.equal(filterSopTools(tools, 'zzz').length, 0);
});

test('visibleQuestions hides pending, rejected and inactive', () => {
  const q = [
    { id: 1, approval_status: 'APPROVED' }, { id: 2, approval_status: 'PENDING' },
    { id: 3, approval_status: 'REJECTED' }, { id: 4 }, { id: 5, active: false, approval_status: 'APPROVED' },
  ];
  assert.deepEqual(visibleQuestions(q).map(x => x.id), [1, 4]);
});

test('groupQuestions groups by process and sub-process and filters', () => {
  const q = [
    { text: 'a', process: 'Cash', sub_process: 'Till' },
    { text: 'b', process: 'Cash', sub_process: 'Safe' },
    { text: 'c', process: 'Stock' },
  ];
  const g = groupQuestions(q, '');
  assert.deepEqual(g.map(x => [x.proc, x.total]), [['Cash', 2], ['Stock', 1]]);
  assert.equal(groupQuestions(q, 'safe').length, 1);
});
