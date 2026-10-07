// The client-side scoring rules must match the server's (backend/app/services/__init__.py):
// the phone shows these totals and blocking problems before anything is sent.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  firstUnansweredIndex, flattenCriteria, isAnswered, isNa, problems, summarize, validateScore,
} from '../src/lib/offline/scoring.js';

const tree = {
  sections: [
    { id: 's1', code: 'A', name: 'Back office', criteria: [
      { id: 'q1', title: 'One', marks: 4, default_na: false },
      { id: 'q2', title: 'Two', marks: 2, default_na: false, requires_comment: true },
    ] },
    { id: 's2', code: 'B', name: 'Front end', criteria: [
      { id: 'q3', title: 'Three (N/A)', marks: 4, default_na: true },
      { id: 'q4', title: 'Four', marks: 5, default_na: false, requires_photo: true },
    ] },
  ],
};
const row = (score, extra = {}) => ({ score, is_na: false, ...extra });

test('validateScore: range, half steps, blanks', () => {
  assert.equal(validateScore('', 4), null);
  assert.equal(validateScore(null, 4), null);
  assert.equal(validateScore('2', 4), null);
  assert.equal(validateScore('1.5', 4), null);
  assert.equal(validateScore('0', 4), null);
  assert.match(validateScore('5', 4), /Maximum is 4/);
  assert.match(validateScore('-1', 4), /negative/);
  assert.match(validateScore('1.3', 4), /0\.5/);
  assert.match(validateScore('abc', 4), /number/);
});

test('N/A: an explicit N/A row wins; no row follows the template default', () => {
  const [, q2, q3] = tree.sections.flatMap((s) => s.criteria);
  assert.equal(isNa(q3, undefined), true);                       // "(N/A)" question, never touched
  assert.equal(isNa(q2, undefined), false);
  assert.equal(isNa(q3, row(null, { is_na: false })), false);    // auditor turned N/A off
  assert.equal(isNa(q2, row(null, { is_na: true })), true);
  assert.equal(isAnswered(q2, undefined), false);
  assert.equal(isAnswered(q2, row(1)), true);
  assert.equal(isAnswered(q3, undefined), true);                 // N/A counts as handled
});

test('summarize: N/A leaves the maximum, sections add up', () => {
  const s = summarize(tree, { q1: row(3), q2: row(1) });
  assert.equal(s.max_score, 4 + 2 + 5);                          // q3 is default N/A
  assert.equal(s.score, 4);
  assert.equal(s.applicable, 3);
  assert.equal(s.answered, 2);
  assert.deepEqual(s.sections.map((x) => [x.code, x.score, x.max_score]), [['A', 4, 6], ['B', 0, 5]]);
  assert.equal(s.percent, Math.round((4 / 11) * 10000) / 100);
  // turning a question N/A shrinks the maximum
  const na = summarize(tree, { q1: row(null, { is_na: true }), q2: row(1) });
  assert.equal(na.max_score, 2 + 5);
});

test('summarize: an empty audit is 0 of the applicable maximum, never a divide by zero', () => {
  const s = summarize(tree, {});
  assert.equal(s.score, 0);
  assert.equal(s.max_score, 11);
  assert.equal(s.percent, 0);
  assert.equal(summarize({ sections: [] }, {}).percent, 0);
});

test('problems: unanswered, comment required, photo required (same rules as the server)', () => {
  const all = { q1: row(4), q2: row(2), q4: row(5) };
  assert.deepEqual(problems(tree, all, []).map((p) => [p.criterion_id, p.problem]).sort(),
    [['q2', 'Comment required'], ['q4', 'Photo required']]);
  const fixed = { ...all, q2: row(2, { comment: 'checked' }) };
  assert.deepEqual(problems(tree, fixed, [{ criterion_id: 'q4' }]), []);
  assert.deepEqual(problems(tree, fixed, [{ criterion_id: 'q4', deleted: true }]).map((p) => p.criterion_id), ['q4']);
  assert.deepEqual(problems(tree, {}, []).map((p) => p.problem), ['Not answered', 'Not answered', 'Not answered']);
  // a comment of only spaces does not count
  assert.equal(problems(tree, { ...fixed, q2: row(2, { comment: '   ' }) }, [{ criterion_id: 'q4' }]).length, 1);
});

test('flattenCriteria keeps section context and order', () => {
  const flat = flattenCriteria(tree);
  assert.deepEqual(flat.map((c) => c.id), ['q1', 'q2', 'q3', 'q4']);
  assert.deepEqual([flat[1].section_code, flat[1].index_in_section, flat[1].section_size], ['A', 1, 2]);
});

test('firstUnansweredIndex: resume where the work stopped', () => {
  assert.equal(firstUnansweredIndex(tree, {}), 0);
  assert.equal(firstUnansweredIndex(tree, { q1: row(4) }), 1);
  // q3 is "(N/A)" by default, so after q1 and q2 the next open question is q4 (index 3)
  assert.equal(firstUnansweredIndex(tree, { q1: row(4), q2: row(1) }), 3);
  // everything answered: stay on the last question
  assert.equal(firstUnansweredIndex(tree, { q1: row(4), q2: row(1), q4: row(5) }), 3);
  assert.equal(firstUnansweredIndex({ sections: [] }, {}), 0);
});
