import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addRow, cleanTemplate, columnTotal, filledCount, hasTotals, initialRows, isNumberText, removeRow, rowsFor, rowsProblem,
  setCell, setLabel, templateProblem,
} from '../src/lib/annexureTable.js';

const template = {
  columns: [{ name: 'Opening', type: 'number' }, { name: 'Notes', type: 'text' }],
  row_labels: ['Counter 1', 'Counter 2'],
  default_rows: 3,
};

test('numbers: empty and formatted numbers pass, words do not', () => {
  assert.equal(isNumberText(''), true);
  assert.equal(isNumberText(' 1,500.50 '), true);
  assert.equal(isNumberText('-2'), true);
  assert.equal(isNumberText('abc'), false);
  assert.equal(isNumberText('12abc'), false);
});

test('starting rows are the named rows, then blanks up to the default', () => {
  const rows = initialRows(template);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.label), ['Counter 1', 'Counter 2', '']);
  assert.deepEqual(rows[0].cells, ['', '']);
  assert.equal(initialRows({ columns: [{ name: 'A', type: 'text' }], default_rows: 0 }).length, 0);
});

test('named rows beyond the default still all show', () => {
  const t = { ...template, row_labels: ['a', 'b', 'c', 'd'], default_rows: 1 };
  assert.equal(initialRows(t).length, 4);
});

test('saved rows win over the starting rows', () => {
  const saved = { rows: [{ label: 'x', cells: ['1', ''] }] };
  assert.equal(rowsFor(template, saved).length, 1);
  assert.equal(rowsFor(template, null).length, 3);
  assert.equal(rowsFor(template, { rows: [] }).length, 3);
});

test('add, remove and edit rows without changing the originals', () => {
  const rows = initialRows(template);
  const more = addRow(rows, template);
  assert.equal(more.length, 4);
  assert.equal(rows.length, 3);
  assert.equal(removeRow(more, 0).length, 3);
  assert.equal(setCell(rows, 1, 0, '9')[1].cells[0], '9');
  assert.equal(rows[1].cells[0], '');
  assert.equal(setLabel(rows, 2, 'New')[2].label, 'New');
});

test('a number column rejects words and names the cell', () => {
  const rows = setCell(initialRows(template), 1, 0, 'lots');
  assert.match(rowsProblem(template, rows), /Row 2, Opening/);
  assert.equal(rowsProblem(template, setCell(rows, 1, 0, '5')), '');
});

test('a column total adds the numbers and skips empty and unreadable cells', () => {
  let rows = initialRows(template);
  rows = setCell(rows, 0, 0, '1,500');
  rows = setCell(rows, 1, 0, '2.25');
  rows = setCell(rows, 2, 0, 'abc');
  assert.equal(columnTotal(rows, 0), '1502.25');
  assert.equal(columnTotal([], 0), '0');
  assert.equal(columnTotal(setCell(rows, 0, 0, '0.1'), 0), '2.35');
});

test('totals are on only for number columns that ask for one', () => {
  assert.equal(hasTotals(template), false);
  assert.equal(hasTotals({ columns: [{ name: 'A', type: 'number', total: true }] }), true);
  assert.equal(hasTotals({ columns: [{ name: 'A', type: 'text', total: true }] }), false);
  const out = cleanTemplate({ columns: [{ name: 'A', type: 'number', total: true }, { name: 'B', type: 'text', total: true }], default_rows: 1 });
  assert.equal(out.columns[0].total, true);
  assert.equal('total' in out.columns[1], false);
});

test('filled count ignores blank rows', () => {
  const rows = setCell(initialRows(template), 0, 1, 'ok');
  assert.equal(filledCount({ rows }), 2);
  assert.equal(filledCount(null), 0);
});

test('a layout needs named, unique columns', () => {
  assert.match(templateProblem({ columns: [], default_rows: 1 }), /at least one column/);
  assert.match(templateProblem({ columns: [{ name: ' ', type: 'text' }], default_rows: 1 }), /needs a name/);
  assert.match(templateProblem({ columns: [{ name: 'A', type: 'text' }, { name: 'a', type: 'text' }], default_rows: 1 }), /twice/);
  assert.equal(templateProblem({ columns: [{ name: 'A', type: 'text' }], default_rows: 1 }), '');
  assert.match(templateProblem({ columns: [{ name: 'A', type: 'text' }], default_rows: 99 }), /Default rows/);
});

test('the layout sent to the server is trimmed and drops empty row names', () => {
  const out = cleanTemplate({
    columns: [{ name: ' Opening ', type: 'number' }], row_header: ' Counter ', row_labels: ['  ', ' A '], default_rows: '2',
  });
  assert.deepEqual(out, { columns: [{ name: 'Opening', type: 'number' }], default_rows: 2, row_labels: ['A'], row_header: 'Counter' });
  assert.equal('row_labels' in cleanTemplate({ columns: [{ name: 'A', type: 'text' }], row_labels: [''], default_rows: 0 }), false);
});
