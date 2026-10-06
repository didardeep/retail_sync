import { Search, X } from 'lucide-react';

import { cn, fieldClass } from '@/lib/utils';
import { Button } from '@/components/ui/button';

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-9 rounded-md border px-3 text-xs font-semibold transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-muted-foreground hover:bg-accent',
      )}
    >
      {children}
    </button>
  );
}

// Tool chips, region select and search, plus chips for any cross-filters that
// were set by clicking a chart, each removable on its own.
export default function FilterBar({
  tools, regions, filters, onChange, onClearAll, chips, shown, total, onExport,
}) {
  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={!filters.tool} onClick={() => onChange('tool', '')}>All tools</Chip>
        {tools.map((t) => (
          <Chip key={t.code} active={filters.tool === t.code} onClick={() => onChange('tool', t.code)}>
            {t.name}
          </Chip>
        ))}
        <select
          className={cn(fieldClass, 'h-9 w-auto min-w-[140px]')}
          value={filters.region}
          onChange={(e) => onChange('region', e.target.value)}
          aria-label="Filter by region"
        >
          <option value="">All regions</option>
          {regions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <div className="relative min-w-[160px] max-w-xs flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className={cn(fieldClass, 'h-9 pl-8')}
            placeholder="Search stores or audits..."
            value={filters.q}
            onChange={(e) => onChange('q', e.target.value)}
            aria-label="Search audits"
          />
        </div>
        <Button size="sm" variant="outline" className="ml-auto" onClick={onExport}>Export CSV</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Showing <b className="text-foreground">{shown}</b> of {total} audits</span>
        {chips.map((c) => (
          <span key={c.key} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-[11px] font-medium text-primary">
            {c.label}
            <button
              type="button"
              onClick={() => onChange(c.key, '')}
              aria-label={`Remove filter ${c.label}`}
              className="flex size-4 items-center justify-center rounded-full hover:bg-primary/20"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {(chips.length > 0 || filters.tool || filters.region || filters.q) && (
          <button type="button" className="font-semibold text-primary hover:underline" onClick={onClearAll}>
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
