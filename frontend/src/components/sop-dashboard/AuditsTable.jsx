import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { bandFor, round1 } from './logic';
import Panel, { Empty } from './Panel';

const PAGE_SIZE = 10;
const BAND_BADGE = {
  good: 'bg-emerald-100 text-emerald-800',
  warn: 'bg-amber-100 text-amber-900',
  bad: 'bg-red-100 text-red-800',
  none: 'bg-muted text-muted-foreground',
};

function dateOf(iso) {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
}

function Delta({ value }) {
  if (value == null) return <span className="text-muted-foreground">--</span>;
  const up = value >= 0;
  return (
    <span className={cn('inline-flex items-center gap-0.5 font-semibold', up ? 'text-emerald-600' : 'text-red-600')}>
      {up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
      {Math.abs(round1(value))}
    </span>
  );
}

// Every audit in scope, worst first by default. Click a row to open it.
export default function AuditsTable({ rows, sectionLabel, criterionLabel, onOpen, onSelectStore }) {
  const [sort, setSort] = useState({ key: 'percent', dir: 'asc' });
  const [showAll, setShowAll] = useState(false);

  const columns = useMemo(() => {
    const cols = [
      { key: 'store', label: 'Store' },
      { key: 'tool', label: 'Tool' },
      { key: 'submitted_at', label: 'Date' },
      { key: 'percent', label: 'Score' },
      { key: 'delta', label: 'vs last' },
    ];
    if (sectionLabel) cols.push({ key: 'sectionPercent', label: `Section ${sectionLabel}` });
    if (criterionLabel) cols.push({ key: 'criterionText', label: 'That question' });
    return cols;
  }, [sectionLabel, criterionLabel]);

  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir;
    });
  }, [rows, sort]);

  const visible = showAll ? sorted : sorted.slice(0, PAGE_SIZE);

  function toggleSort(key) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  return (
    <Panel
      title="Audits"
      hint={criterionLabel ? `Audits that scored low on: ${criterionLabel}` : 'Worst scores first. Click a row to open the audit.'}
    >
      {rows.length === 0 ? (
        <Empty>No audits match these filters.</Empty>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  {columns.map((c) => (
                    <th key={c.key} className="px-2 py-2 font-semibold">
                      <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-foreground" onClick={() => toggleSort(c.key)}>
                        {c.label}
                        {sort.key === c.key && (sort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => onOpen(r.id)}
                    className="cursor-pointer border-b border-border/60 hover:bg-accent"
                  >
                    <td className="px-2 py-2.5">
                      <button
                        type="button"
                        className="text-left font-medium text-foreground hover:text-primary hover:underline"
                        onClick={(e) => { e.stopPropagation(); onSelectStore(r.store_id); }}
                        title="Focus on this store"
                      >
                        {r.store}
                      </button>
                      <div className="text-[11px] text-muted-foreground">{r.city}</div>
                    </td>
                    <td className="px-2 py-2.5"><Badge variant="outline">{r.tool}</Badge></td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-muted-foreground">{dateOf(r.submitted_at)}</td>
                    <td className="px-2 py-2.5">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', BAND_BADGE[bandFor(r.percent)])}>
                        {round1(r.percent)}%
                      </span>
                    </td>
                    <td className="px-2 py-2.5"><Delta value={r.delta} /></td>
                    {sectionLabel && <td className="px-2 py-2.5">{r.sectionPercent == null ? '--' : `${round1(r.sectionPercent)}%`}</td>}
                    {criterionLabel && <td className="px-2 py-2.5 font-medium text-red-700">{r.criterionText}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sorted.length > PAGE_SIZE && (
            <button
              type="button"
              className="mt-2 text-xs font-semibold text-primary hover:underline"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? 'Show fewer' : `Show all ${sorted.length}`}
            </button>
          )}
        </>
      )}
    </Panel>
  );
}
