import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api, loadSession } from '@/api/client';
import { listChecklists, startChecklistAudit } from '@/api/auditorApi';
import { useToast } from '@/components/Toast';
import { useOnline } from '@/lib/useOnline';
import { auditLink } from './auditHelpers';

// Everything an auditor needs on the Audit page besides the audit list:
// the store list, the checklists, and the start / resume / open actions.
// Used by pages/Audit.jsx.
export default function useAuditorWorkspace() {
  const navigate = useNavigate();
  const toast = useToast();
  const online = useOnline();
  const userId = loadSession()?.user?.id || null;

  const [stores, setStores] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [checklistsFailed, setChecklistsFailed] = useState(false);
  const [openingKey, setOpeningKey] = useState(null);

  const prepare = useCallback(async () => {
    try {
      const [st, cl] = await Promise.all([api.stores(), listChecklists()]);
      setStores(st || []);
      setChecklists(cl || []);
      setChecklistsFailed(false);
    } catch {
      setChecklistsFailed(true);
    }
  }, []);

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

  const openRow = (row) => guarded(row.key, async () => navigate(auditLink(row.id)));

  // One option of the per-store panel: open the existing audit, resume a
  // draft or start a new one.
  const runOption = (o, storeId) => guarded(o.key, async () => {
    if (o.row) {
      navigate(auditLink(o.row.id));
      return;
    }
    const audit = await startChecklistAudit(storeId, o.ref_id);
    navigate(auditLink(audit.id));
  });

  return {
    online, userId, stores, checklists, checklistsFailed, openingKey,
    prepare, openRow, runOption,
  };
}
