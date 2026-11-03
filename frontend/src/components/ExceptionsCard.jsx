import { useEffect, useState } from 'react';

import { api } from '@/api/client';
import { exceptionKinds } from '@/lib/checklists';
import { CRITERIA } from '@/lib/scoreCriteria';
import InfoButton from '@/components/InfoButton';
import { Badge } from '@/components/ui/badge';

const SEVERITY = { High: 'bg-red-50 text-red-800', Medium: 'bg-amber-50 text-amber-800' };

// Exceptions found in the imported cash and inventory data, for the stores in
// `storeIds`. They come from the data, not from an audit answer.
export default function ExceptionsCard({ storeIds, limit = 8 }) {
  const [rows, setRows] = useState(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.exceptions()
      .then((r) => { if (!cancelled) setRows(r || []); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, []);

  if (rows === null) return null;
  const wanted = new Set(storeIds);
  const list = rows.filter((r) => wanted.has(r.store_id));
  const shown = showAll ? list : list.slice(0, limit);

  return (
    <div className="rounded-[10px] border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[13px] font-semibold text-foreground">
        <span>Data Analytics Exceptions<InfoButton lines={CRITERIA.exceptions} /><span className="ml-2 text-[11px] font-normal text-muted-foreground">{list.length} to verify</span></span>
        <span className="flex flex-wrap gap-1.5">
          {exceptionKinds(list).map((k) => (
            <span key={k.kind} className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-medium text-foreground/80">{k.kind}: {k.count}</span>
          ))}
        </span>
      </div>
      {shown.length ? shown.map((r, i) => (
        <div key={i} className="flex items-start justify-between gap-3 border-t border-border py-2 first:border-0">
          <div className="min-w-0">
            <div className="text-[12.5px] font-semibold text-foreground">{r.title}</div>
            <div className="text-[11px] text-muted-foreground">
              {storeIds.length > 1 ? `${r.store} • ` : ''}{r.kind}{r.date ? ` • ${r.date}` : ''} • {r.detail}
            </div>
          </div>
          <Badge className={SEVERITY[r.severity]}>{r.severity}</Badge>
        </div>
      )) : <div className="p-5 text-center text-xs text-muted-foreground">No exceptions in the imported data</div>}
      {list.length > limit && (
        <button type="button" className="mt-2 text-xs font-medium text-primary hover:underline" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `Show all ${list.length}`}
        </button>
      )}
    </div>
  );
}
