import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checklistFitsStore, conditionsLabel, exceptionKinds, groupByProcess, storeChoices,
} from '../src/lib/checklists.js';

test('a checklist with no conditions fits every store', () => {
  assert.equal(checklistFitsStore({ conditions: {} }, { format: 'COCO' }), true);
  assert.equal(checklistFitsStore({}, { format: 'COCO' }), true);
});

test('conditions limit a checklist by format and by category', () => {
  const c = { conditions: { format: ['COCO'], category: ['Mall'] } };
  assert.equal(checklistFitsStore(c, { format: 'COCO', store_category: 'Mall' }), true);
  assert.equal(checklistFitsStore(c, { format: 'FOFO', store_category: 'Mall' }), false);
  assert.equal(checklistFitsStore(c, { format: 'COCO', store_category: 'High street' }), false);
});

test('an inactive checklist fits nothing; no store picked yet shows active ones', () => {
  assert.equal(checklistFitsStore({ is_active: false }, { format: 'COCO' }), false);
  assert.equal(checklistFitsStore({ conditions: { format: ['COCO'] } }, undefined), true);
});

test('store choices are the distinct values, sorted, without blanks', () => {
  assert.deepEqual(storeChoices([
    { format: 'FOFO', store_category: 'Mall' }, { format: 'COCO' }, { format: 'FOFO', store_category: null },
  ]), { formats: ['COCO', 'FOFO'], categories: ['Mall'] });
});

test('conditions read as a short label', () => {
  assert.equal(conditionsLabel({}), 'All stores');
  assert.equal(conditionsLabel({ format: ['COCO'], category: ['Mall'] }), 'COCO, Mall');
});

test('questions group by process in the order given', () => {
  const groups = groupByProcess([{ id: 1, process: 'Cash' }, { id: 2 }, { id: 3, process: 'Cash' }]);
  assert.deepEqual(groups.map((g) => [g.process, g.items.length]), [['Cash', 2], ['Other', 1]]);
});

test('exception kinds are counted, biggest first', () => {
  assert.deepEqual(exceptionKinds([{ kind: 'B' }, { kind: 'A' }, { kind: 'B' }]),
    [{ kind: 'B', count: 2 }, { kind: 'A', count: 1 }]);
});
