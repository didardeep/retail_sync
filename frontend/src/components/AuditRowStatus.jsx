import { Badge } from '@/components/ui/badge';
import { stageBadgeClass, stageLabel } from '@/lib/statuses';
import { isOverdue } from '@/lib/auditRows';

// Status of an audit row in the same words as the filters. Past its end date a
// scheduled or running audit says so in one red badge.
export default function AuditRowStatus({ row }) {
  if (isOverdue(row)) return <Badge variant="destructive">{stageLabel(row.stage)} but overdue</Badge>;
  return <Badge className={stageBadgeClass(row.stage)}>{stageLabel(row.stage)}</Badge>;
}
