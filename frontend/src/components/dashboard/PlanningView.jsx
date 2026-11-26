import { useNavigate } from 'react-router-dom';
import { Bar, Pie } from 'react-chartjs-2';

import Panel, { Empty } from '@/components/charts/Panel';
import Tile from '@/components/Tile';
import { auditsLink } from '@/lib/links';
import {
  ALL_QUARTERS, PLAN_STAGES, UNASSIGNED_REGION, auditStageCounts, auditorWorkload, auditsByQuarter,
  completionRate, groupAuditsByFormat, groupAuditsByRegion, planStage, quarterLabel,
} from '@/lib/overviewStats';
import { COLORS, seriesColor } from '@/lib/chartColors';
import { CRITERIA } from '@/lib/scoreCriteria';


const pointer = (event, elements) => {
  const el = event.native?.target;
  if (el) el.style.cursor = elements.length ? 'pointer' : 'default';
};

// Legend that doubles as the value labels: colour, name, count and share.
function Legend({ rows, onPick }) {
  return (
    <ul className="min-w-0 space-y-1.5 text-[12px]">
      {rows.map((r, i) => (
        <li key={r.label}>
          <button type="button" className="flex w-full items-center gap-2 text-left hover:underline disabled:no-underline" disabled={!onPick} onClick={() => onPick?.(i)}>
            <span className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: r.color }} />
            <span className="min-w-0 flex-1 truncate text-foreground">{r.label}</span>
            <span className="shrink-0 font-semibold text-foreground">{r.count}</span>
            {r.pct != null && <span className="w-9 shrink-0 text-right text-muted-foreground">{r.pct}%</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

// Audit Planning: what is planned, where, for which formats and auditors, and
// how far along it is. Every count opens the Audit page with the same filter.
export default function PlanningView({ audits, yearAudits, stores, quarter, year, onPickQuarter }) {
  const navigate = useNavigate();
  const quarterKey = quarter === ALL_QUARTERS ? undefined : quarter;
  const link = (extra) => navigate(auditsLink({ quarter: quarterKey, ...extra }));

  const counts = auditStageCounts(audits);
  const tiles = [
    { label: 'Total audits', value: counts.total, icon: '📊', tint: '#f3f4f6', go: {}, info: CRITERIA.totalAudits },
    { label: 'Planned', value: counts.scheduled, icon: '📋', tint: '#e8eefa', go: { stage: 'scheduled' }, info: CRITERIA.planned },
    { label: 'Ongoing', value: counts.in_progress, icon: '⏳', tint: '#fffbeb', go: { stage: 'in_progress' }, info: CRITERIA.ongoingPlan },
    { label: 'Completed', value: counts.done, icon: '✅', tint: '#ecfdf5', go: { status: 'completed' }, info: CRITERIA.completedPlan },
  ];
  const rate = completionRate(audits);

  // Every quarter of the year, stacked by stage. Clicking a quarter selects it.
  const byQuarter = auditsByQuarter(yearAudits, year);
  const quarterData = {
    labels: byQuarter.map((q) => q.quarter.toUpperCase()),
    datasets: PLAN_STAGES.map((st) => ({
      label: st.label, data: byQuarter.map((q) => q[st.key]), backgroundColor: st.color,
      stack: 'audits', maxBarThickness: 48, borderColor: '#fff', borderWidth: { top: 2 },
    })),
  };
  const quarterOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' }, tooltip: { mode: 'index', intersect: false, callbacks: { footer: (items) => `Total: ${byQuarter[items[0].dataIndex].total}` } } },
    scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { precision: 0 }, title: { display: true, text: 'Audits' } } },
    onClick: (_e, els) => { if (els.length) onPickQuarter(byQuarter[els[0].index].quarter); },
    onHover: pointer,
  };

  // Current status: one bar per stage.
  const stageRows = PLAN_STAGES.map((st) => ({ ...st, count: audits.filter((a) => planStage(a) === st.key).length }));
  const stageLink = { scheduled: { stage: 'scheduled' }, in_progress: { stage: 'in_progress' }, done: { status: 'completed' }, cancelled: { stage: 'cancelled' } };
  const statusData = {
    labels: stageRows.map((r) => r.label),
    datasets: [{ label: 'Audits', data: stageRows.map((r) => r.count), backgroundColor: stageRows.map((r) => r.color), maxBarThickness: 26 }],
  };
  const statusOpts = {
    responsive: true, maintainAspectRatio: false, indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: { x: { ticks: { precision: 0 } }, y: { grid: { display: false } } },
    onClick: (_e, els) => { if (els.length) link(stageLink[stageRows[els[0].index].key]); },
    onHover: pointer,
  };

  // Region: a plain pie.
  const regions = groupAuditsByRegion(audits).map((g, i) => ({ ...g, label: g.region, color: seriesColor(i) }));
  const pickRegion = (i) => { const r = regions[i]; if (r && r.region !== UNASSIGNED_REGION) link({ region: r.region }); };
  const regionData = { labels: regions.map((r) => r.label), datasets: [{ data: regions.map((r) => r.count), backgroundColor: regions.map((r) => r.color) }] };
  const pieOpts = (onPick) => ({
    responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
    onClick: (_e, els) => { if (els.length) onPick(els[0].index); }, onHover: pointer,
  });

  // Format: planned vs completed per store format.
  const formats = groupAuditsByFormat(audits, stores);
  const formatData = {
    labels: formats.map((f) => f.format),
    datasets: [
      { label: 'Audits planned', data: formats.map((f) => f.count), backgroundColor: COLORS.blue, maxBarThickness: 28 },
      { label: 'Completed', data: formats.map((f) => f.done), backgroundColor: COLORS.green, maxBarThickness: 28 },
    ],
  };
  const formatOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' }, tooltip: { mode: 'index', intersect: false } },
    scales: { x: { grid: { display: false } }, y: { ticks: { precision: 0 } } },
  };

  const workload = auditorWorkload(audits);
  const qText = quarterLabel(quarter);

  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {tiles.map((t) => <Tile key={t.label} icon={t.icon} tint={t.tint} label={t.label} value={t.value} info={t.info} onClick={() => link(t.go)} />)}
        <Tile icon="🎯" tint="#ecfdf5" label="Completion rate" value={`${rate}%`} info={CRITERIA.completionRate} onClick={() => link({ status: 'completed' })} />
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[3fr_2fr]">
        <Panel title="Audits by quarter" info={CRITERIA.byQuarter} hint={`${year}, every quarter, by status. Click a quarter to show only it.`}>
          {yearAudits.length ? <div className="relative h-[240px]"><Bar data={quarterData} options={quarterOpts} /></div> : <Empty>No audits scheduled in {year}</Empty>}
        </Panel>
        <Panel title="Current status" info={CRITERIA.status} hint={`${qText}, ${audits.length} audits`}>
          {audits.length ? (
            <>
              <div className="relative h-[170px]"><Bar data={statusData} options={statusOpts} /></div>
              <div className="mt-2"><Legend rows={stageRows.map((r) => ({ label: r.label, color: r.color, count: r.count, pct: audits.length ? Math.round((r.count / audits.length) * 100) : 0 }))} onPick={(i) => link(stageLink[stageRows[i].key])} /></div>
            </>
          ) : <Empty>No audits in {qText}</Empty>}
        </Panel>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="Audit distribution by region" info={CRITERIA.regionPlan} hint={`${qText}. Click a region to list its audits.`}>
          {regions.length ? (
            <div className="flex items-center gap-5">
              <div className="relative size-[170px] shrink-0"><Pie data={regionData} options={pieOpts(pickRegion)} /></div>
              <div className="min-w-0 flex-1"><Legend rows={regions} onPick={pickRegion} /></div>
            </div>
          ) : <Empty>No audits in {qText}</Empty>}
        </Panel>
        <Panel title="Audit distribution by store format" info={CRITERIA.formatPlan} hint={`${qText}: audits planned and completed per format`}>
          {formats.length ? <div className="relative h-[200px]"><Bar data={formatData} options={formatOpts} /></div> : <Empty>No audits in {qText}</Empty>}
        </Panel>
      </div>

      <Panel title="Auditor workload" info={CRITERIA.workload} hint={`${qText}: audits given to each auditor and how many are completed`} className="mb-3">
        {workload.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Auditor</th>
                  <th className="py-2 pr-3 text-right font-medium">Audits</th>
                  <th className="py-2 pr-3 text-right font-medium">Open</th>
                  <th className="py-2 pr-3 text-right font-medium">Completed</th>
                  <th className="w-[40%] py-2 font-medium">Progress</th>
                </tr>
              </thead>
              <tbody>
                {workload.map((w) => {
                  const p = w.total ? Math.round((w.done / w.total) * 100) : 0;
                  return (
                    <tr key={w.auditor} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3 font-medium text-foreground">{w.auditor}</td>
                      <td className="py-2 pr-3 text-right">{w.total}</td>
                      <td className="py-2 pr-3 text-right">{w.open}</td>
                      <td className="py-2 pr-3 text-right">{w.done}</td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${p}%`, background: COLORS.green }} /></div>
                          <span className="w-9 text-right text-[11.5px] text-muted-foreground">{p}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty>No audits in {qText}</Empty>}
      </Panel>
    </>
  );
}
