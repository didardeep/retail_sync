import { useState, useEffect, useMemo } from 'react';
import { Pie, Bar, Line } from 'react-chartjs-2';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, loadSession } from '../api/client';
import { Loading } from '@/components/Loader';
import FormatLegend from '@/components/FormatLegend';
import ScopePicker from '@/components/ScopePicker';
import Tile from '@/components/Tile';
import PowerBiSample from '@/components/PowerBiSample';
import ObservationsCard from '@/components/dashboard/ObservationsCard';
import PlanningView from '@/components/dashboard/PlanningView';
import ExecutionView from '@/components/dashboard/ExecutionView';
import Panel, { Empty } from '@/components/charts/Panel';
import { StoreView } from '@/components/store-dashboard/StoreView';
import { avC, sColor, pbClass, prC, stC } from '../utils/helpers';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Drawer } from '../components/Modal';
import { auditsLink, issuesLink, storesLink, storeScorecardLink } from '@/lib/links';
import { QUARTERS } from '@/lib/storeStats';
import { CRITERIA } from '@/lib/scoreCriteria';
import { COLORS, SCORE_TARGET, SERIES, scoreColor } from '@/lib/chartColors';
import {
  ALL_QUARTERS, RISK_COLORS, averageScore, bucketScoredStores, formatAverages, auditsInQuarter,
  groupObservationsByRisk, itemsOfAudits, quarterLabel, rankScored, scoreStores,
} from '@/lib/overviewStats';
import {
  inScope, resolveScope, scopeFromParams, scopeTitle, storesInScope, wording,
} from '@/lib/dashboardScope';
import {
  isSubmitted, issueSummary, overdueIssuesByStore, processCompliance, scoreTrend,
} from '@/lib/executionStats';

const VIEWS = [
  { key: 'planning', label: 'Audit Planning' },
  { key: 'execution', label: 'Audit Execution' },
];
// Findings used to be a tab of its own; old links land on Audit Execution, which now holds it.
const VIEW_ALIASES = { findings: 'execution' };

function SectionHeading({ children }) {
  return <h3 className="mb-2 mt-6 border-b border-border pb-1.5 text-[15px] font-bold text-foreground first:mt-0">{children}</h3>;
}
// The app's chart colours (lib/chartColors.js). Formats keep a fixed colour each;
// score bands run from green (high) through amber to red (low), as elsewhere.
const FORMAT_COLORS = { COCO: SERIES[0], COFO: SERIES[1], FOCO: SERIES[2], FOFO: SERIES[3] };
const BUCKET_COLORS = [COLORS.green, '#84cc16', COLORS.amber, '#f97316', COLORS.red];
const GRID_OFF = { grid: { display: false } };
const PERCENT_AXIS = { min: 0, max: 100, ticks: { stepSize: 20, callback: (v) => `${v}%` } };

const pointer = (event, elements) => {
  const el = event.native?.target;
  if (el) el.style.cursor = elements.length ? 'pointer' : 'default';
};
const pieOpts = (onPick) => ({
  responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
  onClick: (_e, els) => { if (els.length && onPick) onPick(els[0].index); }, onHover: pointer,
});

// Colour, name, value and share in one row; also the way to open a slice.
function LegendRows({ rows, onPick, value = (r) => r.count, extra }) {
  return (
    <ul className="min-w-0 space-y-1.5 text-[12px]">
      {rows.map((r, i) => (
        <li key={r.label}>
          <button type="button" className="flex w-full items-center gap-2 text-left hover:underline" onClick={() => onPick?.(i)}>
            <span className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: r.color }} />
            <span className="min-w-0 flex-1 truncate text-foreground">{r.label}</span>
            <span className="shrink-0 font-semibold text-foreground">{value(r)}</span>
            {extra && <span className="w-9 shrink-0 text-right text-muted-foreground">{extra(r)}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

const CRITICALITY_TONE = 'bg-red-50 text-red-700 border-red-200';

// Findings: what the audits found - scores over the quarters, compliance by
// process, critical questions answered No, the questions failed most, store
// scores, and how the issues raised are being followed up. Everything passed
// in is already limited to the stores in scope and the selected quarter;
// `details` comes from /api/dashboard/audit-details and is null while loading.
function FindingsView({ scope, stores, scoreMap, issues, observations, audits, yearAudits, details, selectedQ }) {
  const navigate = useNavigate();
  const role = loadSession()?.user?.role;
  const words = wording(scope);
  const [drill, setDrill] = useState(null); // { title, items, link }
  const [showAllCritical, setShowAllCritical] = useState(false);

  const { scored, unscored } = scoreStores(stores, scoreMap, selectedQ);
  const ranked = rankScored(scored);
  const qLabel = quarterLabel(selectedQ);
  const loading = details === null;
  const critical = details?.critical_failures || [];
  const failedQuestions = details?.failed_questions || [];

  // Headline numbers. Score tiles open the submitted audits of the quarter; the
  // others jump to their panel on this page or list the items in the drawer.
  const submittedLink = auditsLink({ status: 'completed', quarter: selectedQ === ALL_QUARTERS ? undefined : selectedQ });
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const openObservations = () => setDrill({
    title: `Observations in ${qLabel} (${observations.length})`,
    items: observations.map((o) => ({ title: o.observation || '--', badges: [], sub: [o.store, o.risk && `${o.risk} risk`, o.status].filter(Boolean).join(' • ') })),
  });
  const auditScores = audits.filter(isSubmitted).map((a) => a.score).filter((v) => typeof v === 'number');
  const avgAudit = averageScore(auditScores);
  const tiles = [
    { label: 'Average audit score', value: avgAudit !== null ? `${avgAudit}%` : '--', icon: '🎯', tint: avgAudit !== null && avgAudit < SCORE_TARGET ? '#fde8e8' : '#ecfdf5', info: CRITERIA.avgScore, go: () => navigate(submittedLink) },
    { label: 'Audits scored', value: auditScores.length, icon: '✅', tint: '#e8eefa', info: CRITERIA.auditsScored, go: () => navigate(submittedLink) },
    { label: 'Critical failures', value: loading ? '…' : critical.length, icon: '⛔', tint: '#fde8e8', info: CRITERIA.criticalCount, go: () => scrollTo('critical-failures') },
    { label: 'Observations', value: observations.length, icon: '🔎', tint: '#fffbeb', info: CRITERIA.observations, go: openObservations },
  ];

  // Score trend: average audit score per quarter of the year, with the target.
  const trend = scoreTrend(yearAudits);
  const hasTrend = trend.some((q) => q.avg !== null);
  const trendData = {
    labels: trend.map((q) => q.quarter.toUpperCase()),
    datasets: [
      { label: 'Average score', data: trend.map((q) => q.avg), borderColor: COLORS.blue, backgroundColor: COLORS.blue, spanGaps: true, tension: 0.25, pointRadius: 4 },
      { label: `Target ${SCORE_TARGET}%`, data: trend.map(() => SCORE_TARGET), borderColor: COLORS.gray, backgroundColor: COLORS.gray, borderDash: [5, 4], pointRadius: 0, borderWidth: 1.5 },
    ],
  };
  const trendOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y ?? '--'}%${c.datasetIndex === 0 ? ` (${trend[c.dataIndex].count} audits)` : ''}` } } },
    scales: { y: PERCENT_AXIS, x: GRID_OFF },
  };

  // Compliance by process: Yes share of Yes and No answers, lowest first.
  const processes = processCompliance(details?.by_process || []);
  const processData = {
    labels: processes.map((p) => p.process),
    datasets: [{ label: 'Compliance', data: processes.map((p) => p.pct), backgroundColor: processes.map((p) => scoreColor(p.pct)), maxBarThickness: 22 }],
  };
  const processOpts = {
    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => { const p = processes[c.dataIndex]; return ` ${p.pct}% (${p.yes} Yes, ${p.no} No, ${p.na} NA)`; } } } },
    scales: { x: PERCENT_AXIS, y: GRID_OFF },
  };

  // Observations by risk: a plain pie, the legend gives count and share.
  const riskD = groupObservationsByRisk(observations).map((g) => ({ ...g, label: g.level, color: RISK_COLORS[g.level] }));
  const riskData = { labels: riskD.map((d) => d.label), datasets: [{ data: riskD.map((d) => d.count), backgroundColor: riskD.map((d) => d.color) }] };
  function openRisk(i) {
    const g = riskD[i];
    setDrill({ title: `${g.label} risk observations (${g.count})`, items: g.items.map((o) => ({ title: o.observation || '--', badges: [], sub: o.store || '' })) });
  }

  // Format averages over scored stores only (unscored stores are not zeros).
  const fmtD = formatAverages(stores, scoreMap, selectedQ).map((f) => ({ label: f.format, v: f.avg, n: f.scoredCount, color: FORMAT_COLORS[f.format] || COLORS.gray }));
  const fmtScored = fmtD.filter((d) => d.v !== null);
  const fmtData = { labels: fmtScored.map((d) => d.label), datasets: [{ label: 'Average score', data: fmtScored.map((d) => d.v), backgroundColor: fmtScored.map((d) => d.color), maxBarThickness: 40 }] };
  const fmtOpts = {
    responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.parsed.y}%` } } },
    scales: { y: PERCENT_AXIS, x: GRID_OFF }, onHover: pointer,
    onClick: (_e, els) => { if (els.length) navigate(storesLink({ format: fmtScored[els[0].index].label })); },
  };

  // Score distribution: one bucket per scored store.
  const distD = bucketScoredStores(scored).map((b, i) => ({ ...b, label: `${b.label}%`, color: BUCKET_COLORS[i] }));
  const distData = { labels: distD.map((d) => d.label), datasets: [{ data: distD.map((d) => d.count), backgroundColor: distD.map((d) => d.color) }] };
  const storeItem = (s, score) => ({ title: `${s.name}, ${s.city}`, badges: [], sub: score == null ? 'Not scored' : null, score, id: s.id });
  function openDist(i) {
    const b = distD[i];
    setDrill({ title: `Stores scoring ${b.label} in ${qLabel} (${b.count})`, items: b.items.map((e) => storeItem(e.store, e.score)), link: storesLink({}) });
  }
  function openUnscored() {
    setDrill({ title: `Stores not scored in ${qLabel} (${unscored.length})`, items: unscored.map((s) => storeItem(s, null)), link: storesLink({}) });
  }

  const toRow = (e) => ({ n: `${e.store.name}, ${e.store.city}`, v: e.score, id: e.store.id });
  const t5 = ranked.slice(0, 5).map(toRow);
  const b5 = ranked.slice(-5).reverse().map(toRow);

  // Issues: are the findings being fixed?
  const iss = issueSummary(issues);
  const issueTiles = [
    { label: 'Open issues', value: iss.open, icon: '⚠️', tint: '#fffbeb', info: CRITERIA.openIssues, go: issuesLink({}) },
    { label: 'Overdue issues', value: iss.overdue, icon: '🚨', tint: '#fde8e8', info: CRITERIA.overdueIssues, go: issuesLink({ kpi: 'overdue' }) },
    { label: 'Closed issues', value: iss.closed, icon: '✅', tint: '#ecfdf5', info: CRITERIA.closedIssues, go: issuesLink({ kpi: 'completed' }) },
    { label: 'Avg days to close', value: iss.avgDaysToClose ?? '--', icon: '📅', tint: '#f3f4f6', info: CRITERIA.daysToClose, go: issuesLink({ kpi: 'completed' }) },
  ];
  const overdueStores = overdueIssuesByStore(issues);
  const recentIssues = issues.slice(0, 5);
  const criticalShown = showAllCritical ? critical : critical.slice(0, 6);

  const RankList = ({ title, rows, tone }) => (
    <div className="min-w-0 flex-1">
      <div className={cn('mb-1.5 text-[10.5px] font-bold uppercase tracking-wider', tone)}>{title}</div>
      {!rows.length && <div className="py-2 text-xs text-muted-foreground">No stores scored in {qLabel}</div>}
      {rows.map((s) => (
        <button type="button" key={s.id} className="flex w-full items-center justify-between gap-2 border-b border-border py-1.5 text-left text-xs last:border-0 hover:bg-accent/40" onClick={() => navigate(storeScorecardLink(s.id, role))}>
          <span className="min-w-0 truncate">{s.n}</span>
          <div className="flex min-w-[90px] items-center gap-1.5">
            <div className="h-[6px] flex-1 overflow-hidden rounded-[3px] bg-gray-200"><div className={cn('h-full rounded-[3px]', pbClass(s.v))} style={{ width: `${s.v}%` }} /></div>
            <span className="w-10 text-right text-[11.5px] font-bold text-foreground">{s.v}%</span>
          </div>
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => <Tile key={t.label} icon={t.icon} tint={t.tint} label={t.label} value={t.value} info={t.info} onClick={t.go} />)}
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="Audit score trend" info={CRITERIA.trend} hint={`${new Date().getFullYear()}, every quarter, average score of submitted audits`}>
          {hasTrend ? <div className="relative h-[220px]"><Line data={trendData} options={trendOpts} /></div> : <Empty>No submitted audits with a score this year</Empty>}
        </Panel>
        <Panel title="Compliance by process" info={CRITERIA.process} hint={`${qLabel}, Yes answers as a share of Yes and No, lowest first`}>
          {loading ? <Empty>Loading answers…</Empty> : processes.length ? (
            <div className="relative" style={{ height: Math.max(160, processes.length * 34) }}><Bar data={processData} options={processOpts} /></div>
          ) : <Empty>No answers from submitted audits in {qLabel}</Empty>}
        </Panel>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel id="critical-failures" title="Critical failures" info={CRITERIA.critical} hint={`${qLabel}: High-criticality questions answered No. Click one to open the audit.`}>
          {loading ? <Empty>Loading answers…</Empty> : critical.length ? (
            <>
              <ul>
                {criticalShown.map((c, idx) => (
                  <li key={`${c.audit_id}-${c.question_code}-${idx}`}>
                    <button type="button" className="flex w-full items-start gap-2.5 border-b border-border py-2 text-left last:border-0 hover:bg-accent/40" onClick={() => navigate(auditsLink({ id: c.audit_id }))}>
                      <span className={cn('mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10.5px] font-bold', CRITICALITY_TONE)}>{c.question_code || 'Q'}</span>
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-[12.5px] font-medium text-foreground">{c.question}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{c.store} &bull; {c.process} &bull; {c.date?.substring(0, 10)}</div>
                      </div>
                      {!c.issue_raised && <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800">No issue raised</span>}
                    </button>
                  </li>
                ))}
              </ul>
              {critical.length > 6 && (
                <button type="button" className="mt-2 text-[11.5px] text-primary hover:underline" onClick={() => setShowAllCritical((v) => !v)}>
                  {showAllCritical ? 'Show fewer' : `Show all ${critical.length}`}
                </button>
              )}
            </>
          ) : <Empty>No critical question was answered No in {qLabel}</Empty>}
        </Panel>
        <Panel title="Most-failed questions" info={CRITERIA.failed} hint={`${qLabel}: the questions answered No most often`}>
          {loading ? <Empty>Loading answers…</Empty> : failedQuestions.length ? (
            <ul>
              {failedQuestions.map((f) => {
                const rate = f.answered ? Math.round((f.no / f.answered) * 100) : 0;
                return (
                  <li key={f.question_id} className="border-b border-border py-2 last:border-0">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-[12.5px] font-medium text-foreground">{f.text}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {f.code} &bull; {f.process} &bull; {f.criticality} criticality &bull; {f.stores} {f.stores === 1 ? 'store' : 'stores'}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[13px] font-bold text-red-700">{f.no}&times; No</div>
                        <div className="text-[10.5px] text-muted-foreground">{rate}% No rate</div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <Empty>No question was answered No in {qLabel}</Empty>}
        </Panel>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title={words.risk} info={CRITERIA.risk} hint={`${qLabel}, ${observations.length} observations`}>
          {riskD.length ? (
            <div className="flex items-center gap-4">
              <div className="relative size-[150px] shrink-0"><Pie data={riskData} options={pieOpts(openRisk)} /></div>
              <div className="min-w-0 flex-1"><LegendRows rows={riskD} onPick={openRisk} extra={(r) => `${r.pct}%`} /></div>
            </div>
          ) : <Empty>No observations in {qLabel}</Empty>}
        </Panel>
        <Panel title={words.distribution} info={CRITERIA.distribution} hint={`${qLabel}, stores per score band. Click a band to list its stores.`}>
          {scored.length ? (
            <div className="flex items-center gap-4">
              <div className="relative size-[140px] shrink-0"><Pie data={distData} options={pieOpts(openDist)} /></div>
              <div className="min-w-0 flex-1">
                <LegendRows rows={distD} onPick={openDist} />
                <button type="button" className="mt-1.5 text-[11.5px] text-muted-foreground hover:underline" onClick={openUnscored}>Not scored: <b>{unscored.length}</b></button>
              </div>
            </div>
          ) : <Empty>No stores scored in {qLabel}</Empty>}
        </Panel>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title={<span className="flex items-center gap-1">{words.format}<FormatLegend /></span>} info={CRITERIA.format} hint={`${qLabel}, average score of the scored stores in each format`}>
          {fmtScored.length ? <div className="relative h-[200px]"><Bar data={fmtData} options={fmtOpts} /></div> : <Empty>No scored stores in {qLabel}</Empty>}
          {fmtD.some((d) => d.v === null) && (
            <p className="mt-2 text-[11px] text-muted-foreground">Not scored: {fmtD.filter((d) => d.v === null).map((d) => d.label).join(', ')}</p>
          )}
        </Panel>
        <Panel title={words.topBottom} info={CRITERIA.topBottom} hint={`${qLabel}. Click a store to open it.`}>
          <div className="flex flex-col gap-4 sm:flex-row">
            <RankList title="Top 5 stores" rows={t5} tone="text-emerald-700" />
            <RankList title="Bottom 5 stores" rows={b5} tone="text-red-700" />
          </div>
        </Panel>
      </div>

      <h3 className="mb-2 mt-5 text-[13.5px] font-semibold text-foreground">Issue follow-up</h3>
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {issueTiles.map((t) => <Tile key={t.label} icon={t.icon} tint={t.tint} label={t.label} value={t.value} info={t.info} onClick={t.go ? () => navigate(t.go) : undefined} />)}
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel title="Overdue issues by store" info={CRITERIA.overdueByStore} hint={`${qLabel}. Click a store to see its issues.`}>
          {overdueStores.length ? (
            <ul>
              {overdueStores.slice(0, 8).map((r) => (
                <li key={r.storeId}>
                  <button type="button" className="flex w-full items-center justify-between gap-2 border-b border-border py-1.5 text-left text-[12.5px] last:border-0 hover:bg-accent/40" onClick={() => navigate(issuesLink({ store: r.storeId }))}>
                    <span className="min-w-0 truncate text-foreground">{r.store}</span>
                    <span className="shrink-0 font-bold text-red-700">{r.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <Empty>No overdue issues in {qLabel}</Empty>}
        </Panel>
        <ObservationsCard scope={scope} observations={observations} issues={issues} info={CRITERIA.observationsCard} />
        <Panel title={words.issues} info={CRITERIA.recentIssues} action={<button type="button" className="text-[11px] text-muted-foreground hover:underline" onClick={() => navigate('/issues')}>View all &rarr;</button>}>
          {recentIssues.length ? recentIssues.map((i, idx) => (
            <button type="button" key={i.id} className={cn('flex w-full items-center justify-between gap-2.5 py-2 text-left', idx < recentIssues.length - 1 && 'border-b border-border')} onClick={() => navigate(issuesLink({ id: i.id }))}>
              <div className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white', avC(i.assignee || 'U'))}>{(i.assignee || 'U')[0]}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-semibold text-foreground">{i.title}</div>
                <div className="text-[11px] text-muted-foreground">{i.store} &bull; {i.created_at?.substring(0, 10)}</div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Badge className={prC(i.priority)}>{i.priority}</Badge>
                <Badge className={stC(i.status)}>{i.status}</Badge>
              </div>
            </button>
          )) : <Empty>No issues in {qLabel}</Empty>}
        </Panel>
      </div>

      <Drawer open={!!drill} onClose={() => setDrill(null)}>
        {drill && (
          <>
            <div className="mb-3.5 flex items-center justify-between">
              <div className="text-[15px] font-bold text-foreground">{drill.title}</div>
              <button type="button" className="text-[15px] text-muted-foreground" aria-label="Close" onClick={() => setDrill(null)}>&#x2715;</button>
            </div>
            {drill.link && <button type="button" className="mb-3 text-xs text-primary hover:underline" onClick={() => { setDrill(null); navigate(drill.link); }}>View all &rarr;</button>}
            {drill.items.length ? drill.items.map((item, idx) => (
              <div key={idx} className={cn('border-b border-border py-2.5 last:border-0', item.id && 'cursor-pointer hover:bg-accent/40')} onClick={() => item.id && navigate(storeScorecardLink(item.id, role))}>
                <div className="mb-1 text-[12.5px] font-semibold text-foreground">{item.title}</div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {item.sub && <span className="text-[11px] text-muted-foreground">{item.sub}</span>}
                  {item.score != null && <span className="text-[11px] font-bold" style={{ color: sColor(item.score) }}>{item.score}%</span>}
                </div>
              </div>
            )) : <div className="p-5 text-center text-xs text-muted-foreground">No items in this category</div>}
          </>
        )}
      </Drawer>
    </>
  );
}

// Dashboard & Analytics. Two views, Audit Planning and Audit Execution (?view=); Execution
// shows how the audits are going and then what they found,
// for all stores or one store (?store=<id>), and for
// all quarters of the year or one quarter.
export default function Dashboard() {
  const [params, setParams] = useSearchParams();
  const role = loadSession()?.user?.role;
  const [data, setData] = useState(null);
  const [selectedQ, setSelectedQ] = useState(ALL_QUARTERS);
  const [pbiOpen, setPbiOpen] = useState(false);
  const asked = VIEW_ALIASES[params.get('view')] || params.get('view');
  const view = VIEWS.some((v) => v.key === asked) ? asked : 'planning';
  const year = new Date().getFullYear();

  useEffect(() => {
    Promise.all([
      api.stores().catch(() => []),
      api.issues().catch(() => []),
      api.observations().catch(() => []),
      api.audits().catch(() => []),
      api.storeScores().catch(() => []),
    ]).then(([stores, issues, observations, audits, scores]) => {
      const scoreMap = {};
      for (const sc of (scores || [])) scoreMap[sc.store_id] = sc;
      setData({
        stores: stores || [], issues: issues || [],
        observations: observations || [], audits: audits || [], scoreMap,
      });
    });
  }, []);

  const stores = data?.stores;
  const scope = useMemo(
    () => (data ? resolveScope(scopeFromParams(params), stores) : { kind: 'all', id: '' }),
    [data, params, stores],
  );
  const scoped = useMemo(() => (data ? storesInScope(stores, scope) : []), [data, stores, scope]);

  // Audits, and the observations and issues raised in them, for the selected quarter
  // (or the whole year), plus every audit of the year for the quarter-by-quarter chart.
  const { yearAudits, quarterAudits, quarterObservations, quarterIssues } = useMemo(() => {
    if (!data) return { yearAudits: [], quarterAudits: [], quarterObservations: [], quarterIssues: [] };
    const scopedAudits = inScope(data.audits, scoped);
    const audits = auditsInQuarter(scopedAudits, selectedQ, year);
    return {
      yearAudits: auditsInQuarter(scopedAudits, ALL_QUARTERS, year),
      quarterAudits: audits,
      quarterObservations: itemsOfAudits(inScope(data.observations, scoped), audits),
      quarterIssues: itemsOfAudits(inScope(data.issues, scoped), audits),
    };
  }, [data, scoped, selectedQ, year]);

  // Start, approval and send-back times, and answer counts, for the audits in view.
  const [details, setDetails] = useState(null);
  const detailIds = quarterAudits.map((a) => a.id).join(',');
  useEffect(() => {
    if (!data) return undefined;
    let cancelled = false;
    setDetails(null);
    const ids = detailIds ? detailIds.split(',') : [];
    api.dashboardAuditDetails(ids)
      .then((r) => { if (!cancelled) setDetails(r); })
      .catch(() => { if (!cancelled) setDetails({ timing: {}, by_process: [], critical_failures: [], failed_questions: [] }); });
    return () => { cancelled = true; };
  }, [data, detailIds]);

  if (!data) return <Loading what="dashboard" />;

  const store = scope.kind === 'store' ? scoped[0] : null;
  const filtered = !!params.get('store') || selectedQ !== ALL_QUARTERS;
  function clearFilters() {
    setSelectedQ(ALL_QUARTERS);
    setParams(params.get('view') ? { view: params.get('view') } : {}, { replace: true });
  }
  const setView = (key) => {
    const next = new URLSearchParams(params);
    next.set('view', key);
    setParams(next, { replace: true });
  };

  return (
    <div>
      <div className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-foreground">{scope.kind === 'all' ? 'Audit Operations' : scopeTitle(scope, stores)}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {store
                ? `${store.format ? `Format ${store.format}` : 'No format'}`
                : scope.kind === 'all' ? 'Consolidated View' : `${scoped.length} ${scoped.length === 1 ? 'store' : 'stores'}`}
              {' • '}{quarterLabel(selectedQ)} {year}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ScopePicker
              stores={stores}
              storeId={scope.kind === 'store' ? scope.id : ''}
              onChange={(store) => {
                const next = store ? { store } : {};
                if (params.get('view')) next.view = params.get('view');
                setParams(next, { replace: true });
              }}
            />
            <div className="flex gap-1.5" role="group" aria-label="Quarter">
              <Button size="sm" className="h-11 md:h-[30px]" variant={selectedQ === ALL_QUARTERS ? 'default' : 'outline'} onClick={() => setSelectedQ(ALL_QUARTERS)}>All</Button>
              {QUARTERS.map((q) => (
                <Button key={q} size="sm" className="h-11 md:h-[30px]" variant={selectedQ === q ? 'default' : 'outline'} onClick={() => setSelectedQ(q)}>{q.toUpperCase()}</Button>
              ))}
            </div>
            {filtered && (
              <Button size="sm" className="h-11 md:h-[30px]" variant="outline" onClick={clearFilters} title="Show all stores and all quarters">
                &#x2715; Clear filters
              </Button>
            )}
            <Button size="sm" className="h-11 md:h-[30px]" variant="outline" onClick={() => setPbiOpen(true)}>BI Dashboard</Button>
          </div>
        </div>
        {!store && (
          <div className="mt-3 inline-flex rounded-lg border border-border bg-card p-1" role="tablist" aria-label="Dashboard view">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                role="tab"
                aria-selected={view === v.key}
                onClick={() => setView(v.key)}
                className={cn('rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-colors', view === v.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {store ? (
        <StoreView key={store.id} store={store} role={role} quarter={selectedQ === ALL_QUARTERS ? undefined : selectedQ} />
      ) : view === 'planning' ? (
        <PlanningView
          key={`plan${scope.kind}${scope.id}`}
          audits={quarterAudits}
          yearAudits={yearAudits}
          stores={scoped}
          quarter={selectedQ}
          year={year}
          onPickQuarter={setSelectedQ}
        />
      ) : (
        <>
          <SectionHeading>How the audits are going</SectionHeading>
          <ExecutionView
            key={`exec${scope.kind}${scope.id}`}
            audits={quarterAudits}
            timing={details ? details.timing : null}
            quarter={selectedQ}
          />
          <SectionHeading>What the audits found</SectionHeading>
          <FindingsView
            key={`find${scope.kind}${scope.id}`}
            scope={scope}
            stores={scoped}
            scoreMap={data.scoreMap}
            issues={quarterIssues}
            observations={quarterObservations}
            audits={quarterAudits}
            yearAudits={yearAudits}
            details={details}
            selectedQ={selectedQ}
          />
        </>
      )}

      <PowerBiSample open={pbiOpen} onClose={() => setPbiOpen(false)} />
    </div>
  );
}
