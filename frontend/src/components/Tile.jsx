import { cn } from '@/lib/utils';
import InfoButton from '@/components/InfoButton';

// A clickable count tile: icon (a component or an emoji), label and a big number.
// `active` outlines it. `info` (lines of text) adds an "i" button in the corner
// that explains how the number is worked out.
export default function Tile({ icon: Icon, tint, label, value, active, onClick, info }) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex h-full w-full items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4 text-left transition-colors hover:bg-accent',
          info && 'pr-7',
          active && 'border-primary ring-1 ring-primary',
        )}
      >
        <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg" style={{ background: tint }}>
          {typeof Icon === 'string' ? <span aria-hidden="true" className="text-[15px]">{Icon}</span> : <Icon className="size-4 text-foreground/70" />}
        </div>
        <div className="min-w-0">
          <div className="mb-0.5 text-[11px] text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold leading-none text-foreground">{value}</div>
        </div>
      </button>
      {info && (
        <span className="absolute right-1.5 top-1.5">
          <InfoButton lines={info} label={label} align="auto" />
        </span>
      )}
    </div>
  );
}
