import { Badge } from '@/components/ui/badge';
import SopStatusBadge from '@/components/SopStatusBadge';
import { stageBadgeClass } from '@/lib/statuses';
import { isOverdue } from '@/lib/auditRows';

// Status of a merged audit row: the SOP badge for SOP audits, a stage-coloured
// badge for classic ones, plus "Overdue" for scheduled audits dated before today.
// On-device SOP drafts can also carry submit_pending / sync_error (auditor only).
export default function AuditRowStatus({ row }) {
  const overdue = isOverdue(row);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {row.kind === 'sop'
        ? (
          <SopStatusBadge
            status={row.status}
            version={row.version}
            submitPending={row.submit_pending}
            syncError={row.sync_error}
          />
        )
        : <Badge className={stageBadgeClass(row.stage)}>{row.status}</Badge>}
      {overdue && <Badge variant="destructive">Overdue</Badge>}
    </span>
  );
}
