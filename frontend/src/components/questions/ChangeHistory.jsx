import { useEffect, useMemo, useState } from 'react';

import { questionsApi } from '@/api/questionsApi';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate, formatTime } from '@/lib/auditRows';
import { authorOf, changeSummary } from '@/lib/questionVersions';
import { cn, fieldClass } from '@/lib/utils';

const PERIODS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '', label: 'All time' },
];

// Every change to the question bank, newest first: who saved which version,
// when, why and what changed. Clicking an entry opens that question's history.
export default function ChangeHistory({ onOpen, refreshKey }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');
  const [days, setDays] = useState('30');
  const [person, setPerson] = useState('');
  const [search, setSearch] = useState('');
  const [showCreated, setShowCreated] = useState(false);

  useEffect(() => {
    setEntries(null);
    setError('');
    questionsApi.changes({ days }).then(setEntries).catch((e) => setError(e.message || 'Could not load the history'));
  }, [days, refreshKey]);

  const people = useMemo(() => {
    const m = new Map();
    (entries || []).forEach((e) => { if (e.edited_by_id) m.set(e.edited_by_id, e.edited_by); });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [entries]);

  const s = search.trim().toLowerCase();
  const shown = (entries || []).filter((e) => {
    if (!showCreated && e.version === 1) return false;
    if (person && e.edited_by_id !== person) return false;
    if (s && !(e.code.toLowerCase().includes(s) || (e.text || '').toLowerCase().includes(s) || (e.change_note || '').toLowerCase().includes(s))) return false;
    return true;
  });

  return (
    <>
      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <div className="min-w-[180px] flex-1">
          <Input placeholder="Search code, question or reason..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Filter by person">
          <option value="">Everyone</option>
          {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={days} onChange={(e) => setDays(e.target.value)} aria-label="Period">
          {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" className="accent-primary" checked={showCreated} onChange={(e) => setShowCreated(e.target.checked)} />
          Include new questions
        </label>
        {(search || person) && <Button size="sm" variant="outline" onClick={() => { setSearch(''); setPerson(''); }}>Clear</Button>}
      </div>

      <div className="overflow-hidden rounded-[10px] border border-border bg-card">
        {error && <div className="p-6 text-center text-xs text-destructive">{error}</div>}
        {!entries && !error && <div className="p-6 text-center text-xs text-muted-foreground">Loading changes...</div>}
        {entries && !shown.length && <div className="p-10 text-center text-sm text-muted-foreground">No changes in this period</div>}
        {shown.map((e) => (
          <button
            key={e.id}
            type="button"
            className="grid w-full grid-cols-1 gap-1 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-muted/40 sm:grid-cols-[140px_1fr]"
            onClick={() => onOpen(e.code)}
          >
            <div className="text-[11.5px] text-muted-foreground">
              <div className="font-semibold text-foreground">{authorOf(e)}</div>
              {e.created_at && <div>{formatDate(e.created_at)}, {formatTime(e.created_at)}</div>}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                <span className="font-bold">{e.code} v{e.version}</span>
                {e.is_current && <Badge className="border-transparent bg-primary/10 px-1.5 py-0 text-[10px] text-primary">Current</Badge>}
                <span className="truncate text-foreground/80">{e.text}</span>
              </div>
              {e.change_note && <div className="mt-0.5 text-[12px] italic text-foreground/80">"{e.change_note}"</div>}
              <div className="mt-0.5 text-[11px] text-muted-foreground">Changed: {changeSummary(e)}</div>
            </div>
          </button>
        ))}
      </div>
      {entries && <div className="mt-2 text-right text-xs text-muted-foreground">{shown.length} changes</div>}
    </>
  );
}
