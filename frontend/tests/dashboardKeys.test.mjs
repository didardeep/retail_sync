import test from 'node:test';
import assert from 'node:assert/strict';

import { buildIndex, filterAudits, pareto, tableRows } from '../src/components/sop-dashboard/logic.js';

// One tool, two versions. The questions q1 and q2 keep their key across the
// versions but get new criterion ids, and q1's marks change from 4 to 6.
function twoVersionData() {
  return {
    stores: [{ id: 'S1', name: 'Store One', city: 'Delhi', region: 'North' }],
    tools: [{ id: 't2', code: 'CASH', name: 'Cash', total_marks: 8, sections: [{ code: 'A', name: 'Till' }] }],
    criteria: [
      { id: 'c1b', key: 'q1', title: 'Count the till', marks: 6, template_code: 'CASH', section_code: 'A', section_name: 'Till' },
      { id: 'c2b', key: 'q2', title: 'Lock the safe', marks: 2, template_code: 'CASH', section_code: 'A', section_name: 'Till' },
    ],
    audits: [
      { id: 'a1', store_id: 'S1', template_id: 't1', template_code: 'CASH', template_version: 1, percent: 66.7, prev_percent: null, submitted_at: '2031-01-01T10:00:00Z', auditor: 'Au', sections: [{ code: 'A', name: 'Till', score: 4, max_score: 6 }] },
      { id: 'a2', store_id: 'S1', template_id: 't2', template_code: 'CASH', template_version: 2, percent: 50, prev_percent: 66.7, submitted_at: '2031-02-01T10:00:00Z', auditor: 'Au', sections: [{ code: 'A', name: 'Till', score: 4, max_score: 8 }] },
    ],
    criterion_scores: [
      { audit_id: 'a1', criterion_id: 'c1a', criterion_key: 'q1', score: 2, marks: 4 },
      { audit_id: 'a1', criterion_id: 'c2a', criterion_key: 'q2', score: 2, marks: 2 },
      { audit_id: 'a2', criterion_id: 'c1b', criterion_key: 'q1', score: 3, marks: 6 },
      { audit_id: 'a2', criterion_id: 'c2b', criterion_key: 'q2', score: 1, marks: 2 },
    ],
  };
}

const allIds = (data) => new Set(data.audits.map((a) => a.id));

test('pareto merges a question across versions into one row', () => {
  const data = twoVersionData();
  const index = buildIndex(data);
  const { rows, totalLost, criteriaWithLoss } = pareto(data, allIds(data), null, index);
  assert.equal(rows.length, 2);
  assert.equal(criteriaWithLoss, 2);
  const q1 = rows.find((r) => r.id === 'q1');
  assert.equal(q1.lost, 5);             // 2 of 4 in v1 plus 3 of 6 in v2
  assert.equal(q1.marks, 10);
  assert.equal(q1.count, 2);
  assert.equal(q1.title, 'Count the till');
  assert.equal(rows[0].id, 'q1');       // biggest loss first
  assert.equal(totalLost, 6);
  assert.equal(rows[1].cumulative, 100);
});

test('pareto only counts the audits in scope and respects the section filter', () => {
  const data = twoVersionData();
  const index = buildIndex(data);
  const onlyV1 = pareto(data, new Set(['a1']), null, index);
  assert.deepEqual(onlyV1.rows.map((r) => [r.id, r.lost]), [['q1', 2]]);
  assert.equal(pareto(data, allIds(data), 'CASH:Z', index).rows.length, 0);
  assert.equal(pareto(data, allIds(data), 'CASH:A', index).rows.length, 2);
});

test('the criterion filter holds a key and matches audits of every version', () => {
  const data = twoVersionData();
  const index = buildIndex(data);
  const audits = filterAudits(data, { tool: 'CASH' }, index);
  const both = tableRows(data, audits, index, { criterion: 'q1' });
  assert.deepEqual(both.map((r) => [r.id, r.criterionText]), [['a1', '2 / 4'], ['a2', '3 / 6']]);
  const onlyNew = tableRows(data, audits, index, { criterion: 'q2' });
  assert.deepEqual(onlyNew.map((r) => [r.id, r.criterionText]), [['a2', '1 / 2']]);
  assert.equal(tableRows(data, audits, index, { criterion: 'c1a' }).length, 0);   // an old id is not a key
  assert.equal(tableRows(data, audits, index, {}).length, 2);
  assert.equal(tableRows(data, audits, index, {})[1].delta, 50 - 66.7);
});

test('the index finds a question by key, and still under its old name', () => {
  const index = buildIndex(twoVersionData());
  assert.equal(index.criterionByKey.q2.title, 'Lock the safe');
  assert.equal(index.criterionById.q2, index.criterionByKey.q2);
});

test('data from a server without keys still groups by criterion id', () => {
  const data = twoVersionData();
  data.criteria = data.criteria.map(({ key, ...c }) => ({ ...c, id: key }));
  data.criterion_scores = data.criterion_scores.map(({ criterion_key, ...r }) => ({ ...r, criterion_id: criterion_key }));
  const index = buildIndex(data);
  assert.equal(pareto(data, allIds(data), null, index).rows[0].lost, 5);
  assert.equal(tableRows(data, data.audits, index, { criterion: 'q1' }).length, 2);
});
