import { cn, fieldClass } from '@/lib/utils';

// Store selector for ADMIN / AUDIT_MANAGER. `allowAll` adds an "All stores"
// option (value ''); without it the caller must always hold a real store id.
export default function StorePicker({ stores, value, onChange, allowAll = false, className }) {
  return (
    <select
      aria-label="Store"
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      className={cn(fieldClass, 'w-auto min-w-[200px]', className)}
    >
      {allowAll && <option value="">All stores</option>}
      {stores.map(s => (
        <option key={s.id} value={s.id}>{s.name}{s.city ? ` (${s.city})` : ''}</option>
      ))}
    </select>
  );
}
