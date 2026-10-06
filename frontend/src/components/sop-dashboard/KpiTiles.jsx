import { cn } from '@/lib/utils';
import { ATTENTION, TARGET, bandFor, round1 } from './logic';

const BAND_TEXT = {
  good: 'text-emerald-600',
  warn: 'text-amber-600',
  bad: 'text-red-600',
  none: 'text-foreground',
};

function Tile({ label, value, sub, valueClass }) {
  return (
    <div className="rounded-[10px] border border-border bg-card p-3.5">
      <div className="mb-1 text-[11px] text-muted-foreground">{label}</div>
      <div className={cn('text-2xl font-bold leading-none text-foreground', valueClass)}>{value}</div>
      <div className="mt-1.5 text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

export default function KpiTiles({ kpi }) {
  const change = kpi.avgChange;
  const changeText = change == null ? '--' : `${change > 0 ? '+' : ''}${round1(change)} pts`;
  const changeClass = change == null ? '' : change >= 0 ? 'text-emerald-600' : 'text-red-600';
  return (
    <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        label="Audits submitted"
        value={kpi.audits}
        sub={`${kpi.storesAudited} of ${kpi.storesInScope} stores covered`}
      />
      <Tile
        label="Average score"
        value={kpi.avgPercent == null ? '--' : `${round1(kpi.avgPercent)}%`}
        valueClass={BAND_TEXT[bandFor(kpi.avgPercent)]}
        sub={`Target ${TARGET}%`}
      />
      <Tile
        label={`Stores below ${ATTENTION}%`}
        value={kpi.belowAttention}
        valueClass={kpi.belowAttention ? 'text-red-600' : 'text-emerald-600'}
        sub={`of ${kpi.storesAudited} audited (latest scores)`}
      />
      <Tile
        label="Change vs previous audit"
        value={changeText}
        valueClass={changeClass}
        sub={kpi.changeCount ? `average over ${kpi.changeCount} repeat audits` : 'no repeat audits yet'}
      />
    </div>
  );
}
