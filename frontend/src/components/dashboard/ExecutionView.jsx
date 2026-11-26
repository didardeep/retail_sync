import { useNavigate } from 'react-router-dom';
import { Pie } from 'react-chartjs-2';

import Panel, { Empty } from '@/components/charts/Panel';
import Tile from '@/components/Tile';
import { auditsLink } from '@/lib/links';
import { CRITERIA } from '@/lib/scoreCriteria';
import { COLORS } from '@/lib/chartColors';
import { ALL_QUARTERS, quarterLabel } from '@/lib/overviewStats';
import {
  auditorPerformance, dueOf, executionSummary, groupByTimeliness, needsAttention,
} from '@/lib/executionStats';
import { cn } from '@/lib/utils';

const TIMELINESS_COLORS = { on_time: COLORS.green, late: COLORS.amber, overdue: COLORS.red, not_due: COLORS.blue };
const ATTENTION_TONE = {
  overdue: 'bg-red-50 text-red-700 border-red-200',
  sent_back: 'bg-amber-50 text-amber-800 border-amber-200',
  review: 'bg-blue-50 text-blue-700 border-blue-200',
};
const ATTENTION_SHOWN = 8;

const days = (v) => (v === null ? '--' : `${v} ${v === 1 ? 'day' : 'days'}`);
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '--');

// Audit Execution: is the audit work itself going well? On time or late, stuck,
// waiting for review, sent back, and how each auditor is doing. `timing` comes
// from /api/dashboard/audit-details and may still be loading (null).
export default function ExecutionView({ audits, timing, quarter }) {
  const navigate = useNavigate();
  const now = Date.now();
  const t = timing || {};
  const qText = quarterLabel(quarter);
  // Links to the Audit page carry the quarter, so the list it opens has the same count.
  const q = quarter === ALL_QUARTERS ? undefined : quarter;
  const s = executionSummary(audits, t, now);
  const loadingTiming = timing === null;

  const tiles = [
    { label: 'On-time completion', value: s.onTimePct === null ? '--' : `${s.onTimePct}%`, icon: '⏱️', tint: '#ecfdf5', info: CRITERIA.onTime, go: auditsLink({ status: 'completed', quarter: q }) },
    { label: 'Overdue audits', value: s.overdue, icon: '🚨', tint: '#fde8e8', info: CRITERIA.overdue, go: auditsLink({ stage: 'overdue', quarter: q }) },
    { label: 'Awaiting review', value: s.awaitingReview, icon: '📝', tint: '#e8eefa', info: CRITERIA.awaitingReview, go: auditsLink({ stage: 'completed', quarter: q }) },
    { label: 'Sent back', value: s.sentBack, icon: '↩️', tint: '#fffbeb', info: CRITERIA.sentBack, go: auditsLink({ status: 'changes_requested', quarter: q }) },
  ];

  const timeliness = groupByTimeliness(audits, now).filter((g) => g.count);
  const timelinessTotal = timeliness.reduce((n, g) => n + g.count, 0);
  const pieData = {
    labels: timeliness.map((g) => g.label),
    datasets: [{ data: timeliness.map((g) => g.count), backgroundColor: timeliness.map((g) => TIMELINESS_COLORS[g.key]) }],
  };
  const pieOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };

  const attention = needsAttention(audits, now);
  const performance = auditorPerformance(audits, t, now);

  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((x) => (
          <Tile key={x.label} icon={x.icon} tint={x.tint} label={x.label} value={x.value} info={x.info} onClick={x.go ? () => navigate(x.go) : undefined} />
        ))}
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[2fr_3fr]">
        <Panel title="Audits against due date" info={CRITERIA.timeliness} hint={`${qText}, ${timelinessTotal} audits not cancelled`}>
          {timelinessTotal ? (
            <div className="flex items-center gap-4">
              <div className="relative size-[150px] shrink-0"><Pie data={pieData} options={pieOpts} /></div>
              <ul className="min-w-0 flex-1 space-y-1.5 text-[12px]">
                {timeliness.map((g) => (
                  <li key={g.key} className="flex items-center gap-2">
                    <span className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: TIMELINESS_COLORS[g.key] }} />
                    <span className="min-w-0 flex-1 truncate text-foreground">{g.label}</span>
                    <span className="shrink-0 font-semibold text-foreground">{g.count}</span>
                    <span className="w-9 shrink-0 text-right text-muted-foreground">{Math.round((g.count / timelinessTotal) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : <Empty>No audits in {qText}</Empty>}
        </Panel>

        <Panel title="Needs attention" info={CRITERIA.attention} hint={`${qText}: ${attention.length} ${attention.length === 1 ? 'audit' : 'audits'}. Click one to open it.`}>
          {attention.length ? (
            <ul>
              {attention.slice(0, ATTENTION_SHOWN).map(({ audit, kind, reason }) => (
                <li key={audit.id}>
                  <button type="button" className="flex w-full items-center gap-2.5 border-b border-border py-2 text-left last:border-0 hover:bg-accent/40" onClick={() => navigate(auditsLink({ id: audit.id }))}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-semibold text-foreground">{audit.store || audit.store_id}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{audit.id} &bull; {audit.auditor || 'Unassigned'} &bull; due {shortDate(dueOf(audit))}</div>
                    </div>
                    <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold', ATTENTION_TONE[kind])}>{reason}</span>
                  </button>
                </li>
              ))}
              {attention.length > ATTENTION_SHOWN && (
                <li className="pt-2 text-[11.5px] text-muted-foreground">and {attention.length - ATTENTION_SHOWN} more</li>
              )}
            </ul>
          ) : <Empty>Nothing needs attention in {qText}</Empty>}
        </Panel>
      </div>

      <Panel title="Auditor performance" info={CRITERIA.auditorPerf} hint={`${qText}: auditors with overdue work first. Click a row to see their audits.`} className="mb-3">
        {performance.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-[12.5px]">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Auditor</th>
                  <th className="py-2 pr-3 text-right font-medium">Audits</th>
                  <th className="py-2 pr-3 text-right font-medium">Submitted</th>
                  <th className="py-2 pr-3 text-right font-medium">On time</th>
                  <th className="py-2 pr-3 text-right font-medium">Late</th>
                  <th className="py-2 pr-3 text-right font-medium">Overdue</th>
                  <th className="py-2 pr-3 text-right font-medium">Sent back</th>
                  <th className="py-2 text-right font-medium">Avg days to finish</th>
                </tr>
              </thead>
              <tbody>
                {performance.map((r) => (
                  <tr
                    key={r.auditorId || 'none'}
                    className={cn('border-b border-border last:border-0', r.auditorId && 'cursor-pointer hover:bg-accent/40')}
                    onClick={r.auditorId ? () => navigate(auditsLink({ auditor: r.auditorId, quarter: q })) : undefined}
                  >
                    <td className="py-2 pr-3 font-medium text-foreground">{r.auditor}</td>
                    <td className="py-2 pr-3 text-right">{r.assigned}</td>
                    <td className="py-2 pr-3 text-right">{r.submitted}</td>
                    <td className="py-2 pr-3 text-right">{r.onTimePct === null ? '--' : `${r.onTimePct}%`}</td>
                    <td className={cn('py-2 pr-3 text-right', r.late && 'font-semibold text-amber-700')}>{r.late}</td>
                    <td className={cn('py-2 pr-3 text-right', r.overdue && 'font-semibold text-red-700')}>{r.overdue}</td>
                    <td className="py-2 pr-3 text-right">{loadingTiming ? '…' : r.returns}</td>
                    <td className="py-2 text-right">{loadingTiming ? '…' : days(r.avgDays)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No audits in {qText}</Empty>}
      </Panel>
    </>
  );
}
