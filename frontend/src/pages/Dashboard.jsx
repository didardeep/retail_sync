import { useState, useEffect, useMemo } from 'react';
import { Pie, Bar } from 'react-chartjs-2';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, loadSession } from '../api/client';
import { Loading } from '@/components/Loader';
import FormatLegend from '@/components/FormatLegend';
import ScopePicker from '@/components/ScopePicker';
import Tile from '@/components/Tile';
import PowerBiSample from '@/components/PowerBiSample';
import ObservationsCard from '@/components/dashboard/ObservationsCard';
import PlanningView from '@/components/dashboard/PlanningView';
import Panel, { Empty } from '@/components/charts/Panel';
import InfoButton from '@/components/InfoButton';
import { StoreView } from '@/components/store-dashboard/StoreView';
import { avC, sColor, pbClass, prC, stC } from '../utils/helpers';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Drawer } from '../components/Modal';
import { issuesLink, storesLink, storeScorecardLink } from '@/lib/links';
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

const VIEWS = [
  { key: 'planning', label: 'Audit Planning' },
  { key: 'execution', label: 'Audit Execution' },
];
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

// Audit Execution: how the audits went - scores by store, format and over the
// quarters, the observations by risk, and the issues raised. Everything passed
// in is already limited to the stores in scope and the selected quarter.
function ExecutionView({ scope, stores, scoreMap, issues, observations, audits, selectedQ }) {
  const navigate = useNavigate();
  const role = loadSession()?.user?.role;
  const words = wording(scope);
  const [drill, setDrill] = useState(null); // { title, items, link }

  const { scored, unscored } = scoreStores(stores, scoreMap, selectedQ);
  const ranked = rankScored(scored);
  const qLabel = quarterLabel(selectedQ);

  // Headline numbers for the execution side.
  const auditScores = audits.map((a) => a.score).filter((v) => typeof v === 'number');
  const avgAudit = averageScore(auditScores);
  const openIssues = issues.filter((i) => i.status !== 'Closed').length;
  const tiles = [
    { label: 'Average audit score', value: avgAudit !== null ? `${avgAudit}%` : '--', icon: '🎯', tint: '#ecfdf5' },
    { label: 'Audits scored', value: auditScores.length, icon: '✅', tint: '#e8eefa' },
    { label: 'Observations', value: observations.length, icon: '🔎', tint: '#fffbeb' },
    { label: 'Open issues', value: openIssues, icon: '⚠️', tint: '#fde8e8', go: () => navigate('/issues') },
  ];

  // Observations by risk: a plain pie, the legend gives count and share.
  const riskD = groupObservationsByRisk(observations).map((g) => ({ ...g, label: g.level, color: RISK_COLORS[g.level] }));
  const riskData = { labels: riskD.map((d) => d.label), datasets: [{ data: riskD.map((d) => d.count), backgroundColor: riskD.map((d) => d.color) }] };
  function openRisk(i) {
    const g = riskD[i];
    setDrill({ title: `${g.label} risk observations (${g.count})`, items: g.items.map((o) => ({ title: o.observation || '--', badges: [], sub: o.store || '' })) });
  }

  // Store scores: the top 10. The axis runs 0 to 100 so bar lengths compare honestly.
  const barStores = ranked.slice(0, 10);
  const storeBarNote = `${qLabel}, top ${barStores.length} of ${scored.length} scored`;
  const storeBarData = {
    labels: barStores.map((e) => e.store.name?.substring(0, 12) || e.store.id),
    datasets: [{ label: 'Score', data: barStores.map((e) => e.score), backgroundColor: barStores.map((e) => scoreColor(e.score)), maxBarThickness: 32 }],
  };
  const storeBarOpts = {
    responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.parsed.y}%` } } },
    // Names stay level (never slanted); when they do not all fit some are skipped and the tooltip names the bar.
    scales: { y: PERCENT_AXIS, x: { ...GRID_OFF, ticks: { maxRotation: 0, autoSkipPadding: 6 } } }, onHover: pointer,
    onClick: (_e, els) => { if (els.length) navigate(storeScorecardLink(barStores[els[0].index].store.id, role)); },
  };

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
  const recentIssues = issues.slice(0, 5);

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
        {tiles.map((t) => <Tile key={t.label} icon={t.icon} tint={t.tint} label={t.label} value={t.value} onClick={t.go} />)}
      </div>

      {/* Quarter by quarter: always every quarter of the year */}
      <div className="mb-3 grid grid-cols-1 gap-3">
        <Panel title={<>{words.risk}<InfoButton lines={CRITERIA.risk} /></>} hint={`${qLabel}, ${observations.length} observations`}>
          {riskD.length ? (
            <div className="flex items-center gap-4">
              <div className="relative size-[150px] shrink-0"><Pie data={riskData} options={pieOpts(openRisk)} /></div>
              <div className="min-w-0 flex-1"><LegendRows rows={riskD} onPick={openRisk} extra={(r) => `${r.pct}%`} /></div>
            </div>
          ) : <Empty>No observations in {qLabel}</Empty>}
        </Panel>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
        <Panel title={<>{words.storeBars}<InfoButton lines={CRITERIA.storeBars} /></>} hint={`${storeBarNote}. Green is ${SCORE_TARGET}% or above, amber 60 to ${SCORE_TARGET}%, red below 60. Click a bar to open the store.`}>
          {barStores.length ? <div className="relative h-[220px]"><Bar data={storeBarData} options={storeBarOpts} /></div> : <Empty>No stores scored in {qLabel}</Empty>}
        </Panel>
        <Panel title={<>{words.distribution}<InfoButton lines={CRITERIA.distribution} /></>} hint={`${qLabel}, stores per score band`}>
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
        <Panel title={<span className="flex items-center gap-1">{words.format}<InfoButton lines={CRITERIA.format} /><FormatLegend /></span>} hint={`${qLabel}, average score of the scored stores in each format`}>
          {fmtScored.length ? <div className="relative h-[200px]"><Bar data={fmtData} options={fmtOpts} /></div> : <Empty>No scored stores in {qLabel}</Empty>}
          {fmtD.some((d) => d.v === null) && (
            <p className="mt-2 text-[11px] text-muted-foreground">Not scored: {fmtD.filter((d) => d.v === null).map((d) => d.label).join(', ')}</p>
          )}
        </Panel>
        <Panel title={words.topBottom} hint={qLabel}>
          <div className="flex flex-col gap-4 sm:flex-row">
            <RankList title="Top 5 stores" rows={t5} tone="text-emerald-700" />
            <RankList title="Bottom 5 stores" rows={b5} tone="text-red-700" />
          </div>
        </Panel>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ObservationsCard scope={scope} observations={observations} issues={issues} />
        <Panel title={words.issues} action={<button type="button" className="text-[11px] text-muted-foreground hover:underline" onClick={() => navigate('/issues')}>View all &rarr;</button>}>
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

// Dashboard & Analytics. Two views, Audit Planning and Audit Execution (?view=),
// for all stores or one store (?store=<id>), and for
// all quarters of the year or one quarter.
export default function Dashboard() {
  const [params, setParams] = useSearchParams();
  const role = loadSession()?.user?.role;
  const [data, setData] = useState(null);
  const [selectedQ, setSelectedQ] = useState(ALL_QUARTERS);
  const [pbiOpen, setPbiOpen] = useState(false);
  const view = VIEWS.some((v) => v.key === params.get('view')) ? params.get('view') : 'planning';
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
        <ExecutionView
          key={`exec${scope.kind}${scope.id}`}
          scope={scope}
          stores={scoped}
          scoreMap={data.scoreMap}
          issues={quarterIssues}
          observations={quarterObservations}
          audits={quarterAudits}
          selectedQ={selectedQ}
        />
      )}

      <PowerBiSample open={pbiOpen} onClose={() => setPbiOpen(false)} />
    </div>
  );
}
