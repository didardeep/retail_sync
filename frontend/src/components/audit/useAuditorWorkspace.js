import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { listChecklists, startChecklistAudit } from '@/api/auditorApi';
import { useToast } from '@/components/Toast';
import { sopAuditReviewLink, sopAuditRunLink } from '@/lib/links';
import { isAuditorEditable } from '@/lib/statuses';
import {
  createAudit, currentUserId, findDraft, getBundle, getStores, getTemplates,
  hydrateFromServer, listLocalAudits, refreshReferenceData, summarize, useOnline,
  useSyncState,
} from '@/lib/offline';
import { syncAssigned } from '@/lib/offline/sync';
import { classicAuditLink, rowAction } from './auditHelpers';

// Everything an auditor needs on the Audit page besides the server lists:
// the on-device copy (stores, templates, SOP drafts with progress), the
// checklists, and the start / resume / open actions. Offline-safe: scored
// audits start from the device copy. Used by pages/AuditStatus.jsx.
export default function useAuditorWorkspace() {
  const navigate = useNavigate();
  const toast = useToast();
  const online = useOnline();
  const sync = useSyncState();
  const userId = currentUserId();

  const [stores, setStores] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [local, setLocal] = useState([]);
  const [localProgress, setLocalProgress] = useState({});
  const [checklists, setChecklists] = useState([]);
  const [checklistsFailed, setChecklistsFailed] = useState(false);
  const [openingKey, setOpeningKey] = useState(null);

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

  const loadChecklists = useCallback(async () => {
    try {
      setChecklists(await listChecklists());
      setChecklistsFailed(false);
    } catch {
      setChecklistsFailed(true);
    }
  }, []);

  // Online start-up: refresh reference data, pull newly assigned audits onto
  // the device, then re-read the device copy and the checklists.
  const prepare = useCallback(async () => {
    await refreshReferenceData().catch(() => {});
    await syncAssigned().catch(() => {});
    await loadLocal().catch(() => {});
    await loadChecklists();
  }, [loadLocal, loadChecklists]);

  // Make sure the audit is on this device (assigned audits start on the server).
  async function ensureLocal(id) {
    if (local.some((a) => a.id === id)) return;
    if (!navigator.onLine) {
      throw new Error('Connect to the internet once to download this audit.');
    }
    await hydrateFromServer(id);
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

  async function openRowNow(row) {
    if (row.kind === 'legacy') {
      navigate(classicAuditLink(row.id));
    } else if (rowAction(row, userId) !== 'view') {
      await ensureLocal(row.id);
      navigate(sopAuditRunLink(row.id));
    } else {
      navigate(sopAuditReviewLink(row.id));
    }
  }

  const openRow = (row) => guarded(row.key, () => openRowNow(row));

  // One option of the per-store panel: open the existing audit, resume a
  // draft or create a new one.
  const runOption = (o, storeId) => guarded(o.key, async () => {
    if (o.row) {
      await openRowNow(o.row);
      return;
    }
    if (o.kind === 'sop') {
      const store = stores.find((s) => s.id === storeId);
      const template = templates.find((t) => t.id === o.ref_id)
        || templates.find((t) => t.code === o.ref_id);
      if (!store || !template) throw new Error('This audit is not available on this device yet.');
      const draft = await findDraft(store.id, template.code);
      const audit = draft || await createAudit(store, template);
      navigate(sopAuditRunLink(audit.id));
      return;
    }
    const audit = await startChecklistAudit(storeId, o.ref_id);
    navigate(classicAuditLink(audit.id));
  });

  return {
    online, sync, userId, stores, templates, local, localProgress, checklists,
    checklistsFailed, openingKey, loadLocal, prepare, openRow, runOption,
  };
}
