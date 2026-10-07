import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarDays, CheckCircle2, Loader2, XCircle } from 'lucide-react';

import { api, loadSession } from '@/api/client';
import { fetchAuditRows } from '@/api/sopSchedule';
import { Loading } from '@/components/Loader';
import Panel, { Empty } from '@/components/sop-dashboard/Panel';
import Tile from '@/components/Tile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/Toast';
import { formatDate, isOverdue, mergeRows, scoreLabel } from '@/lib/auditRows';
import {
  auditorKpis, finishList, nextUp, progressPercent, recentSubmitted,
} from '@/lib/auditorStats';
import { auditsLink, sopAuditReviewLink, sopAuditRunLink } from '@/lib/links';
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

  const toStage = (stage) => () => navigate(auditsLink({ stage }));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4">
        <div className="text-[15px] font-bold text-foreground">Dashboard</div>
        {user?.name && <div className="text-xs text-muted-foreground">{user.name}</div>}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile icon={CalendarDays} tint="#e8eefa" label="Scheduled" value={kpis.scheduled} onClick={toStage('scheduled')} />
        <Tile icon={Loader2} tint="#fffbeb" label="In progress" value={kpis.in_progress} onClick={toStage('in_progress')} />
        <Tile icon={CheckCircle2} tint="#ecfdf5" label="Submitted" value={kpis.completed} onClick={toStage('completed')} />
        <Tile icon={XCircle} tint="#f1f5f9" label="Cancelled" value={kpis.cancelled} onClick={toStage('cancelled')} />
        <Tile icon={AlertTriangle} tint="#fde8e8" label="Overdue" value={kpis.overdue} onClick={toStage('scheduled')} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
