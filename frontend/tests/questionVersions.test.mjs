import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authorOf, changeSummary, compareVersions, describeAnnexure, versionBadge,
} from '../src/lib/questionVersions.js';

const v1 = { version: 1, text: 'Is cash counted?', process: 'Cashiering', criticality: 'Low', active: true, meta: { tags: ['cash'] } };
const v6 = {
  version: 6, text: 'Is cash counted?', process: 'Cashiering', criticality: 'High', active: true,
  meta: { tags: ['cash'], annexure: { columns: [{ name: 'Cash', type: 'text' }, { name: 'Value', type: 'number', total: true }], default_rows: 3, row_labels: ['Till 1'] } },
};

test('compare marks only the fields that differ', () => {
  const rows = compareVersions(v1, v6);
  const changed = rows.filter((r) => r.changed).map((r) => r.field);
  assert.deepEqual(changed, ['criticality', 'annexure']);
  const crit = rows.find((r) => r.field === 'criticality');
  assert.equal(crit.before, 'Low');
  assert.equal(crit.after, 'High');
});

test('an annexure layout reads as one line', () => {
  assert.equal(describeAnnexure(null), 'None');
  assert.equal(describeAnnexure(v6.meta.annexure), 'Cash, Value (total) | 3 rows (Till 1)');
});

test('change summary names the changed fields, or says it was created', () => {
  assert.equal(changeSummary({ version: 6, changes: { criticality: ['Low', 'High'], annexure: [null, {}] } }), 'Criticality, Annexure');
  assert.equal(changeSummary({ version: 1, changes: {} }), 'Created');
});

test('first versions without an author read as imported', () => {
  assert.equal(authorOf({ version: 1 }), 'Imported');
  assert.equal(authorOf({ version: 3, edited_by: 'Didar' }), 'Didar');
});

test('a version badge shows only for answers on an older version', () => {
  assert.equal(versionBadge(1, 6), 'v1, now v6');
  assert.equal(versionBadge(6, 6), '');
  assert.equal(versionBadge(1, undefined), '');
});
