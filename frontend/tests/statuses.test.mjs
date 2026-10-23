import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUDITOR_EDITABLE, AUDIT_STATUSES, STAGES, isAuditorEditable, stageBadgeClass, stageOf,
} from '../src/lib/statuses.js';

test('stageOf maps every status', () => {
  assert.equal(stageOf('Planned'), 'scheduled');
  assert.equal(stageOf('Ongoing'), 'in_progress');
  assert.equal(stageOf('Completed'), 'completed');
  assert.equal(stageOf('Approved'), 'approved');
  assert.equal(stageOf('Cancelled'), 'cancelled');
});

test('stageOf falls back for unknown statuses', () => {
  assert.equal(stageOf('Planned (late)'), 'scheduled');
  assert.equal(stageOf('Whatever'), 'in_progress');
  assert.equal(stageOf(undefined), 'in_progress');
});

test('every status maps to a known stage', () => {
  const stages = new Set(STAGES.map((s) => s.value));
  for (const s of AUDIT_STATUSES) assert.ok(stages.has(stageOf(s)));
});

test('isAuditorEditable', () => {
  assert.deepEqual(AUDITOR_EDITABLE, ['Planned', 'Ongoing']);
  assert.equal(isAuditorEditable('Planned'), true);
  assert.equal(isAuditorEditable('Ongoing'), true);
  for (const s of ['Completed', 'Approved', 'Cancelled', undefined]) {
    assert.equal(isAuditorEditable(s), false);
  }
});

test('stageBadgeClass colours', () => {
  assert.match(stageBadgeClass('in_progress'), /amber/);
  assert.match(stageBadgeClass('completed'), /emerald/);
  assert.match(stageBadgeClass('approved'), /emerald/);
  assert.match(stageBadgeClass('scheduled'), /muted/);
  assert.match(stageBadgeClass('cancelled'), /muted/);
});
