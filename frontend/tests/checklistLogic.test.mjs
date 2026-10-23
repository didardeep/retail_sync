import test from 'node:test';
import assert from 'node:assert/strict';

import {
  groupQuestions, visibleQuestions,
} from '../src/components/checklist/checklistLogic.js';

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
