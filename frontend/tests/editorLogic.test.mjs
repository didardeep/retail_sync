import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addCriterion, addSection, describeField, diffTrees, draftKey, issuesFor,
  marksOk, moveCriterion, moveSection, nextSectionCode, normalizeTree,
  prepareTree, removeCriterion, removeSection, toPayload, totalMarks,
  updateCriterion, updateSection, updateTool, validateTree,
} from '../src/components/sop-admin/editorLogic.js';

const crit = (key, title, marks = 2, extra = {}) => ({
  key, title, marks, max_text: 'Always', avg_text: '', min_text: 'Never',
  default_na: false, requires_comment: false, requires_photo: false, ...extra,
});

function tool() {
  return prepareTree({
    code: 'CASH', name: 'Cash tool', min_rule: 'zero',
    sections: [
      { key: 'sa', code: 'A', name: 'Till', criteria: [crit('q1', 'Count the till', 4), crit('q2', 'Lock the safe')] },
      { key: 'sb', code: 'B', name: 'Stock', criteria: [crit('q3', 'Check shelves')] },
    ],
  });
}

const titles = (t, s) => t.sections[s].criteria.map((c) => c.title);

test('prepareTree gives every item an editor id, keeping the key where there is one', () => {
  const t = tool();
  assert.equal(t.sections[0]._id, 'sa');
  assert.equal(t.sections[0].criteria[1]._id, 'q2');
  const added = addCriterion(t, 0);
  assert.ok(added.sections[0].criteria[2]._id.startsWith('new-'));
});

test('edits return new trees and leave the old one alone', () => {
  const t = tool();
  const u = updateCriterion(t, 0, 1, { marks: 3, title: 'Lock the safe nightly' });
  assert.equal(t.sections[0].criteria[1].marks, 2);
  assert.equal(u.sections[0].criteria[1].marks, 3);
  assert.equal(updateSection(t, 1, { name: 'Shelves' }).sections[1].name, 'Shelves');
  assert.equal(updateTool(t, { name: 'Renamed' }).name, 'Renamed');
  assert.equal(t.name, 'Cash tool');
});

test('sections can be added, removed and moved', () => {
  const t = tool();
  const withNew = addSection(t);
  assert.equal(withNew.sections.length, 3);
  assert.equal(withNew.sections[2].code, 'C');
  assert.equal(withNew.sections[2].key, null);
  assert.equal(withNew.sections[2].criteria.length, 1);
  assert.equal(nextSectionCode(removeSection(withNew, 0)), 'A');       // A is free again
  assert.deepEqual(moveSection(t, 0, 1).sections.map((s) => s.code), ['B', 'A']);
  assert.deepEqual(moveSection(t, 0, -1).sections.map((s) => s.code), ['A', 'B']);   // already first
  assert.deepEqual(moveSection(t, 1, 1).sections.map((s) => s.code), ['A', 'B']);    // already last
});

test('criteria can be added, removed and moved within a section', () => {
  const t = tool();
  assert.equal(addCriterion(t, 1).sections[1].criteria.length, 2);
  assert.deepEqual(titles(removeCriterion(t, 0, 0), 0), ['Lock the safe']);
  assert.deepEqual(titles(moveCriterion(t, 0, 0, 1), 0), ['Lock the safe', 'Count the till']);
  assert.deepEqual(titles(moveCriterion(t, 0, 0, -1), 0), ['Count the till', 'Lock the safe']);
  assert.deepEqual(titles(moveCriterion(t, 0, 1, 1), 0), ['Count the till', 'Lock the safe']);
});

test('totalMarks skips N/A by default and unusable marks', () => {
  let t = tool();
  assert.equal(totalMarks(t), 8);
  t = updateCriterion(t, 0, 1, { default_na: true })
  assert.equal(totalMarks(t), 6);
  t = updateCriterion(t, 0, 0, { marks: '' })
  assert.equal(totalMarks(t), 2);
  t = updateCriterion(t, 1, 0, { marks: '3.5' })
  assert.equal(totalMarks(t), 3.5);
});

test('marksOk accepts positive halves only', () => {
  for (const v of [0.5, 1, 2.5, '3', '1.5', 10]) assert.equal(marksOk(v), true, String(v));
  for (const v of [0, -1, 1.25, '', 'x', null, undefined, NaN, '0']) assert.equal(marksOk(v), false, String(v));
});

test('a good tree has no problems', () => {
  assert.deepEqual(validateTree(tool()), []);
});

test('validateTree reports each problem against the item it belongs to', () => {
  let t = tool();
  t = updateCriterion(t, 0, 0, { marks: 0 });
  t = updateCriterion(t, 0, 1, { title: '  ', max_text: '' });
  t = updateSection(t, 1, { name: '', criteria: [], code: 'A' });
  t = updateTool(t, { name: ' ' });
  const issues = validateTree(t);
  assert.deepEqual(issuesFor(issues, null, null).map((i) => i.field), ['name']);
  assert.equal(issuesFor(issues, 0, 0)[0].message, 'marks must be above 0 in steps of 0.5');
  assert.deepEqual(issuesFor(issues, 0, 1).map((i) => i.field), ['title', 'max_text']);
  assert.deepEqual(issuesFor(issues, 1, null).map((i) => i.field), ['name', 'code', 'criteria']);
  assert.ok(issues.some((i) => i.text === 'Section A, question 1: marks must be above 0 in steps of 0.5'));
  assert.ok(issues.some((i) => i.text === 'Section A: section code A is used twice'));
});

test('Best and Least text are not needed when the question is N/A by default', () => {
  const t = updateCriterion(tool(), 0, 0, { max_text: '', min_text: '', default_na: true });
  assert.deepEqual(validateTree(t), []);
  const empty = { ...tool(), sections: [] };
  assert.equal(validateTree(empty)[0].text, 'A tool needs at least one section');
});

test('duplicate keys are flagged', () => {
  let t = updateCriterion(tool(), 1, 0, { key: 'q1' });
  assert.ok(validateTree(t).some((i) => i.message === 'question key q1 is used twice'));
  t = updateSection(tool(), 1, { key: 'sa' });
  assert.ok(validateTree(t).some((i) => i.message === 'section key sa is used twice'));
});

test('an unchanged tree has an empty diff, even after cleaning', () => {
  const t = tool();
  const same = updateCriterion(t, 0, 0, { title: '  Count the till ', max_text: ' Always ', avg_text: null });
  assert.equal(diffTrees(t, same).summary.total, 0);
});

test('diff lists added, removed, changed and reordered items', () => {
  const base = tool();
  let t = updateCriterion(base, 0, 0, { marks: 5, requires_photo: true });
  t = removeCriterion(t, 0, 1);                                   // q2 removed
  t = addCriterion(t, 1);
  t = updateCriterion(t, 1, 1, { title: 'Wipe the counter', max_text: 'a', min_text: 'b' });
  t = moveSection(t, 0, 1);                                       // B before A
  const d = diffTrees(base, t);
  assert.deepEqual(d.summary, { added: 1, removed: 1, changed: 1, reordered: 2, total: 5 });
  assert.equal(d.added[0].label, 'Wipe the counter');
  assert.equal(d.added[0].section, 'B. Stock');
  assert.equal(d.removed[0].label, 'Lock the safe');
  assert.deepEqual(d.changed[0].fields.map((f) => f.field), ['marks', 'requires_photo']);
  assert.deepEqual(d.reordered.map((r) => [r.label, r.from, r.to]), [['B. Stock', 2, 1], ['A. Till', 1, 2]]);
});

test('reordering questions inside a section is reported, and moving between sections is a change', () => {
  const base = tool();
  const swapped = moveCriterion(base, 0, 1, -1);
  const d = diffTrees(base, swapped);
  assert.equal(d.summary.reordered, 2);
  assert.equal(d.summary.total, 2);

  const elsewhere = addCriterion(removeCriterion(base, 1, 0), 0);
  const moved = updateCriterion(elsewhere, 0, 2, { ...base.sections[1].criteria[0] });
  const e = diffTrees(base, moved);
  assert.equal(e.summary.removed, 0);
  assert.equal(e.summary.added, 0);
  assert.deepEqual(e.changed[0].fields, [{ field: 'section', old: 'B. Stock', new: 'A. Till' }]);
});

test('a new section brings its questions along as added', () => {
  const t = updateCriterion(updateSection(addSection(tool()), 2, { name: 'Safety' }), 2, 0,
    { title: 'Fire exit clear', max_text: 'Yes', min_text: 'No' });
  const d = diffTrees(tool(), t);
  assert.deepEqual(d.added.map((a) => [a.kind, a.label]), [['section', 'C. Safety'], ['criterion', 'Fire exit clear']]);
});

test('tool-level changes show up as changes', () => {
  const d = diffTrees(tool(), updateTool(tool(), { name: 'Cash Audit', min_rule: 'third' }));
  assert.equal(d.summary.changed, 2);
  assert.equal(describeField(d.changed[0].fields[0]), 'Name: Cash tool -> Cash Audit');
  assert.equal(describeField({ field: 'requires_photo', old: false, new: true }), 'Photo required: no -> yes');
  assert.equal(describeField({ field: 'avg_text', old: null, new: 'x' }), 'Average text: (empty) -> x');
});

test('the publish payload is cleaned, numeric and free of editor fields', () => {
  const t = updateCriterion(tool(), 0, 0, { marks: '4.5', avg_text: '   ' });
  const payload = toPayload(t);
  assert.equal(payload.code, undefined);
  assert.equal(payload.sections[0].criteria[0].marks, 4.5);
  assert.equal(payload.sections[0].criteria[0].avg_text, null);
  assert.equal(payload.sections[0].criteria[0]._id, undefined);
  assert.equal(payload.sections[0].key, 'sa');
  assert.equal(normalizeTree(addSection(tool())).sections[2].key, null);
});

test('the autosave key names the tool and the version it started from', () => {
  assert.equal(draftKey('CASH', 3), 'sop-editor:CASH@3');
});
