import { ChevronRight, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn, fieldClass } from '@/lib/utils';
import { STORE_VIEWS, formatDay } from './auditHelpers';

// Search, region select and status chips above the store list.
export function StoreFilters({ q, onQ, region, onRegion, regions, view, onView }) {
  return (
    <div className="mb-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => onQ(e.target.value)}
            placeholder="Search stores"
            aria-label="Search stores"
            className="h-10 pl-9"
          />
        </div>
        <select
          className={cn(fieldClass, 'h-10 w-auto min-w-[120px]')}
          value={region}
          onChange={(e) => onRegion(e.target.value)}
          aria-label="Filter by region"
        >
          <option value="">All regions</option>
          {regions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {STORE_VIEWS.map((v) => (
          <button
            key={v.value || 'all'}
            type="button"
            onClick={() => onView(v.value)}
            aria-pressed={view === v.value}
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs',
              view === v.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card',
            )}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// One store row: name, city and the badges the auditor decides on.
export function StoreRow({ summary, selected, first, onSelect }) {
  const s = summary;
  return (
    <button
      type="button"
      onClick={() => onSelect(s.store_id)}
      aria-expanded={selected}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent',
        !first && 'border-t border-border',
        selected && 'bg-primary/5',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground">{s.name}</div>
        <div className="truncate text-xs text-muted-foreground">{s.city || s.region || ''}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {s.scheduled > 0 && <Badge variant="outline">{s.scheduled} scheduled</Badge>}
          {s.in_progress > 0 && (
            <Badge className="border-transparent bg-amber-500 text-white hover:bg-amber-500">
              {s.in_progress} in progress
            </Badge>
          )}
          {typeof s.last_percent === 'number' && (
            <span className="text-xs text-muted-foreground">
              Last audit {Math.round(s.last_percent)}%{s.last_date ? ` on ${formatDay(s.last_date)}` : ''}
            </span>
          )}
        </div>
      </div>
      <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', selected && 'rotate-90')} />
    </button>
  );
}
