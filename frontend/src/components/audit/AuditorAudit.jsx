import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '@/api/client';
import { listChecklists, startChecklistAudit } from '@/api/auditorApi';
import { useToast } from '@/components/Toast';
import { Loading } from '@/components/Loader';
import SyncChip from '@/components/SyncChip';
import { mergeRows } from '@/lib/auditRows';
import { auditOptions, storeSummaries } from '@/lib/auditorStats';
import { sopAuditReviewLink, sopAuditRunLink } from '@/lib/links';
import { isAuditorEditable } from '@/lib/statuses';
import { useUrlFilters } from '@/lib/useUrlFilters';
import {
  createAudit, currentUserId, findDraft, getBundle, getStores, getTemplates,
  hydrateFromServer, listLocalAudits, refreshReferenceData, summarize, useOnline,
  useSyncState,
} from '@/lib/offline';
import { syncAssigned } from '@/lib/offline/sync';
import MyAuditsList from './MyAuditsList';
import ScheduledForYou from './ScheduledForYou';
import StoreOptionsPanel from './StoreOptionsPanel';
import { StoreFilters, StoreRow } from './StoreList';
import {
  attachExtras, classicAuditLink, filterStoreSummaries, isMine, mergeSopSources,
  normalizeStatus, normalizeView, regionList, scheduledForYou, statusMatches,
} from './auditHelpers';

// `store` selects a store (and filters My audits), `view` is the store chip
// (old value `assigned` = Scheduled), `status` and `tool` filter My audits.
const FILTER_KEYS = ['store', 'tool', 'status', 'view'];

// The auditor's Audit page: what is scheduled, which stores to visit and
// what has been done. SOP parts work offline from the on-device copy.
export default function AuditorAudit() {
  const navigate = useNavigate();
  const toast = useToast();
  const online = useOnline();
  const sync = useSyncState();
  const { filters, setFilter, toggle } = useUrlFilters(FILTER_KEYS);
  const userId = currentUserId();

  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [local, setLocal] = useState([]);
  const [localProgress, setLocalProgress] = useState({});
  const [remoteSop, setRemoteSop] = useState(null);
  const [remoteLegacy, setRemoteLegacy] = useState(null);
  const [remoteError, setRemoteError] = useState(null);
  const [checklists, setChecklists] = useState([]);
  const [checklistsFailed, setChecklistsFailed] = useState(false);
  const [openingKey, setOpeningKey] = useState(null);
  const [q, setQ] = useState('');
  const [region, setRegion] = useState('');

  const view = normalizeView(filters.view);

  const loadLocal = useCallback(async () => {
    const [st, tp, la] = await Promise.all([getStores(), getTemplates(), listLocalAudits()]);
    const progress = {};
    await Promise.all(la.filter((a) => isAuditorEditable(a.status)).map(async (a) => {
      try {
        const bundle = await getBundle(a.id);
        if (bundle) {
          const s = summarize(bundle.template, bundle.rows);
          progress[a.id] = { answered: s.answered, total: s.applicable };
        }
      } catch {
        // template not cached yet: no progress shown for this draft
      }
    }));
    setStores(st);
    setTemplates(tp);
    setLocal(la);
    setLocalProgress(progress);
  }, []);

  const loadRemote = useCallback(async () => {
    const [legacy, sop] = await Promise.allSettled([api.audits(), api.sopAudits()]);
    if (legacy.status === 'fulfilled') setRemoteLegacy(legacy.value);
    if (sop.status === 'fulfilled') setRemoteSop(sop.value);
    const failed = [legacy, sop].find((x) => x.status === 'rejected');
    setRemoteError(failed ? failed.reason : null);
  }, []);

  const loadChecklists = useCallback(async () => {
    try {
      setChecklists(await listChecklists());
      setChecklistsFailed(false);
    } catch {
      setChecklistsFailed(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      await loadLocal().catch(() => {});
      if (!cancelled) setLoading(false); // show cached data immediately
      if (navigator.onLine) {
        await refreshReferenceData().catch(() => {});
        await syncAssigned().catch(() => {}); // pulls newly assigned audits onto the device
        await loadLocal().catch(() => {});
        await Promise.all([loadRemote(), loadChecklists()]);
      }
      if (!cancelled) setLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, [loadLocal, loadRemote, loadChecklists]);

  // Re-read after each sync pass so statuses flip to Submitted etc.
  useEffect(() => {
    loadLocal().catch(() => {});
    if (online) loadRemote();
  }, [sync.lastSync, sync.pending]); // eslint-disable-line react-hooks/exhaustive-deps

  const sopRaw = useMemo(
    () => mergeSopSources(local, remoteSop, localProgress),
    [local, remoteSop, localProgress],
  );
  const myRows = useMemo(
    () => attachExtras(mergeRows(remoteLegacy || [], sopRaw), sopRaw, remoteLegacy || [])
      .filter((r) => isMine(r, userId)),
    [remoteLegacy, sopRaw, userId],
  );

  const scheduled = useMemo(() => scheduledForYou(myRows), [myRows]);
  const summaries = useMemo(() => storeSummaries(stores, myRows), [stores, myRows]);
  const regions = useMemo(() => regionList(summaries), [summaries]);
  const visibleStores = useMemo(
    () => filterStoreSummaries(summaries, { q, region, view }),
    [summaries, q, region, view],
  );
  const selected = summaries.find((s) => s.store_id === filters.store) || null;
  const options = useMemo(
    () => (selected ? auditOptions(selected.store_id, myRows, templates, checklists) : []),
    [selected, myRows, templates, checklists],
  );

  const history = myRows.filter((r) =>
    (!filters.store || r.store_id === filters.store)
    && (!filters.tool || r.tool_code === filters.tool)
    && statusMatches(r, filters.status));

  // Make sure the audit is on this device (assigned audits start on the server).
  async function ensureLocal(id) {
    if (local.some((a) => a.id === id)) return;
    if (!navigator.onLine) {
      throw new Error('Connect to the internet once to download this audit.');
    }
    await hydrateFromServer(id);
  }

  async function openRowNow(row) {
    if (row.kind === 'legacy') {
      navigate(classicAuditLink(row.id));
    } else if (isAuditorEditable(row.status) && isMine(row, userId)) {
      await ensureLocal(row.id);
      navigate(sopAuditRunLink(row.id));
    } else {
      navigate(sopAuditReviewLink(row.id));
    }
  }

  async function guarded(key, fn) {
    setOpeningKey(key);
    try {
      await fn();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setOpeningKey(null);
    }
  }

  const openRow = (row) => guarded(row.key, () => openRowNow(row));

  const runOption = (o) => guarded(o.key, async () => {
    if (o.row) {
      await openRowNow(o.row);
      return;
    }
    if (o.kind === 'sop') {
      const store = stores.find((s) => s.id === filters.store);
      const template = templates.find((t) => t.id === o.ref_id)
        || templates.find((t) => t.code === o.ref_id);
      if (!store || !template) throw new Error('This audit is not available on this device yet.');
      const draft = await findDraft(store.id, template.code);
      const audit = draft || await createAudit(store, template);
      navigate(sopAuditRunLink(audit.id));
      return;
    }
    const audit = await startChecklistAudit(filters.store, o.ref_id);
    navigate(classicAuditLink(audit.id));
  });

  if (loading) return <Loading what="audits" />;

  const checklistNote = (checklistsFailed || (!online && checklists.length === 0))
    ? 'Checklist audits could not be loaded, so only scored audits are shown.'
    : null;
  const panel = selected && (
    <StoreOptionsPanel
      store={selected}
      options={options}
      openingKey={openingKey}
      checklistNote={checklistNote}
      onAction={runOption}
      onClose={() => setFilter('store', '')}
    />
  );

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="text-[15px] font-bold text-foreground">Audit</div>
        <SyncChip />
      </div>

      {remoteError && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {online
            ? `Some audits could not be loaded: ${remoteError.message}`
            : 'You are offline. Showing the audits saved on this device.'}
        </div>
      )}

      <ScheduledForYou rows={scheduled} openingKey={openingKey} onOpen={openRow} />

      <section className="mb-5" aria-label="Stores">
        <div className="mb-2 text-sm font-semibold text-foreground">Stores</div>
        <StoreFilters
          q={q}
          onQ={setQ}
          region={region}
          onRegion={setRegion}
          regions={regions}
          view={view}
          onView={(v) => setFilter('view', v)}
        />
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
          {visibleStores.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {stores.length === 0 && !online
                ? 'Connect to the internet once to download your stores.'
                : 'No stores match.'}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
              {visibleStores.map((s, i) => (
                <div key={s.store_id}>
                  <StoreRow
                    summary={s}
                    first={i === 0}
                    selected={s.store_id === filters.store}
                    onSelect={(id) => toggle('store', id)}
                  />
                  {s.store_id === filters.store && (
                    <div className="border-t border-border bg-muted/30 p-3 lg:hidden">{panel}</div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="hidden lg:sticky lg:top-4 lg:block">
            {panel || (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Select a store to see its audits.
              </div>
            )}
          </div>
        </div>
      </section>

      <MyAuditsList
        rows={history}
        stores={stores}
        store={filters.store}
        onStore={(v) => setFilter('store', v)}
        status={normalizeStatus(filters.status)}
        onStatus={(v) => setFilter('status', v)}
        openingKey={openingKey}
        onOpen={openRow}
      />
    </div>
  );
}
