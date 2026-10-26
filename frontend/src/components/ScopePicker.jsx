import { Building2, ChevronDown, Store } from 'lucide-react';

import { cn } from '@/lib/utils';

const selectClass = 'h-9 w-full cursor-pointer appearance-none rounded-lg border border-primary/50 bg-card pl-10 pr-9 text-sm font-semibold text-foreground shadow-sm hover:border-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function Picker({ id, label, icon: Icon, value, onChange, children }) {
  return (
    <div className="w-full sm:w-[240px]">
      <label htmlFor={id} className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <Icon aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary" />
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
          {children}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}

// The Dashboard's main control: two dropdowns, brand and store, that work
// together or alone. With a brand picked the store list only has its stores.
// onChange gets { brand } or { store }; '' means all.
export default function ScopePicker({ brands, stores, brandId, storeId, onChange, className }) {
  const storeChoices = [...stores]
    .filter((s) => !brandId || s.brand_id === brandId)
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className={cn('flex flex-wrap items-end gap-2', className)}>
      <Picker id="brand-picker" label="Brand" icon={Building2} value={brandId} onChange={(brand) => onChange({ brand })}>
        <option value="">All brands</option>
        {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </Picker>
      <Picker id="store-picker" label="Store" icon={Store} value={storeId} onChange={(store) => onChange({ store })}>
        <option value="">{brandId ? 'All stores of this brand' : 'All stores'}</option>
        {storeChoices.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}{s.city ? ` (${s.city})` : ''}
          </option>
        ))}
      </Picker>
    </div>
  );
}
