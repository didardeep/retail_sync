import { Badge } from '@/components/ui/badge';
import { stageBadgeClass, stageOf } from '@/lib/statuses';

// One badge for every SOP audit status, used by the list and the review screen.
export default function SopStatusBadge({ status, submitPending, syncError, version }) {
  const suffix = version > 1 ? <span className="ml-1 text-[10px] font-normal opacity-80">v{version}</span> : null;

  let badge;
  if (syncError) {
    badge = <Badge variant="destructive">Needs attention</Badge>;
  } else if (status === 'Draft') {
    badge = <Badge variant="secondary">Draft</Badge>;
  } else if (status === 'Planned') {
    badge = <Badge variant="outline">Assigned</Badge>;
  } else if (status === 'Submitted' && submitPending) {
    badge = <Badge className={stageBadgeClass('in_progress')}>Submitted - pending sync</Badge>;
  } else if (status === 'Returned') {
    badge = <Badge className={stageBadgeClass('in_progress')}>Returned</Badge>;
  } else if (status === 'Cancelled') {
    badge = <Badge className={stageBadgeClass('cancelled')}>Cancelled</Badge>;
  } else {
    // Submitted and Approved
    badge = <Badge className={stageBadgeClass(stageOf('sop', status))}>{status}</Badge>;
  }

  return suffix ? <span className="inline-flex items-center">{badge}{suffix}</span> : badge;
}
