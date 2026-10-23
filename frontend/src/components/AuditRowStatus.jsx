import { Badge } from '@/components/ui/badge';
import { stageBadgeClass } from '@/lib/statuses';
import { isOverdue } from '@/lib/auditRows';

// Status of an audit row: a stage-coloured badge, plus "Overdue" for scheduled
// audits dated before today.
export default function AuditRowStatus({ row }) {
  const overdue = isOverdue(row);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge className={stageBadgeClass(row.stage)}>{row.status}</Badge>
      {overdue && <Badge variant="destructive">Overdue</Badge>}
    </span>
  );
}
