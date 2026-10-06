import { cn } from '@/lib/utils';
import Panel from './Panel';

// Freshness: are the scores on this page backed by recent audits everywhere?
export default function CoveragePanel({ coverage, coverageDays, selectedStore, onSelectStore }) {
  const { attention, okCount, total } = coverage;
  return (
    <Panel
      title="Audit coverage"
      hint={`Stores with no audit in the last ${coverageDays} days. Click a store to focus on it.`}
    >
      {attention.length === 0 ? (
        <div className="flex h-[120px] items-center justify-center rounded-md bg-emerald-50 text-xs font-medium text-emerald-800">
          Every store in view was audited within {coverageDays} days.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {attention.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelectStore(s.id)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 px-1 py-2 text-left hover:bg-accent',
                  selectedStore === s.id && 'bg-primary/5',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-foreground">{s.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{s.city}</span>
                </span>
                <span className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  s.status === 'never' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900',
                )}>
                  {s.status === 'never' ? 'Never audited' : `${s.days_since} days ago`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 text-[11px] text-muted-foreground">
        {okCount} of {total} stores covered
      </div>
    </Panel>
  );
}
