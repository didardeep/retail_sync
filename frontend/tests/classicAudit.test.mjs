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
    r('2', 'A', 'Yes', { weight: 1 }),
    r('3', 'A', 'No', { weight: 1 }),
    r('4', 'A', 'NA', { weight: 5 }),
    r('5', 'A', null, { weight: 5 }),
  ]);
  assert.equal(previewScore(a), 75);
  const b = audit([
    r('1', 'A', 'Yes', { weight: 3 }),
    r('2', 'A', 'No', { weight: 3 }),
    r('3', 'A', 'No', { weight: 1 }),
  ]);
  assert.equal(previewScore(b), 42.86);
});

test('previewScore treats a missing weight as 1 and returns null when nothing is scored', () => {
  assert.equal(previewScore(audit([r('1', 'A', 'Yes', { weight: null }), r('2', 'A', 'No', { weight: 0 })])), 50);
  assert.equal(previewScore(audit([r('1', 'A', 'NA'), r('2', 'A', null)])), null);
  assert.equal(previewScore(audit([])), null);
});

const PROOF = { remarks: 'Till short', evidence: [{ type: 'photo', url: '/api/evidence/a.jpg' }] };

test('a No without remarks or evidence, or an NA without a reason, is a problem that says what is missing', () => {
  const a = audit([
    r('1', 'A', 'No'),
    r('2', 'A', 'No', { remarks: '  ', evidence: PROOF.evidence }),
    r('3', 'A', 'No', { remarks: 'Seen' }),
    r('4', 'A', 'No', PROOF),
    r('5', 'A', 'Yes'),
    r('6', 'A', 'NA'),
    r('7', 'A', 'NA', { remarks: 'No cash counter in this store' }),
  ]);
  assert.deepEqual(problems(a).filter((x) => x.kind === 'no_proof').map((x) => [x.id, x.missing]),
    [['1', ['remarks', 'evidence']], ['2', ['remarks']], ['3', ['evidence']], ['6', ['remarks']]]);
});

test('missingProof and proofLabel', async () => {
  const { missingProof, proofLabel } = await import('../src/lib/classicAudit.js');
  assert.deepEqual(missingProof({ answer: 'Yes' }), []);
  assert.deepEqual(missingProof({ answer: 'No' }), ['remarks', 'evidence']);
  assert.deepEqual(missingProof({ answer: 'No', ...PROOF }), []);
  // NA needs a reason, never evidence.
  assert.deepEqual(missingProof({ answer: 'NA' }), ['remarks']);
  assert.deepEqual(missingProof({ answer: 'NA', remarks: 'No cash counter here' }), []);
  assert.equal(proofLabel(['remarks', 'evidence']), 'remarks and evidence');
  assert.equal(proofLabel(['evidence']), 'evidence');
});

test('problems lists unanswered and critical No that has no issue yet', () => {
  const a = audit([
    r('1', 'A', null),
    r('2', 'A', 'No', { is_critical: true, ...PROOF }),
    r('3', 'A', 'No', { is_critical: false, ...PROOF }),
    r('4', 'A', 'Yes', { is_critical: true }),
    r('5', 'A', 'No', { is_critical: true, issue_id: 'ISS1', ...PROOF }),
  ]);
  const p = problems(a);
  assert.deepEqual(p.map((x) => [x.kind, x.id, x.index]), [['unanswered', '1', 0], ['critical_no', '2', 1]]);
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

test('an empty annexure blocks submit unless the answer is NA', async () => {
  const { missingAnnexure, problems } = await import('../src/lib/classicAudit.js');
  const template = { columns: [{ name: 'Cash', type: 'number' }], default_rows: 1 };
  const named = { rows: [{ label: 'Till 1', cells: [''] }] };
  assert.equal(missingAnnexure({ answer: 'Yes', annexure_template: template, annexure: null }), true);
  assert.equal(missingAnnexure({ answer: 'Yes', annexure_template: template, annexure: named }), true);
  assert.equal(missingAnnexure({ answer: 'Yes', annexure_template: template, annexure: { rows: [{ label: '', cells: ['50'] }] } }), false);
  assert.equal(missingAnnexure({ answer: 'NA', annexure_template: template, annexure: null }), false);
  assert.equal(missingAnnexure({ answer: null, annexure_template: template }), false);
  assert.equal(missingAnnexure({ answer: 'Yes' }), false);

  const a = audit([r('1', 'A', 'Yes', { annexure_template: template })]);
  assert.deepEqual(problems(a).map((x) => x.kind), ['no_annexure']);
});
