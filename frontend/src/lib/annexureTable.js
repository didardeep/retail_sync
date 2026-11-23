// Annexure tables: the layout is set on a question (meta.annexure), the auditor fills in rows.
// Mirrors backend/app/annexure_table.py; the server is the one that has the last word.

export const MAX_COLUMNS = 20;
export const MAX_ROWS = 200;
export const MAX_DEFAULT_ROWS = 50;

export function emptyTemplate() {
  return { columns: [{ name: '', type: 'text' }], row_header: '', row_labels: [], default_rows: 3 };
}

// True for empty text or text that reads as a number ("1,500" and "-2.5" are fine).
export function isNumberText(text) {
  const t = String(text ?? '').trim();
  if (!t) return true;
  return Number.isFinite(Number(t.replace(/,/g, '')));
}

export function blankRow(template, label = '') {
  return { label, cells: template.columns.map(() => '') };
}

// The rows to show before anything was saved: one per named row, then blanks up to default_rows.
export function initialRows(template) {
  const labels = template.row_labels || [];
  const count = Math.max(labels.length, template.default_rows || 0);
  return Array.from({ length: count }, (_, i) => blankRow(template, labels[i] || ''));
}

// The saved rows when there are any, otherwise the starting rows.
export function rowsFor(template, value) {
  const saved = value?.rows;
  return Array.isArray(saved) && saved.length ? saved : initialRows(template);
}

export function addRow(rows, template) {
  return rows.length >= MAX_ROWS ? rows : [...rows, blankRow(template)];
}

export function removeRow(rows, index) {
  return rows.filter((_, i) => i !== index);
}

export function setCell(rows, r, c, text) {
  return rows.map((row, i) => (i === r ? { ...row, cells: row.cells.map((x, j) => (j === c ? text : x)) } : row));
}

export function setLabel(rows, r, text) {
  return rows.map((row, i) => (i === r ? { ...row, label: text } : row));
}

// The first problem in the rows, or '' when they are fine to save.
export function rowsProblem(template, rows) {
  for (let r = 0; r < rows.length; r += 1) {
    for (let c = 0; c < template.columns.length; c += 1) {
      if (template.columns[c].type === 'number' && !isNumberText(rows[r].cells[c])) {
        return `Row ${r + 1}, ${template.columns[c].name}: "${rows[r].cells[c]}" is not a number`;
      }
    }
  }
  return '';
}

// The sum of one number column, as text. Empty and unreadable cells count as nothing.
export function columnTotal(rows, c) {
  let sum = 0;
  for (const row of rows) {
    const t = String(row.cells[c] ?? '').trim();
    const n = Number(t.replace(/,/g, ''));
    if (t && Number.isFinite(n)) sum += n;
  }
  return String(Math.round(sum * 1e6) / 1e6);
}

export function hasTotals(template) {
  return template.columns.some((col) => col.type === 'number' && col.total);
}

// A row with nothing typed in it (a blank row the auditor never used).
export function rowIsBlank(row) {
  return !row.label.trim() && row.cells.every((c) => !String(c).trim());
}

// How many rows have something in them, for the "Annexure (3 rows)" button.
export function filledCount(value) {
  return (value?.rows || []).filter((row) => !rowIsBlank(row)).length;
}

// The first problem in a layout being built, or '' when it is fine to save.
export function templateProblem(template) {
  const names = new Set();
  if (!template.columns.length) return 'Add at least one column';
  for (const col of template.columns) {
    const name = col.name.trim();
    if (!name) return 'Every column needs a name';
    if (names.has(name.toLowerCase())) return `Column "${name}" is used twice`;
    names.add(name.toLowerCase());
  }
  if (!(template.default_rows >= 0 && template.default_rows <= MAX_DEFAULT_ROWS)) {
    return `Default rows must be 0 to ${MAX_DEFAULT_ROWS}`;
  }
  return '';
}

// The layout as it is sent to the server: names trimmed, empty row names dropped.
export function cleanTemplate(template) {
  const labels = (template.row_labels || []).map((l) => l.trim()).filter(Boolean);
  const out = {
    columns: template.columns.map((c) => ({
      name: c.name.trim(), type: c.type, ...(c.type === 'number' && c.total ? { total: true } : {}),
    })),
    default_rows: Number(template.default_rows) || 0,
  };
  if (labels.length) {
    out.row_labels = labels;
    out.row_header = (template.row_header || '').trim();
  }
  return out;
}
