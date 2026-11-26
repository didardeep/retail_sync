import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  MAX_ROWS, addRow, columnTotal, hasTotals, isNumberText, removeRow, rowsFor, rowsProblem, setCell, setLabel,
} from '@/lib/annexureTable';
import { cn } from '@/lib/utils';

// The annexure table for one answer. Editable for the auditor (fill cells, add or delete
// rows, Save); a plain table when `readOnly`. `template` is the layout set on the question,
// `value` what was saved so far, `onSave` gets {rows} (blank rows are kept as typed).
export default function AnnexureGrid({ template, value, readOnly = false, onSave, onCancel }) {
  const [rows, setRows] = useState(() => rowsFor(template, value));
  const hasLabels = (template.row_labels || []).length > 0 || rows.some((r) => r.label);
  const problem = rowsProblem(template, rows);
  const header = template.row_header || 'Row';

  if (readOnly) {
    const saved = value?.rows || [];
    const close = onCancel && (
      <div className="mt-3 flex justify-end"><Button type="button" variant="outline" onClick={onCancel}>Close</Button></div>
    );
    if (!saved.length) return <div><div className="text-xs text-muted-foreground">No annexure filled in.</div>{close}</div>;
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              {hasLabels && <th className="border bg-muted/40 px-2 py-1 text-left font-semibold">{header}</th>}
              {template.columns.map((c) => <th key={c.name} className="border bg-muted/40 px-2 py-1 text-left font-semibold">{c.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {saved.map((row, r) => (
              <tr key={r}>
                {hasLabels && <td className="border px-2 py-1">{row.label}</td>}
                {row.cells.map((cell, c) => <td key={c} className="border px-2 py-1">{cell}</td>)}
              </tr>
            ))}
          </tbody>
          {hasTotals(template) && (
            <tfoot>
              <tr className="font-semibold">
                {hasLabels && <td className="border bg-muted/40 px-2 py-1">Total</td>}
                {template.columns.map((col, c) => (
                  <td key={c} className="border bg-muted/40 px-2 py-1">{col.type === 'number' && col.total ? columnTotal(saved, c) : ''}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
        {close}
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-[12px]">
          <thead>
            <tr>
              {hasLabels && <th className="p-1 text-left font-semibold">{header}</th>}
              {template.columns.map((c) => (
                <th key={c.name} className="p-1 text-left font-semibold">
                  {c.name}{c.type === 'number' && <span className="ml-1 font-normal text-muted-foreground">(number)</span>}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {hasLabels && (
                  <td className="p-1">
                    <Input aria-label={`Row ${r + 1} name`} className="min-w-[120px]" value={row.label}
                      onChange={(e) => setRows((prev) => setLabel(prev, r, e.target.value))} />
                  </td>
                )}
                {template.columns.map((col, c) => {
                  const bad = col.type === 'number' && !isNumberText(row.cells[c]);
                  return (
                    <td key={c} className="p-1">
                      <Input aria-label={`Row ${r + 1} ${col.name}`} aria-invalid={bad} className={cn('min-w-[110px]', bad && 'border-destructive')}
                        inputMode={col.type === 'number' ? 'decimal' : undefined} value={row.cells[c]}
                        onChange={(e) => setRows((prev) => setCell(prev, r, c, e.target.value))} />
                    </td>
                  );
                })}
                <td className="p-1">
                  <button type="button" aria-label={`Delete row ${r + 1}`} className="p-2 text-muted-foreground hover:text-destructive"
                    onClick={() => setRows((prev) => removeRow(prev, r))}><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
          {hasTotals(template) && (
            <tfoot>
              <tr className="font-semibold">
                {hasLabels && <td className="p-1 pl-3">Total</td>}
                {template.columns.map((col, c) => (
                  <td key={c} className="p-1 pl-3" aria-label={col.total ? `Total ${col.name}` : undefined}>
                    {col.type === 'number' && col.total ? columnTotal(rows, c) : ''}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {!rows.length &&<div className="py-2 text-xs text-muted-foreground">No rows. Add one below.</div>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {rows.length < MAX_ROWS && (
          <Button type="button" size="sm" variant="outline" onClick={() => setRows((prev) => addRow(prev, template))}>
            <Plus /> Add row
          </Button>
        )}
        {problem && <span className="text-[11.5px] font-semibold text-destructive">{problem}</span>}
      </div>
      <div className="mt-3 flex justify-end gap-1.5">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="button" disabled={!!problem} onClick={() => onSave({ rows })}>Save annexure</Button>
      </div>
    </div>
  );
}
