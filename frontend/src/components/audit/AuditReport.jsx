import { useEffect, useState } from 'react';

import { api } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { ErrorNote, Loading } from '@/components/Loader';
import { formatDate, formatTime } from '@/lib/auditRows';
import { sColor } from '@/utils/helpers';

const ANSWER_CLASS = {
  Yes: 'bg-emerald-50 text-emerald-700',
  No: 'bg-red-50 text-red-800',
  NA: 'bg-slate-100 text-slate-600',
};

function when(iso) {
  return iso ? `${formatDate(iso)}, ${formatTime(iso)}` : '--';
}

// Read-only report of one checklist audit: score, who and when, the Yes / No /
// N/A totals, and every answer grouped by process.
export default function AuditReport({ auditId }) {
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setAudit(null);
    setError(null);
    api.audit(auditId)
      .then((a) => { if (!cancelled) setAudit(a); })
      .catch((e) => { if (!cancelled) setError(e); });
    return () => { cancelled = true; };
  }, [auditId]);

  if (error) return <ErrorNote error={error} />;
  if (!audit) return <Loading what="report" />;

  const responses = audit.responses || [];
  const tally = { Yes: 0, No: 0, NA: 0, open: 0 };
  const groups = new Map();
  for (const r of responses) {
    if (tally[r.answer] !== undefined) tally[r.answer] += 1;
    else if (!r.answer) tally.open += 1;
    const p = r.process || 'General';
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p).push(r);
  }

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 text-[12.5px] sm:grid-cols-4">
        <div>
          <div className="text-[11px] text-muted-foreground">Score</div>
          {typeof audit.score === 'number'
            ? <b className="text-lg tabular-nums" style={{ color: sColor(audit.score) }}>{audit.score.toFixed(2)}%</b>
            : <b className="text-muted-foreground">--</b>}
        </div>
        <div><div className="text-[11px] text-muted-foreground">Status</div><b>{audit.status}</b></div>
        <div><div className="text-[11px] text-muted-foreground">Auditor</div><b>{audit.auditor || 'Unassigned'}</b></div>
        <div><div className="text-[11px] text-muted-foreground">Submitted</div><b>{when(audit.submitted_at)}</b></div>
        <div><div className="text-[11px] text-muted-foreground">Start</div><b>{when(audit.scheduled_at)}</b></div>
        <div><div className="text-[11px] text-muted-foreground">End</div><b>{when(audit.due_at)}</b></div>
        <div className="col-span-2">
          <div className="text-[11px] text-muted-foreground">Answers</div>
          <div className="mt-0.5 flex flex-wrap gap-1">
            <Badge className={ANSWER_CLASS.Yes}>Yes {tally.Yes}</Badge>
            <Badge className={ANSWER_CLASS.No}>No {tally.No}</Badge>
            <Badge className={ANSWER_CLASS.NA}>N/A {tally.NA}</Badge>
            {tally.open > 0 && <Badge className="border border-border bg-muted text-muted-foreground">Not answered {tally.open}</Badge>}
          </div>
        </div>
      </div>

      {responses.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">This audit has no questions.</div>}
      {[...groups.entries()].map(([process, items]) => (
        <div key={process} className="mb-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{process}</div>
          <div className="overflow-hidden rounded-lg border border-border">
            {items.map((r) => (
              <div key={r.id} className="grid grid-cols-[1fr_auto] items-start gap-2.5 border-b border-border px-3 py-2 last:border-0">
                <div>
                  <div className="text-[12.5px] text-foreground/80">{r.question_text}</div>
                  {r.remarks && <div className="mt-1 text-[11.5px] text-muted-foreground">{r.remarks}</div>}
                </div>
                <Badge className={ANSWER_CLASS[r.answer] || 'border border-border bg-muted text-muted-foreground'}>
                  {r.answer === 'NA' ? 'N/A' : r.answer || 'Not answered'}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      ))}

      {(audit.sm_comment || audit.sm_rating) && (
        <div className="mt-3 rounded-lg bg-muted px-3 py-2 text-[12.5px] text-foreground/80">
          <div className="mb-0.5 font-semibold">Store manager feedback{audit.sm_rating ? ` - rating ${audit.sm_rating}` : ''}</div>
          {audit.sm_comment}
        </div>
      )}
    </div>
  );
}
