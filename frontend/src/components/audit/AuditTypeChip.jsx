import { cn } from '@/lib/utils';

// 'Scored' (SOP tool) or 'Checklist' (classic audit) tag.
export default function AuditTypeChip({ label, className }) {
  const scored = label === 'Scored';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        scored ? 'border-primary/30 bg-primary/5 text-primary' : 'border-border bg-muted text-muted-foreground',
        className,
      )}
    >
      {label}
    </span>
  );
}
