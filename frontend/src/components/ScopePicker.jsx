import { ChevronDown, Store } from 'lucide-react';

import { cn } from '@/lib/utils';

const selectClass = 'h-11 w-full cursor-pointer appearance-none rounded-[7px] border border-border bg-card pl-8 pr-7 text-xs font-semibold md:h-[30px] text-foreground shadow-sm hover:border-primary/50 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function Picker({ id, label, icon: Icon, value, onChange, children }) {
  return (
    <div className="min-w-[150px]">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <Icon aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-primary" />
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
          {children}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}

// The Dashboard's main control: a store dropdown. onChange gets the store id;
// '' means all stores.
export default function ScopePicker({ stores, storeId, onChange, className }) {
  const storeChoices = [...stores].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className={cn('flex flex-wrap items-end gap-2', className)}>
      <Picker id="store-picker" label="Store" icon={Store} value={storeId} onChange={onChange}>
        <option value="">All stores</option>
        {storeChoices.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}{s.city ? ` (${s.city})` : ''}
          </option>
        ))}
      </Picker>
    </div>
  );
}
