import { cn } from '@/lib/utils';

// A clickable count tile: icon, label and a big number. `active` outlines it.
export default function Tile({ icon: Icon, tint, label, value, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4 text-left transition-colors hover:bg-accent',
        active && 'border-primary ring-1 ring-primary',
      )}
    >
      <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg" style={{ background: tint }}>
        <Icon className="size-4 text-foreground/70" />
      </div>
      <div>
        <div className="mb-0.5 text-[11px] text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold leading-none text-foreground">{value}</div>
      </div>
    </button>
  );
}
