import { cn } from '@/lib/utils';

// Shared card chrome for every widget on the SOP dashboard.
export default function Panel({ title, hint, action, className, children }) {
  return (
    <section className={cn('rounded-[10px] border border-border bg-card p-4', className)}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
          {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }) {
  return (
    <div className="flex h-[140px] items-center justify-center rounded-md border border-dashed border-border px-4 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}
