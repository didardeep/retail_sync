import { useState } from 'react';

import { cn } from '@/lib/utils';
import {
  recentObservations, repeatIssues, topObservations, wording,
} from '@/lib/dashboardScope';

const TABS = [
  { key: 'observations', dot: 'var(--orange)' },
  { key: 'repeats', dot: 'var(--red)' },
];

function Row({ text, count, dot }) {
  return (
    <div className="flex items-start gap-1.5 border-b border-border py-1.5 text-xs text-foreground/80 last:border-0">
      <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} />
      <div className="min-w-0 flex-1">{text}</div>
      {count != null && (
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-bold text-foreground" title={`${count} times`}>
          x{count}
        </span>
      )}
    </div>
  );
}

// Two lists with titles from the shared wording. For all stores the first is
// ranked by how often an observation was recorded and the second by how many
// times an issue was raised; for one store the first is the latest observations.
export default function ObservationsCard({ scope, observations, issues }) {
  const [tab, setTab] = useState('observations');
  const words = wording(scope);
  const oneStore = scope.kind === 'store';
  const top = oneStore ? recentObservations(observations) : topObservations(observations);
  const repeats = repeatIssues(issues);

  return (
    <div className="rounded-[10px] border border-border bg-card p-4">
      <div className="mb-3 text-[13px] font-semibold text-foreground">{words[tab]}</div>
      <div className="mb-2 flex flex-wrap gap-1.5" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={cn('rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground', tab === t.key && 'border-primary bg-primary text-primary-foreground')}
            onClick={() => setTab(t.key)}
          >
            {words[t.key]}
          </button>
        ))}
      </div>
      {tab === 'observations' && !top.length && <div className="p-3 text-center text-xs text-muted-foreground">No observations yet</div>}
      {tab === 'repeats' && !repeats.length && <div className="p-3 text-center text-xs text-muted-foreground">No issue has been raised more than once</div>}
      {tab === 'observations' && (oneStore
        ? top.map((o) => <Row key={o.id} text={o.observation} dot={TABS[0].dot} />)
        : top.map((g) => <Row key={g.text} text={g.text} count={g.count} dot={TABS[0].dot} />))}
      {tab === 'repeats' && repeats.map((g) => <Row key={g.text} text={g.text} count={g.count} dot={TABS[1].dot} />)}
    </div>
  );
}
