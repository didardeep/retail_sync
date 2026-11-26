import { Plus, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MAX_COLUMNS, MAX_ROWS, emptyTemplate, initialRows, templateProblem } from '@/lib/annexureTable';
import { cn, fieldClass, labelClass } from '@/lib/utils';

// The audit manager's one-time layout for a question's annexure: column names (text or
// number), optional row names, and how many rows show up to begin with. `value` is the layout
// (or null for no annexure) and `onChange` gets the new layout.
export default function AnnexureBuilder({ value, onChange }) {
  if (!value) {
    return (
      <Button type="button" variant="outline" onClick={() => onChange(emptyTemplate())}>
        <Plus /> Add an annexure table
      </Button>
    );
  }

  const columns = value.columns;
  const labels = value.row_labels || [];
  const hasLabels = labels.length > 0;
  const problem = templateProblem(value);
  const set = (patch) => onChange({ ...value, ...patch });
  const setColumn = (i, patch) => set({ columns: columns.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const previewRows = initialRows(value);

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12.5px] font-bold text-foreground">Annexure table</span>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange(null)}>
          <Trash2 /> Remove annexure
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="border-collapse text-[12px]">
          <thead>
            <tr>
              {hasLabels && (
                <th className="p-1 align-top">
                  <Input aria-label="Name for the row names column" placeholder="Row header" className="min-w-[110px]"
                    value={value.row_header || ''} onChange={(e) => set({ row_header: e.target.value })} />
                </th>
              )}
              {columns.map((col, i) => (
                <th key={i} className="p-1 align-top">
                  <div className="flex items-center gap-1">
                    <Input aria-label={`Column ${i + 1} name`} placeholder={`Column ${i + 1}`} className="min-w-[110px]"
                      value={col.name} onChange={(e) => setColumn(i, { name: e.target.value })} />
                    {columns.length > 1 && (
                      <button type="button" aria-label={`Remove column ${i + 1}`} className="text-muted-foreground hover:text-destructive"
                        onClick={() => set({ columns: columns.filter((_, j) => j !== i) })}><X size={14} /></button>
                    )}
                  </div>
                  <select aria-label={`Column ${i + 1} type`} className={cn(fieldClass, 'mt-1 min-h-0 py-1 text-[11.5px]')}
                    value={col.type} onChange={(e) => setColumn(i, { type: e.target.value, total: false })}>
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                  </select>
                  {col.type === 'number' && (
                    <label className="mt-1 flex items-center gap-1 text-[11.5px] font-normal">
                      <input type="checkbox" checked={!!col.total} onChange={(e) => setColumn(i, { total: e.target.checked })} />
                      Show total
                    </label>
                  )}
                </th>
              ))}
              <th className="p-1 align-top">
                {columns.length < MAX_COLUMNS && (
                  <Button type="button" size="sm" variant="outline" aria-label="Add column"
                    onClick={() => set({ columns: [...columns, { name: '', type: 'text' }] })}><Plus /> Column</Button>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, r) => (
              <tr key={r}>
                {hasLabels && (
                  <td className="p-1">
                    <Input aria-label={`Row ${r + 1} name`} placeholder="Row name" value={labels[r] ?? ''}
                      onChange={(e) => set({ row_labels: previewRows.map((_, k) => (k === r ? e.target.value : labels[k] ?? '')) })} />
                  </td>
                )}
                {row.cells.map((_, c) => (
                  <td key={c} className="p-1"><div className="h-9 min-w-[110px] rounded-md border border-dashed bg-background" /></td>
                ))}
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex flex-wrap items-end gap-3">
        {previewRows.length < MAX_ROWS && (
          <Button type="button" size="sm" variant="outline"
            onClick={() => set({ default_rows: Math.max(value.default_rows || 0, previewRows.length) + 1 })}>
            <Plus /> Row
          </Button>
        )}
        <label className="flex items-center gap-2 text-[12px]">
          <input type="checkbox" checked={hasLabels}
            onChange={(e) => set(e.target.checked
              ? { row_labels: [''], row_header: value.row_header || '' }
              : { row_labels: [], row_header: '' })} />
          Name the rows
        </label>
        <div>
          <label className={labelClass} htmlFor="annexure-default-rows">Rows to show at the start</label>
          <Input id="annexure-default-rows" type="number" min="0" max="50" className="w-24" value={value.default_rows}
            onChange={(e) => set({ default_rows: e.target.value === '' ? '' : Number(e.target.value) })} />
        </div>
      </div>
      <p className="mt-2 text-[11.5px] text-muted-foreground">
        The auditor can add or delete rows and fill the empty cells. Number columns only take numbers.
      </p>
      {problem && <p className="mt-1 text-[11.5px] font-semibold text-destructive">{problem}</p>}
    </div>
  );
}
