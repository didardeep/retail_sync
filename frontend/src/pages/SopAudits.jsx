import { loadSession } from '@/api/client';
import AuditorAudit from '@/components/audit/AuditorAudit';
import ManagerAudits from '@/components/audit/ManagerAudits';

// The Audit page. Auditors get the start/resume experience; managers and
// store managers get the list of submitted audits.
export default function SopAudits() {
  const role = loadSession()?.user?.role;
  return role === 'AUDITOR' ? <AuditorAudit /> : <ManagerAudits />;
}
