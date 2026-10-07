import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUDITOR_EDITABLE, FINAL_STATUSES, LEGACY_STATUSES, SOP_STATUSES, STAGES,
  isAuditorEditable, stageBadgeClass, stageOf,
} from '../src/lib/statuses.js';

test('stageOf maps every legacy status', () => {
  assert.equal(stageOf('legacy', 'Planned'), 'scheduled');
  assert.equal(stageOf('legacy', 'Ongoing'), 'in_progress');
  assert.equal(stageOf('legacy', 'Completed'), 'completed');
  assert.equal(stageOf('legacy', 'Approved'), 'approved');
});

test('stageOf maps every SOP status', () => {
  assert.equal(stageOf('sop', 'Planned'), 'scheduled');
  assert.equal(stageOf('sop', 'Draft'), 'in_progress');
  assert.equal(stageOf('sop', 'Returned'), 'in_progress');
  assert.equal(stageOf('sop', 'Submitted'), 'completed');
  assert.equal(stageOf('sop', 'Approved'), 'approved');
  assert.equal(stageOf('sop', 'Cancelled'), 'cancelled');
});

test('stageOf falls back for unknown statuses', () => {
  assert.equal(stageOf('sop', 'Planned (late)'), 'scheduled');
  assert.equal(stageOf('legacy', 'Whatever'), 'in_progress');
  assert.equal(stageOf('sop', undefined), 'in_progress');
});

test('every status maps to a known stage', () => {
  const stages = new Set(STAGES.map((s) => s.value));
  for (const s of LEGACY_STATUSES) assert.ok(stages.has(stageOf('legacy', s)));
  for (const s of SOP_STATUSES) assert.ok(stages.has(stageOf('sop', s)));
});

test('isAuditorEditable', () => {
  assert.deepEqual(AUDITOR_EDITABLE, ['Planned', 'Draft']);
  assert.equal(isAuditorEditable('Planned'), true);
  assert.equal(isAuditorEditable('Draft'), true);
  for (const s of ['Submitted', 'Approved', 'Cancelled', 'Returned', undefined]) {
    assert.equal(isAuditorEditable(s), false);
  }
  assert.deepEqual(FINAL_STATUSES, ['Submitted', 'Approved']);
});

test('stageBadgeClass colours', () => {
  assert.match(stageBadgeClass('in_progress'), /amber/);
  assert.match(stageBadgeClass('completed'), /emerald/);
  assert.match(stageBadgeClass('approved'), /emerald/);
  assert.match(stageBadgeClass('scheduled'), /muted/);
  assert.match(stageBadgeClass('cancelled'), /muted/);
});

test('a cancelled classic audit is in the cancelled stage', () => {
  assert.equal(stageOf('legacy', 'Cancelled'), 'cancelled');
});
