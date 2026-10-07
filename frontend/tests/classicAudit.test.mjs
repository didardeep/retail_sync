import test from 'node:test';
import assert from 'node:assert/strict';

import {
  firstUnansweredIndex, isAuditorEditable, orderedQuestions, parseQuestionParam,
  previewScore, problems, processes, progress,
} from '../src/lib/classicAudit.js';

const r = (id, process, answer, extra = {}) => ({
  id, process, answer, question_code: `Q${id}`, question_text: `Text ${id}`, weight: 1, ...extra,
});

const audit = (responses, extra = {}) => ({
  id: 'AUD-1', auditor_id: 'u1', status: 'Ongoing', responses, ...extra,
});

test('orderedQuestions groups by process and keeps order', () => {
  const a = audit([r('1', 'B'), r('2', 'A'), r('3', 'B'), r('4', null)]);
  const q = orderedQuestions(a);
  assert.deepEqual(q.map((x) => x.id), ['1', '3', '2', '4']);
  assert.deepEqual(q.map((x) => x.index), [0, 1, 2, 3]);
  assert.equal(q[1].index_in_process, 1);
  assert.equal(q[1].process_size, 2);
  assert.equal(q[3].process, 'General');
  assert.deepEqual(processes(a), [
    { name: 'B', first: 0 }, { name: 'A', first: 2 }, { name: 'General', first: 3 },
  ]);
});

test('orderedQuestions tolerates missing data', () => {
  assert.deepEqual(orderedQuestions(null), []);
  assert.deepEqual(orderedQuestions({}), []);
});

test('progress counts answered', () => {
  assert.deepEqual(progress(audit([r('1', 'A', 'Yes'), r('2', 'A', null), r('3', 'A', 'NA')])),
    { answered: 2, total: 3, percent: 67 });
  assert.deepEqual(progress(audit([])), { answered: 0, total: 0, percent: 0 });
});

test('previewScore uses the server rule', () => {
  const a = audit([
    r('1', 'A', 'Yes', { weight: 2 }),
    r('2', 'A', 'Partial', { weight: 1 }),
    r('3', 'A', 'No', { weight: 1 }),
    r('4', 'A', 'NA', { weight: 5 }),
    r('5', 'A', null, { weight: 5 }),
  ]);
  assert.equal(previewScore(a), 62.5);
  const b = audit([
    r('1', 'A', 'Yes', { weight: 3 }),
    r('2', 'A', 'Partial', { weight: 3 }),
    r('3', 'A', 'No', { weight: 1 }),
  ]);
  assert.equal(previewScore(b), 64.29);
});

test('previewScore treats a missing weight as 1 and returns null when nothing is scored', () => {
  assert.equal(previewScore(audit([r('1', 'A', 'Yes', { weight: null }), r('2', 'A', 'No', { weight: 0 })])), 50);
  assert.equal(previewScore(audit([r('1', 'A', 'NA'), r('2', 'A', null)])), null);
  assert.equal(previewScore(audit([])), null);
});

test('problems lists unanswered and critical No', () => {
  const a = audit([
    r('1', 'A', null),
    r('2', 'A', 'No', { is_critical: true }),
    r('3', 'A', 'No', { is_critical: false }),
    r('4', 'A', 'Yes', { is_critical: true }),
  ]);
  const p = problems(a);
  assert.deepEqual(p.map((x) => [x.kind, x.id, x.index]), [['unanswered', '1', 0], ['raises_issue', '2', 1]]);
});

test('firstUnansweredIndex follows the wizard order', () => {
  assert.equal(firstUnansweredIndex(audit([r('1', 'B', 'Yes'), r('2', 'A', null), r('3', 'B', null)])), 1);
  assert.equal(firstUnansweredIndex(audit([r('1', 'B', 'Yes')])), -1);
});

test('isAuditorEditable needs the owning auditor and an open status', () => {
  const me = { id: 'u1', role: 'AUDITOR' };
  assert.equal(isAuditorEditable(audit([], { status: 'Planned' }), me), true);
  assert.equal(isAuditorEditable(audit([], { status: 'Ongoing' }), me), true);
  assert.equal(isAuditorEditable(audit([], { status: 'Completed' }), me), false);
  assert.equal(isAuditorEditable(audit([], { status: 'Approved' }), me), false);
  assert.equal(isAuditorEditable(audit([], { status: 'Cancelled' }), me), false);
  assert.equal(isAuditorEditable(audit([]), { id: 'u2', role: 'AUDITOR' }), false);
  assert.equal(isAuditorEditable(audit([]), { id: 'u1', role: 'ADMIN' }), false);
  assert.equal(isAuditorEditable(null, me), false);
  assert.equal(isAuditorEditable(audit([]), null), false);
});

test('parseQuestionParam validates the deep link', () => {
  assert.equal(parseQuestionParam('3', 5), 3);
  assert.equal(parseQuestionParam('0', 5), 0);
  assert.equal(parseQuestionParam('5', 5), null);
  assert.equal(parseQuestionParam('-1', 5), null);
  assert.equal(parseQuestionParam('x', 5), null);
  assert.equal(parseQuestionParam(null, 5), null);
  assert.equal(parseQuestionParam('', 5), null);
});
