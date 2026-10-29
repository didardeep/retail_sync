import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { loadSession } from '@/api/client';
import { isAuditorEditable } from '@/lib/classicAudit';
import { ErrorNote, Loading } from '@/components/Loader';
import ConflictPanel from '@/components/classic/ConflictPanel';
import { dismissConflict, loadAudit } from '@/lib/offlineSync';
import AuditExecution from '@/pages/AuditExecution';
import ClassicAuditWizard from '@/pages/ClassicAuditWizard';

// The audit page for /audits/:id. The owning auditor of an open audit gets the
// one-question-per-screen wizard (also offline, from the copy on this device);
// everyone else keeps the read-only view.
export default function AuditRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = loadSession()?.user;
  const isAuditor = user?.role === 'AUDITOR';
  const [audit, setAudit] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isAuditor) return undefined;
    let cancelled = false;
    setAudit(null);
    setConflict(null);
    loadAudit(id)
      .then((r) => {
        if (cancelled) return;
        setAudit(r.audit);
        setConflict(r.conflict);
      })
      .catch((e) => { if (!cancelled) setError(e); });
    return () => { cancelled = true; };
  }, [id, isAuditor]);

  if (!isAuditor) return <AuditExecution readOnly />;
  if (error) return <ErrorNote error={error} />;
  if (!audit) return <Loading what="audit" />;
  if (conflict) {
    const dismiss = async () => {
      await dismissConflict(id);
      navigate(0);
    };
    return <ConflictPanel audit={audit} message={conflict} onDismiss={dismiss} />;
  }
  if (!isAuditorEditable(audit, user)) return <AuditExecution readOnly />;
  return <ClassicAuditWizard key={id} initialAudit={audit} />;
}
