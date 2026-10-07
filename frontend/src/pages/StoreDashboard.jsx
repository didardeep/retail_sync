import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardCheck, Clock } from 'lucide-react';

import { api, loadSession } from '@/api/client';
import { Loading } from '@/components/Loader';
import StorePicker from '@/components/StorePicker';
import Tile from '@/components/Tile';
import { BRAND, bandColors, clickableBar } from '@/components/sop-dashboard/chartKit';
import DrillDrawer from '@/components/store-dashboard/DrillDrawer';
import { AuditList, IssueList } from '@/components/store-dashboard/DrillLists';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate, mergeRows, scoreLabel } from '@/lib/auditRows';
import { auditsLink, issuesLink, storeScorecardLink } from '@/lib/links';
import { canAccess } from '@/lib/rolesMap';
import { stageBadgeClass } from '@/lib/statuses';
import {
  BENCHMARK, QUARTERS, auditPath, forStore, latestScoredQuarter, priorityBreakdown,
  recentRows, scoreTrend, scoredResults, stageBreakdown, storeKpis, topOpenIssues,
} from '@/lib/storeStats';
import { useUrlFilters } from '@/lib/useUrlFilters';
import { cn } from '@/lib/utils';
import { prC, sColor, stC } from '@/utils/helpers';

const RECENT_LIMIT = 8;
const TOP_ISSUES = 5;

const donutOpts = (cutout, onClick) => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout,
  plugins: { legend: { display: false }, tooltip: { intersect: true, titleFont: { size: 13 }, bodyFont: { size: 13 }, padding: 10, displayColors: true } },
  onClick: (evt, els) => { if (els.length && onClick) onClick(els[0].index); },
});

const trendOpts = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } } },
  scales: { y: { min: 0, max: 100, ticks: { font: { size: 10 } } }, x: { ticks: { font: { size: 10 } } } },
};

function ChartEmpty({ children }) {
  return <div className="flex h-[190px] items-center justify-center px-4 text-center text-xs text-muted-foreground">{children}</div>;
}

function Card({ title, note, action, className, children }) {
  return (
    <div className={cn('rounded-[10px] border border-border bg-card p-4', className)}>
      <div className="mb-3 flex items-center justify-between gap-2 text-[13px] font-semibold text-foreground">
        <span>
          {title}
          {note && <span className="ml-2 text-[11px] font-normal text-muted-foreground">{note}</span>}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}

// Doughnut with a clickable side legend: "Label: 40% (2)".
function DonutCard({ title, note, slices, total, empty, cutout = '62%', onPick }) {
  const data = {
    labels: slices.map((s) => s.label),
    datasets: [{ data: slices.map((s) => s.count), backgroundColor: slices.map((s) => s.color), borderWidth: 2, borderColor: '#fff' }],
  };
  return (
    <Card title={title} note={note}>
      {total === 0 ? <ChartEmpty>{empty}</ChartEmpty> : (
        <div className="flex h-[190px] items-center justify-center gap-4">
          <div className="relative h-[155px] w-[155px] shrink-0">
            <Doughnut data={data} options={donutOpts(cutout, onPick)} />
          </div>
          <div className="text-[11.5px]">
            {slices.map((s, i) => (
              <div key={s.key} className="mb-1.5 flex cursor-pointer items-center gap-1.5" onClick={() => onPick(i)}>
                <span className="inline-block h-[9px] w-[9px] rounded-sm" style={{ background: s.color }} />
                {s.label}: <b>{s.pct}% ({s.count})</b>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function StoreDashboard() {
  const navigate = useNavigate();
  const role = loadSession()?.user?.role;
  const canPick = role === 'ADMIN' || role === 'AUDIT_MANAGER';
  const canOpenAudits = canAccess(role, 'audits');
  const { filters, setFilter } = useUrlFilters(['store']);
  const [state, setState] = useState({ status: 'loading', error: null });
  const [data, setData] = useState({ stores: [], audits: [], sop: [], issues: [], scores: [] });
  const [pickedQ, setPickedQ] = useState(null);
  const [drill, setDrill] = useState(null);

  const load = useCallback(async () => {
    setState({ status: 'loading', error: null });
    try {
      const [stores, audits, sop, issues, scores] = await Promise.all([
        api.stores(), api.audits(), api.sopAudits(), api.issues(), api.storeScores(),
      ]);
      setData({
        stores: stores || [], audits: audits || [], sop: sop || [], issues: issues || [], scores: scores || [],
      });
      setState({ status: 'ready', error: null });
    } catch (e) {
      setState({ status: 'error', error: e });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Admin / manager: the picked store (default first). Store manager: their own
  // (the API only returns it).
  const store = useMemo(() => {
    if (canPick && filters.store) {
      const hit = data.stores.find((s) => s.id === filters.store);
      if (hit) return hit;
    }
    return data.stores[0] || null;
  }, [data.stores, canPick, filters.store]);
  const storeId = store ? store.id : '';

  const rows = useMemo(
    () => mergeRows(forStore(data.audits, storeId), forStore(data.sop, storeId)),
    [data.audits, data.sop, storeId],
  );
  const issues = useMemo(() => forStore(data.issues, storeId), [data.issues, storeId]);

  const latestQ = useMemo(() => latestScoredQuarter(data.scores, storeId), [data.scores, storeId]);
  const quarter = pickedQ || latestQ || QUARTERS[QUARTERS.length - 1];
  const kpis = useMemo(
    () => storeKpis({ rows, issues, scores: data.scores, storeId, quarter }),
    [rows, issues, data.scores, storeId, quarter],
  );
  const trend = useMemo(() => scoreTrend(data.scores, storeId), [data.scores, storeId]);
  const priorities = useMemo(() => priorityBreakdown(issues), [issues]);
  const stages = useMemo(() => stageBreakdown(rows), [rows]);
  const results = useMemo(() => scoredResults(rows), [rows]);
  const recent = useMemo(() => recentRows(rows, RECENT_LIMIT), [rows]);
  const topIssues = useMemo(() => topOpenIssues(issues, TOP_ISSUES), [issues]);
  const open = kpis.open;

  if (state.status === 'loading') return <Loading what="your store" />;

  if (state.status === 'error') {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 text-[15px] font-bold text-foreground">My Store</div>
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="mb-3 text-sm text-muted-foreground">
            {state.error?.message || 'Could not load your store.'}
          </p>
          <Button onClick={load}>Retry</Button>
        </div>
      </div>
    );
  }

  if (!store) {
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground">No store assigned to your account.</div>;
  }

  const qLabel = quarter.toUpperCase();
  const storeAuditsLink = auditsLink({ store: store.id });

  // ---- Drawer lists: the same arrays the numbers come from -----------------
  const showAudits = (title, list) => setDrill({
    title: `${title} (${list.length})`,
    kind: 'audits',
    rows: list,
    link: canOpenAudits ? { to: storeAuditsLink, label: 'View all audits' } : null,
  });
  const showIssues = (title, list) => setDrill({
    title: `${title} (${list.length})`,
    kind: 'issues',
    issues: list,
    link: { to: issuesLink({ store: store.name }), label: 'View all issues' },
  });
  const closeDrill = () => setDrill(null);

  const openPriority = (idx) => {
    const g = priorities[idx];
    showIssues(`${g.level} priority open issues`, g.items);
  };
  const openStage = (idx) => {
    const sl = stages[idx];
    if (canOpenAudits) navigate(auditsLink({ stage: sl.key, store: store.id }));
    else showAudits(`${sl.label} audits`, sl.rows);
  };

  // ---- Chart data ------------------------------------------------------------
  const hasTrend = trend.some((p) => p.value !== null);
  const trendData = {
    labels: trend.map((p) => p.label),
    datasets: [
      { label: 'Store score', data: trend.map((p) => p.value), borderColor: BRAND, backgroundColor: 'rgba(0,51,141,.08)', borderWidth: 2.5, tension: 0.4, pointRadius: 3, fill: true },
      { label: 'Benchmark', data: trend.map(() => BENCHMARK), borderColor: '#9ca3af', borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0, fill: false },
    ],
  };

  const resultsData = {
    labels: results.map((r) => formatDate(r.submitted_at || r.date)),
    datasets: [{ data: results.map((r) => r.percent), backgroundColor: bandColors(results.map((r) => r.percent)), borderRadius: 4 }],
  };
  const resultsOpts = clickableBar({
    percentAxis: true,
    onPick: (i) => navigate(auditPath(results[i])),
  });
  const latestResult = results.length ? results[results.length - 1] : null;

  const priorityTotal = open.length;
  const prioritySlices = priorities.map((g) => ({ key: g.level, label: g.level, color: g.color, count: g.count, pct: g.pct }));

  const scoreText = kpis.score === null ? '--' : `${kpis.score}%`;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2 className="text-xl font-bold text-foreground">My Store</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {store.name}{store.city ? `, ${store.city}` : ''}{store.region ? ` - ${store.region}` : ''}
          </p>
        </div>
        {canPick && (
          <StorePicker stores={data.stores} value={store.id} onChange={(v) => setFilter('store', v)} />
        )}
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-end gap-1.5">
        {QUARTERS.map((q) => (
          <Button key={q} size="sm" variant={quarter === q ? 'default' : 'outline'} onClick={() => setPickedQ(q)}>
            {q.toUpperCase()}
          </Button>
        ))}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile
          icon={ClipboardCheck}
          tint="#e8eefa"
          label={`${qLabel} score`}
          value={scoreText}
          onClick={() => navigate(storeScorecardLink(store.id, role))}
        />
        <Tile
          icon={CheckCircle2}
          tint="#ecfdf5"
          label="Audits completed"
          value={kpis.done.length}
          onClick={() => showAudits('Completed audits', kpis.done)}
        />
        <Tile
          icon={CalendarClock}
          tint="#fffbeb"
          label="Scheduled / in progress"
          value={kpis.active.length}
          onClick={() => showAudits('Scheduled and in progress audits', kpis.active)}
        />
        <Tile
          icon={Clock}
          tint="#feecdc"
          label="Open issues"
          value={open.length}
          onClick={() => showIssues('Open issues', open)}
        />
        <Tile
          icon={AlertTriangle}
          tint="#fde8e8"
          label="Overdue issues"
          value={kpis.overdue.length}
          onClick={() => showIssues('Overdue issues', kpis.overdue)}
        />
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
        <Card title="Score trend" note={`Benchmark: ${BENCHMARK}%`}>
          {hasTrend ? (
            <div className="relative h-[190px] w-full"><Line data={trendData} options={trendOpts} /></div>
          ) : <ChartEmpty>No quarterly score is stored for this store yet</ChartEmpty>}
        </Card>
        <DonutCard
          title="Issues by priority"
          note={`${priorityTotal} open`}
          slices={prioritySlices}
          total={priorityTotal}
          empty="No open issues"
          onPick={openPriority}
        />
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
        <Card
          title="Audit results"
          note={latestResult ? `Latest: ${scoreLabel(latestResult)} on ${formatDate(latestResult.submitted_at || latestResult.date)}` : null}
        >
          {results.length ? (
            <div className="relative h-[190px] w-full"><Bar data={resultsData} options={resultsOpts} /></div>
          ) : <ChartEmpty>No scored audits yet</ChartEmpty>}
        </Card>
        <DonutCard
          title="Audits by status"
          note={`${rows.length} total`}
          slices={stages}
          total={rows.length}
          empty="No audits yet"
          onPick={openStage}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card
          title="Recent audits"
          action={canOpenAudits && rows.length > RECENT_LIMIT ? (
            <Link to={storeAuditsLink} className="text-[11px] font-normal text-primary hover:underline">View all ({rows.length})</Link>
          ) : null}
        >
          {recent.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">No audits found for this store.</div>
          ) : (
            <div className="divide-y divide-border">
              {recent.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => navigate(auditPath(r))}
                  className="flex w-full items-center gap-3 py-2 text-left first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{r.tool}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {formatDate(r.date)} - {r.auditor || 'Unassigned'}
                    </div>
                  </div>
                  {typeof r.percent === 'number' && (
                    <span className="shrink-0 text-xs font-semibold" style={{ color: sColor(r.percent) }}>{scoreLabel(r)}</span>
                  )}
                  <Badge className={cn('shrink-0', stageBadgeClass(r.stage))}>{r.status}</Badge>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card
          title="Open issues"
          note={open.length ? `${open.length} open` : null}
          action={open.length > 0 ? (
            <Link to={issuesLink({ store: store.name })} className="text-[11px] font-normal text-primary hover:underline">View all</Link>
          ) : null}
        >
          {topIssues.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">No open issues.</div>
          ) : (
            <div className="divide-y divide-border">
              {topIssues.map((i) => (
                <Link key={i.id} to={issuesLink({ id: i.id })} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{i.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{i.description ? i.description.substring(0, 60) : ''}</div>
                  </div>
                  <Badge className={cn('shrink-0', prC(i.priority))}>{i.priority || 'Unrated'}</Badge>
                  <Badge className={cn('shrink-0', stC(i.status))}>{i.status}</Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      <DrillDrawer
        open={drill !== null}
        onClose={closeDrill}
        title={drill ? drill.title : ''}
        link={drill ? drill.link : null}
        empty="Nothing in this list."
      >
        {drill && drill.kind === 'audits' && drill.rows.length > 0 && <AuditList rows={drill.rows} onNavigate={closeDrill} />}
        {drill && drill.kind === 'issues' && drill.issues.length > 0 && <IssueList issues={drill.issues} onNavigate={closeDrill} />}
      </DrillDrawer>
    </div>
  );
}
