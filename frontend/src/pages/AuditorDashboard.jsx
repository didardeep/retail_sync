import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { AlertTriangle, CalendarDays, CheckCircle2, Loader2, XCircle } from 'lucide-react';

import { api, loadSession } from '@/api/client';
import { fetchAuditRows } from '@/api/sopSchedule';
import { Loading } from '@/components/Loader';
import { BRAND, bandColors, clickableBar, truncate } from '@/components/sop-dashboard/chartKit';
import { TARGET } from '@/components/sop-dashboard/logic';
import Panel, { Empty } from '@/components/sop-dashboard/Panel';
import Tile from '@/components/Tile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/Toast';
import { formatDate, isOverdue, mergeRows, scoreLabel } from '@/lib/auditRows';
import {
  auditorKpis, finishList, monthlyScheduledVsCompleted, monthlyScoreTrend, nextUp,
  progressPercent, recentSubmitted, statusBreakdown, storeLatestScores,
} from '@/lib/auditorStats';
import { sopAuditReviewLink, sopAuditRunLink, sopAuditsLink } from '@/lib/links';
import {
  getBundle, hydrateFromServer, listLocalAudits, summarize,
} from '@/lib/offline';

// Rebuilds the /api/sop-audits item shape from an on-device audit so offline
// drafts count. Progress comes from the local answers, never estimated.
async function localToItem(a) {
  let progress = null;
  if (a.status === 'Draft' || a.status === 'Returned') {
    try {
      const bundle = await getBundle(a.id);
      if (bundle && bundle.template) {
        const s = summarize(bundle.template, bundle.rows);
        progress = { answered: s.answered, total: s.applicable };
      }
    } catch {
      progress = null;
    }
  }
  return {
    id: a.id, store_id: a.store_id, store: a.store_name, template: a.template_name,
    template_code: a.template_code, template_version: a.template_version,
    scheduled_at: a.scheduled_at, notes: a.notes, status: a.status,
    auditor_id: a.auditor_id, updated_at: a.updated_at, progress,
  };
}

// Local items win over server items with the same id (the device can be ahead).
async function mergeLocalSop(remoteSop, localAudits) {
  const byId = new Map((remoteSop || []).map((r) => [r.id, r]));
  const items = await Promise.all(localAudits.map(localToItem));
  for (const it of items) {
    const next = { ...(byId.get(it.id) || {}) };
    for (const [k, v] of Object.entries(it)) {
      if (v !== undefined && v !== null && v !== '') next[k] = v;
    }
    byId.set(it.id, next);
  }
  return [...byId.values()];
}

function countWaitingToSync(localAudits) {
  return localAudits.filter(
    (a) => a.submit_pending || (a.header_rev || 0) > (a.header_synced_rev || 0),
  ).length;
}

function whenText(iso) {
  if (!iso) return 'No date';
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

const MAX_STORE_BARS = 8;

// Writes each point's value above it (the trend line has no data-label plugin).
const valueLabels = {
  id: 'valueLabels',
  afterDatasetsDraw(chart) {
    const meta = chart.getDatasetMeta(0);
    const values = chart.data.datasets[0].data;
    const { ctx } = chart;
    ctx.save();
    ctx.font = '600 10px sans-serif';
    ctx.fillStyle = BRAND;
    ctx.textAlign = 'center';
    meta.data.forEach((pt, i) => {
      if (values[i] !== null && values[i] !== undefined) ctx.fillText(`${values[i]}%`, pt.x, pt.y - 8);
    });
    ctx.restore();
  },
};

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
  layout: { padding: { top: 14 } },
  plugins: { legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } } },
  scales: { y: { min: 0, max: 100, ticks: { font: { size: 10 } } }, x: { ticks: { font: { size: 10 } } } },
};

const monthlyOpts = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } } },
  scales: {
    y: { beginAtZero: true, ticks: { font: { size: 10 }, precision: 0 } },
    x: { ticks: { font: { size: 10 } }, grid: { display: false } },
  },
};

function ChartEmpty({ children }) {
  return <div className="flex h-[190px] items-center justify-center text-xs text-muted-foreground">{children}</div>;
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-xl font-bold leading-none text-foreground">{value}</div>
    </div>
  );
}

export default function AuditorDashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const user = loadSession()?.user;
  const [state, setState] = useState({ status: 'loading', error: null });
  const [data, setData] = useState({ rows: [], issues: null, waiting: 0, localIds: [] });
  const [openingId, setOpeningId] = useState(null);

  const load = useCallback(async () => {
    setState({ status: 'loading', error: null });
    try {
      const [[legacy, sop], issues, local] = await Promise.all([
        fetchAuditRows(),
        api.issues().catch(() => null),
        listLocalAudits().catch(() => []),
      ]);
      const sopAll = await mergeLocalSop(sop || [], local);
      setData({
        rows: mergeRows(legacy || [], sopAll),
        issues: Array.isArray(issues) ? issues.length : null,
        waiting: countWaitingToSync(local),
        localIds: local.map((a) => a.id),
      });
      setState({ status: 'ready', error: null });
    } catch (e) {
      setState({ status: 'error', error: e });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const now = useMemo(() => new Date(), [data.rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const kpis = useMemo(() => auditorKpis(data.rows, now), [data.rows, now]);
  const next = useMemo(() => nextUp(data.rows, now), [data.rows, now]);
  const finish = useMemo(() => finishList(data.rows), [data.rows]);
  const recent = useMemo(() => recentSubmitted(data.rows, 5), [data.rows]);
  const slices = useMemo(() => statusBreakdown(data.rows, now), [data.rows, now]);
  const trend = useMemo(() => monthlyScoreTrend(data.rows, now, 6), [data.rows, now]);
  const monthly = useMemo(() => monthlyScheduledVsCompleted(data.rows, now, 6), [data.rows, now]);
  const storeScores = useMemo(() => storeLatestScores(data.rows), [data.rows]);

  // Same behaviour as SopAudits open(): SOP audits go to the wizard (downloaded
  // to the device first if needed), classic audits to their audit page.
  async function open(row) {
    if (row.kind !== 'sop') {
      navigate(`/audits/${encodeURIComponent(row.id)}`);
      return;
    }
    setOpeningId(row.id);
    try {
      if (!data.localIds.includes(row.id)) {
        if (!navigator.onLine) throw new Error('Connect to the internet once to download this audit.');
        await hydrateFromServer(row.id);
      }
      navigate(sopAuditRunLink(row.id));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setOpeningId(null);
    }
  }

  function review(row) {
    navigate(row.kind === 'sop' ? sopAuditReviewLink(row.id) : `/audits/${encodeURIComponent(row.id)}`);
  }

  if (state.status === 'loading') return <Loading what="your dashboard" />;

  if (state.status === 'error') {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 text-[15px] font-bold text-foreground">Dashboard</div>
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="mb-3 text-sm text-muted-foreground">
            {state.error?.message || 'Could not load your dashboard.'}
          </p>
          <Button onClick={load}>Retry</Button>
        </div>
      </div>
    );
  }

  // Every click opens the Audit page filtered the same way the numbers are
  // counted (see statusMatches in components/audit/auditHelpers).
  const toStatus = (status) => () => navigate(sopAuditsLink({ status }));

  const sliceTotal = slices.reduce((n, sl) => n + sl.count, 0);
  const pctOf = (n) => (sliceTotal ? Math.round((n / sliceTotal) * 100) : 0);
  const statusData = {
    labels: slices.map((sl) => sl.label),
    datasets: [{ data: slices.map((sl) => sl.count), backgroundColor: slices.map((sl) => sl.color), borderWidth: 2, borderColor: '#fff' }],
  };
  const openSlice = (idx) => navigate(sopAuditsLink({ status: slices[idx].key }));

  const hasTrend = trend.some((m) => m.avg !== null);
  const trendData = {
    labels: trend.map((m) => m.label),
    datasets: [
      { label: 'Average score', data: trend.map((m) => m.avg), borderColor: BRAND, backgroundColor: 'rgba(0,51,141,.08)', borderWidth: 2.5, tension: 0.4, pointRadius: 4, fill: true, spanGaps: true },
      { label: 'Target', data: trend.map(() => TARGET), borderColor: '#9ca3af', borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0, fill: false },
    ],
  };

  const hasMonthly = monthly.some((m) => m.scheduled > 0 || m.completed > 0);
  const monthlyData = {
    labels: monthly.map((m) => m.label),
    datasets: [
      { label: 'Scheduled', data: monthly.map((m) => m.scheduled), backgroundColor: BRAND, borderRadius: 4 },
      { label: 'Completed', data: monthly.map((m) => m.completed), backgroundColor: '#0e9f6e', borderRadius: 4 },
    ],
  };

  const storeBars = storeScores.slice(0, MAX_STORE_BARS);
  const storeData = {
    labels: storeBars.map((st) => truncate(st.store, 16)),
    datasets: [{ data: storeBars.map((st) => st.percent), backgroundColor: bandColors(storeBars.map((st) => st.percent)), borderRadius: 4 }],
  };
  const storeOpts = clickableBar({
    horizontal: true,
    percentAxis: true,
    onPick: (i) => navigate(sopAuditsLink({ store: storeBars[i].store_id })),
  });

  const monthYear = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-foreground">My Audits</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {user?.name ? `${user.name} - ` : ''}Your audits - {monthYear}
        </p>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile icon={CalendarDays} tint="#e8eefa" label="Scheduled" value={kpis.scheduled} onClick={toStatus('scheduled')} />
        <Tile icon={Loader2} tint="#fffbeb" label="In progress" value={kpis.in_progress} onClick={toStatus('in_progress')} />
        <Tile icon={CheckCircle2} tint="#ecfdf5" label="Submitted" value={kpis.completed} onClick={toStatus('completed')} />
        <Tile icon={XCircle} tint="#f1f5f9" label="Cancelled" value={kpis.cancelled} onClick={toStatus('cancelled')} />
        <Tile icon={AlertTriangle} tint="#fde8e8" label="Overdue" value={kpis.overdue} onClick={toStatus('overdue')} />
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between text-[13px] font-semibold text-foreground">
            Score trend<span className="text-[11px] font-normal text-muted-foreground">Target: {TARGET}%</span>
          </div>
          {hasTrend ? (
            <div className="relative h-[190px] w-full"><Line data={trendData} options={trendOpts} plugins={[valueLabels]} /></div>
          ) : <ChartEmpty>No submitted audits yet</ChartEmpty>}
        </div>
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="mb-3 text-[13px] font-semibold text-foreground">
            My audits by status<span className="ml-2 text-[11px] font-normal text-muted-foreground">{sliceTotal} total</span>
          </div>
          {sliceTotal === 0 ? <ChartEmpty>No audits yet</ChartEmpty> : (
            <div className="flex h-[190px] items-center justify-center gap-4">
              <div className="relative h-[155px] w-[155px] shrink-0">
                <Doughnut data={statusData} options={donutOpts('62%', openSlice)} />
              </div>
              <div className="text-[11.5px]">
                {slices.map((sl, i) => (
                  <div key={sl.key} className="mb-1.5 flex cursor-pointer items-center gap-1.5" onClick={() => openSlice(i)}>
                    <span className="inline-block h-[9px] w-[9px] rounded-sm" style={{ background: sl.color }} />
                    {sl.label}: <b>{pctOf(sl.count)}% ({sl.count})</b>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between text-[13px] font-semibold text-foreground">
            Scheduled vs completed by month<span className="text-[11px] font-normal text-muted-foreground">Last 6 months</span>
          </div>
          {hasMonthly ? (
            <div className="relative h-[190px] w-full"><Bar data={monthlyData} options={monthlyOpts} /></div>
          ) : <ChartEmpty>No audits yet</ChartEmpty>}
        </div>
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="mb-3 text-[13px] font-semibold text-foreground">
            My stores<span className="ml-2 text-[11px] font-normal text-muted-foreground">Latest score, {storeBars.length} of {storeScores.length} stores</span>
          </div>
          {storeBars.length ? (
            <div className="relative h-[190px] w-full"><Bar data={storeData} options={storeOpts} /></div>
          ) : <ChartEmpty>No submitted audits yet</ChartEmpty>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Panel title="Next up" hint="Your earliest scheduled audit">
          {!next ? (
            <Empty>Nothing is scheduled for you right now.</Empty>
          ) : (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground">{next.store || 'Store'}</div>
                <div className="truncate text-xs text-muted-foreground">{next.tool}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className={isOverdue(next, now) ? 'font-semibold text-destructive' : 'text-foreground/80'}>
                    {whenText(next.date)}
                  </span>
                  {isOverdue(next, now) && <Badge variant="destructive">Overdue</Badge>}
                </div>
                {next.notes && <div className="mt-0.5 truncate text-xs text-muted-foreground">{next.notes}</div>}
              </div>
              <Button size="sm" className="h-10 shrink-0" disabled={openingId === next.id} onClick={() => open(next)}>
                Start
              </Button>
            </div>
          )}
        </Panel>

        <Panel title="Finish these" hint="Audits you have started">
          {finish.length === 0 ? (
            <Empty>No unfinished audits.</Empty>
          ) : (
            <div className="space-y-3">
              {finish.map((r) => {
                const pct = progressPercent(r);
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => open(r)}
                    disabled={openingId === r.id}
                    className="block w-full text-left"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="truncate text-sm font-medium text-foreground">{r.store || 'Store'} - {r.tool}</div>
                      <div className="shrink-0 text-xs text-muted-foreground">{pct === null ? '--' : `${pct}%`}</div>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct || 0}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Recently submitted" hint="Your last five audits">
          {recent.length === 0 ? (
            <Empty>You have not submitted any audits yet.</Empty>
          ) : (
            <div className="divide-y divide-border">
              {recent.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => review(r)}
                  className="flex w-full items-center gap-3 py-2 text-left first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{r.store || 'Store'}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {r.tool} - {formatDate(r.submitted_at || r.date)}
                    </div>
                  </div>
                  <Badge variant="secondary">{scoreLabel(r)}</Badge>
                </button>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="My numbers">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Average score" value={kpis.avg_percent === null ? '--' : `${kpis.avg_percent}%`} />
            <Stat label="Audits this month" value={kpis.audits_this_month} />
            <Stat label="Stores audited this month" value={kpis.stores_this_month} />
            <Stat label="Issues raised" value={data.issues === null ? '--' : data.issues} />
            {data.waiting > 0 && <Stat label="Waiting to sync" value={data.waiting} />}
          </div>
        </Panel>
      </div>
    </div>
  );
}
