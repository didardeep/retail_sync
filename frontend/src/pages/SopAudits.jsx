import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import { api, loadSession } from '@/api/client';
import { cn, fieldClass, labelClass } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/Toast';
import { Loading } from '@/components/Loader';
import SopStatusBadge from '@/components/SopStatusBadge';
import SyncChip from '@/components/SyncChip';
import { Badge } from '@/components/ui/badge';
import {
  schedulingLink, sopAuditReviewLink, sopAuditRunLink, sopDashboardLink,
} from '@/lib/links';
import { isAuditorEditable } from '@/lib/statuses';
import { useUrlFilters } from '@/lib/useUrlFilters';
import {
  createAudit, currentUserId, findDraft, getStores, getTemplates,
  hydrateFromServer, listLocalAudits, refreshReferenceData, useOnline,
  useSyncState,
} from '@/lib/offline';
import { syncAssigned } from '@/lib/offline/sync';

const FILTER_KEYS = ['store', 'tool', 'status', 'view'];

const fmt = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

function when(iso) {
  if (!iso) return '';
  return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

// Scheduled audits are stored without a timezone; show them as entered.
function whenScheduled(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function isPastDay(iso) {
  if (!iso) return false;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return new Date(iso) < startOfToday;
}

// An audit a manager assigned: Planned or Draft with a scheduled date.
const isAssigned = (r) => isAuditorEditable(r.status) && !!r.scheduled_at;

// Local (on-device) and server audits merged by id; the local copy wins for
// state because it can be ahead of the server while offline.
function mergeRows(local, remote) {
  const byId = new Map();
  for (const r of remote || []) {
    byId.set(r.id, {
      id: r.id, store_id: r.store_id, store_name: r.store, template_name: r.template,
      template_code: r.template_code, scheduled_at: r.scheduled_at, notes: r.notes,
      status: r.status, updated_at: r.updated_at, auditor: r.auditor,
      auditor_id: r.auditor_id, template_version: r.template_version,
      summary: r.status === 'Submitted'
        ? { score: r.score, max_score: r.max_score, percent: r.percent } : null,
    });
  }
  for (const a of local) {
    const prev = byId.get(a.id) || {};
    byId.set(a.id, {
      ...prev,
      id: a.id, store_id: a.store_id, store_name: a.store_name,
      template_name: a.template_name, template_code: a.template_code,
      scheduled_at: a.scheduled_at || prev.scheduled_at, notes: a.notes || prev.notes,
      template_version: a.template_version || prev.template_version, status: a.status,
      submit_pending: a.submit_pending, sync_error: a.sync_error,
      updated_at: a.updated_at, auditor_id: a.auditor_id,
      summary: a.server_summary || prev.summary || null,
    });
  }
  return [...byId.values()].sort((x, y) => (y.updated_at || '').localeCompare(x.updated_at || ''));
}

export default function SopAudits() {
  const navigate = useNavigate();
  const toast = useToast();
  const online = useOnline();
  const sync = useSyncState();
  const { filters, setFilter } = useUrlFilters(FILTER_KEYS);
  const role = loadSession()?.user?.role;
  const isAuditor = role === 'AUDITOR';
  const isManager = role === 'AUDIT_MANAGER' || role === 'ADMIN';
  const assignedOnly = filters.view === 'assigned';

  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [local, setLocal] = useState([]);
  const [remote, setRemote] = useState(null);
  const [remoteError, setRemoteError] = useState(null);
  const [storeId, setStoreId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [starting, setStarting] = useState(false);
  const [openingId, setOpeningId] = useState(null);

  const loadLocal = useCallback(async () => {
    const [st, tp, la] = await Promise.all([getStores(), getTemplates(), listLocalAudits()]);
    setStores(st);
    setTemplates(tp);
    setLocal(la);
  }, []);

  const loadRemote = useCallback(async () => {
    try {
      setRemote(await api.sopAudits());
      setRemoteError(null);
    } catch (e) {
      setRemoteError(e);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (isAuditor) {
        await loadLocal();
        if (!cancelled) setLoading(false); // show cached data immediately
        if (navigator.onLine) {
          await refreshReferenceData().catch(() => {});
          await syncAssigned(); // pulls newly assigned audits onto the device
          await loadLocal().catch(() => {});
        }
      }
      if (navigator.onLine) await loadRemote();
      if (!cancelled) setLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, [isAuditor, loadLocal, loadRemote]);

  // Re-read after each sync pass so statuses flip to Submitted etc.
  useEffect(() => {
    if (isAuditor) loadLocal();
    if (online) loadRemote();
  }, [sync.lastSync, sync.pending]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedCode = templates.find((t) => t.id === templateId)?.code;
  const rows = useMemo(() => mergeRows(local, remote), [local, remote]);

  const matches = (r) =>
    (!filters.store || r.store_id === filters.store) &&
    (!filters.tool || r.template_code === filters.tool) &&
    (!filters.status || r.status === filters.status);
  const assigned = useMemo(
    () => (isAuditor
      ? rows.filter((r) => isAssigned(r) && r.auditor_id === currentUserId() && matches(r))
        .sort((x, y) => x.scheduled_at.localeCompare(y.scheduled_at))
      : []),
    [rows, isAuditor, filters.store, filters.tool, filters.status], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const assignedIds = new Set(assigned.map((r) => r.id));
  // Managers see Planned and Cancelled audits on the Scheduling page instead.
  const shown = rows.filter((r) => matches(r) && !assignedIds.has(r.id)
    && (isAuditor || !['Planned', 'Cancelled'].includes(r.status)));

  const existingDraft = local.find(
    (a) => isAuditorEditable(a.status) && a.store_id === storeId && a.template_code === selectedCode,
  );
  const existingAssigned = rows.find(
    (r) => isAssigned(r) && r.auditor_id === currentUserId()
      && r.store_id === storeId && r.template_code === selectedCode,
  );

  // Make sure the audit is on this device (assigned audits start on the server).
  async function ensureLocal(id) {
    if (local.some((a) => a.id === id)) return;
    if (!navigator.onLine) {
      throw new Error('Connect to the internet once to download this audit.');
    }
    await hydrateFromServer(id);
  }

  async function start() {
    const store = stores.find((s) => s.id === storeId);
    const template = templates.find((t) => t.id === templateId);
    if (!store || !template) return;
    setStarting(true);
    try {
      const draft = await findDraft(store.id, template.code);
      if (draft) {
        navigate(sopAuditRunLink(draft.id));
        return;
      }
      if (existingAssigned) {
        await ensureLocal(existingAssigned.id);
        navigate(sopAuditRunLink(existingAssigned.id));
        return;
      }
      const audit = await createAudit(store, template);
      navigate(sopAuditRunLink(audit.id));
    } catch (e) {
      toast.error(e.message);
      setStarting(false);
    }
  }

  async function open(row) {
    const mine = row.auditor_id === currentUserId();
    if (isAuditorEditable(row.status) && mine) {
      setOpeningId(row.id);
      try {
        await ensureLocal(row.id);
        navigate(sopAuditRunLink(row.id));
      } catch (e) {
        toast.error(e.message);
      } finally {
        setOpeningId(null);
      }
    } else {
      navigate(sopAuditReviewLink(row.id));
    }
  }

  if (loading) return <Loading what="audits" />;

  const filterStores = isAuditor
    ? stores
    : [...new Map(rows.map((r) => [r.store_id, { id: r.store_id, name: r.store_name }])).values()];
  const filterTools = [...new Map(
    rows.filter((r) => r.template_code).map((r) => [r.template_code, r.template_name]),
  ).entries()];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="text-[15px] font-bold text-foreground">SOP Audits</div>
        {isAuditor && <SyncChip />}
        {isManager && (
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline"><Link to={sopDashboardLink({})}>View scores</Link></Button>
            <Button asChild size="sm"><Link to={schedulingLink({ newKind: 'sop' })}>Schedule an SOP audit</Link></Button>
          </div>
        )}
      </div>

      {isAuditor && (
        <section className="mb-5" aria-label="Assigned to me">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-foreground">Assigned to me</div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setFilter('view', '')}
                className={cn('rounded-md border px-2.5 py-1 text-xs', !assignedOnly ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilter('view', 'assigned')}
                className={cn('rounded-md border px-2.5 py-1 text-xs', assignedOnly ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}
              >
                Assigned only
              </button>
            </div>
          </div>
          {assigned.length === 0 ? (
            <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
              Nothing is assigned to you right now.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
              {assigned.map((r, i) => {
                const overdue = isPastDay(r.scheduled_at);
                return (
                  <div
                    key={r.id}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3',
                      i > 0 && 'border-t border-border',
                      overdue && 'bg-red-50',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {r.template_name}
                        {r.template_version > 1 && <span className="ml-1 text-[10px] font-normal text-muted-foreground">v{r.template_version}</span>}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{r.store_name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className={overdue ? 'font-semibold text-destructive' : 'text-foreground/80'}>
                          {whenScheduled(r.scheduled_at)}
                        </span>
                        {overdue && <Badge variant="destructive">Overdue</Badge>}
                        {r.status === 'Draft' && <Badge variant="secondary">In progress</Badge>}
                        {r.sync_error && <span className="text-destructive">{r.sync_error}</span>}
                      </div>
                      {r.notes && <div className="mt-0.5 truncate text-xs text-muted-foreground">{r.notes}</div>}
                    </div>
                    <Button
                      size="sm"
                      className="h-10 shrink-0"
                      disabled={openingId === r.id}
                      onClick={() => open(r)}
                    >
                      {r.status === 'Draft' ? 'Resume' : 'Start'}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {isAuditor && !assignedOnly && (
        <div className="mb-5 rounded-lg border bg-card p-4 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-foreground">Start an audit</div>

          <label className={labelClass} htmlFor="sop-store">1. Select store</label>
          <select
            id="sop-store"
            className={cn(fieldClass, 'h-11')}
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
          >
            <option value="">Choose a store...</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.city ? ` - ${s.city}` : ''}</option>
            ))}
          </select>

          <div className={cn(labelClass, 'mt-4')}>2. Select audit</div>
          {templates.length === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              {online
                ? 'No audit tools found.'
                : 'Connect to the internet once to download the audit tools.'}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplateId(t.id)}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-colors',
                    templateId === t.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-accent',
                  )}
                >
                  <div className="text-sm font-bold text-foreground">{t.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {t.section_count} sections - {t.criterion_count} questions - {fmt(t.total_marks)} marks
                  </div>
                </button>
              ))}
            </div>
          )}

          <Button
            className="mt-4 h-11 w-full"
            disabled={!storeId || !templateId || starting}
            onClick={start}
          >
            {existingDraft || existingAssigned ? 'Resume draft' : 'Start audit'}
          </Button>
          {(existingDraft || existingAssigned) && (
            <div className="mt-1.5 text-center text-xs text-muted-foreground">
              {existingAssigned && !existingDraft
                ? 'This audit is assigned to you; it will open instead of starting a new one.'
                : 'You already have a draft for this store and audit.'}
            </div>
          )}
        </div>
      )}

      {!(isAuditor && assignedOnly) && (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="mr-auto text-sm font-semibold text-foreground">
              {isAuditor ? 'My audits' : 'Submitted audits'}
            </div>
            <select className={cn(fieldClass, 'h-10 w-auto min-w-[130px]')} value={filters.store} onChange={(e) => setFilter('store', e.target.value)} aria-label="Filter by store">
              <option value="">All stores</option>
              {filterStores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className={cn(fieldClass, 'h-10 w-auto')} value={filters.tool} onChange={(e) => setFilter('tool', e.target.value)} aria-label="Filter by audit tool">
              <option value="">All tools</option>
              {filterTools.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
            <select className={cn(fieldClass, 'h-10 w-auto')} value={filters.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Filter by status">
              <option value="">All status</option>
              <option value="Planned">Assigned</option>
              <option value="Draft">Draft</option>
              <option value="Submitted">Submitted</option>
              <option value="Approved">Approved</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          {!isAuditor && remoteError && (
            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {online ? remoteError.message : 'You are offline. Connect to see audits.'}
            </div>
          )}

          {shown.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No audits yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
              {shown.map((r, i) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => open(r)}
                  className={cn('flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent', i > 0 && 'border-t border-border')}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">{r.store_name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {r.template_name}{r.auditor && !isAuditor ? ` - ${r.auditor}` : ''} - {when(r.updated_at)}
                    </div>
                    {r.sync_error && <div className="mt-0.5 truncate text-xs text-destructive">{r.sync_error}</div>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <SopStatusBadge
                      status={r.status}
                      submitPending={r.submit_pending}
                      syncError={r.sync_error}
                      version={r.template_version}
                    />
                    {r.summary && r.summary.max_score != null && (
                      <div className="text-xs font-semibold text-foreground">
                        {fmt(r.summary.score)} / {fmt(r.summary.max_score)} ({fmt(r.summary.percent)}%)
                      </div>
                    )}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
