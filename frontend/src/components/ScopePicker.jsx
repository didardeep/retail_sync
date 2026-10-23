import { Building2, ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { parseScopeValue, scopeValue } from '@/lib/dashboardScope';

// The Dashboard's main control: a labelled, bordered selector that lists all
// brands, then the brands, then the stores. Replaces the plain StorePicker.
export default function ScopePicker({ brands, stores, scope, onChange, className }) {
  const sortedStores = [...stores].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className={cn('min-w-[260px]', className)}>
      <label htmlFor="scope-picker" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Viewing
      </label>
      <div className="relative">
        <Building2 aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary" />
        <select
          id="scope-picker"
          value={scopeValue(scope)}
          onChange={(e) => onChange(parseScopeValue(e.target.value))}
          className="h-11 w-full cursor-pointer appearance-none rounded-lg border-2 border-primary/50 bg-card pl-10 pr-9 text-sm font-semibold text-foreground shadow-sm hover:border-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="all">All brands, all stores</option>
          <optgroup label="Brands">
            {brands.map((b) => <option key={b.id} value={`brand:${b.id}`}>{b.name}</option>)}
          </optgroup>
          <optgroup label="Stores">
            {sortedStores.map((s) => (
              <option key={s.id} value={`store:${s.id}`}>
                {s.name}{s.city ? ` (${s.city})` : ''}
              </option>
            ))}
          </optgroup>
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}
