import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import { api, loadSession } from '@/api/client';
import { cn, fieldClass, labelClass } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/Toast';
import { Loading } from '@/components/Loader';
import SopStatusBadge from '@/components/SopStatusBadge';
import SyncChip from '@/components/SyncChip';
import { isAuditorEditable } from '@/lib/statuses';
import {
  createAudit, currentUserId, findDraft, getStores, getTemplates,
  listLocalAudits, refreshReferenceData, useOnline, useSyncState,
} from '@/lib/offline';

const fmt = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

function when(iso) {
  if (!iso) return '';
  return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

// Local (on-device) and server audits merged by id; the local copy wins for
// state because it can be ahead of the server while offline.
function mergeRows(local, remote) {
  const byId = new Map();
  for (const r of remote || []) {
    byId.set(r.id, {
      id: r.id, store_id: r.store_id, store_name: r.store, template_name: r.template,
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
      template_name: a.template_name, status: a.status,
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
  const role = loadSession()?.user?.role;
  const isAuditor = role === 'AUDITOR';

  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [local, setLocal] = useState([]);
  const [remote, setRemote] = useState(null);
  const [remoteError, setRemoteError] = useState(null);
  const [storeId, setStoreId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [starting, setStarting] = useState(false);

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
          await refreshReferenceData().then(loadLocal).catch(() => {});
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
  const shown = rows.filter((r) =>
    (!storeFilter || r.store_id === storeFilter) &&
    (!statusFilter || r.status === statusFilter));
  const existingDraft = local.find(
    (a) => isAuditorEditable(a.status) && a.store_id === storeId && a.template_code === selectedCode,
  );

  async function start() {
    const store = stores.find((s) => s.id === storeId);
    const template = templates.find((t) => t.id === templateId);
    if (!store || !template) return;
    setStarting(true);
    try {
      const draft = await findDraft(store.id, template.code);
      const audit = draft || (await createAudit(store, template));
      navigate(`/sop-audits/${audit.id}`);
    } catch (e) {
      toast.error(e.message);
      setStarting(false);
    }
  }

  function open(row) {
    const mine = row.auditor_id === currentUserId();
    if (isAuditorEditable(row.status) && mine) navigate(`/sop-audits/${row.id}`);
    else navigate(`/sop-audits/${row.id}/review`);
  }

  if (loading) return <Loading what="audits" />;

  const filterStores = isAuditor
    ? stores
    : [...new Map(rows.map((r) => [r.store_id, { id: r.store_id, name: r.store_name }])).values()];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="text-[15px] font-bold text-foreground">SOP Audits</div>
        {isAuditor && <SyncChip />}
      </div>

      {isAuditor && (
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
            {existingDraft ? 'Resume draft' : 'Start audit'}
          </Button>
          {existingDraft && (
            <div className="mt-1.5 text-center text-xs text-muted-foreground">
              You already have a draft for this store and audit.
            </div>
          )}
        </div>
      )}

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="mr-auto text-sm font-semibold text-foreground">
          {isAuditor ? 'My audits' : 'Submitted audits'}
        </div>
        <select className={cn(fieldClass, 'h-10 w-auto min-w-[130px]')} value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)} aria-label="Filter by store">
          <option value="">All stores</option>
          {filterStores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className={cn(fieldClass, 'h-10 w-auto')} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
          <option value="">All status</option>
          <option value="Draft">Draft</option>
          <option value="Submitted">Submitted</option>
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
    </div>
  );
}
