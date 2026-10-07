import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { api, loadSession } from '@/api/client';
import { isAuditorEditable } from '@/lib/classicAudit';
import { ErrorNote, Loading } from '@/components/Loader';
import AuditExecution from '@/pages/AuditExecution';
import ClassicAuditWizard from '@/pages/ClassicAuditWizard';

// The audit page for /audits/:id. The owning auditor of an open audit gets the
// one-question-per-screen wizard; everyone else keeps the read-only view.
export default function AuditRoute() {
  const { id } = useParams();
  const user = loadSession()?.user;
  const isAuditor = user?.role === 'AUDITOR';
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isAuditor) return undefined;
    let cancelled = false;
    setAudit(null);
    api.audit(id)
      .then((a) => { if (!cancelled) setAudit(a); })
      .catch((e) => { if (!cancelled) setError(e); });
    return () => { cancelled = true; };
  }, [id, isAuditor]);

  if (!isAuditor) return <AuditExecution readOnly />;
  if (error) return <ErrorNote error={error} />;
  if (!audit) return <Loading what="audit" />;
  if (!isAuditorEditable(audit, user)) return <AuditExecution readOnly />;
  return <ClassicAuditWizard key={id} initialAudit={audit} />;
}
