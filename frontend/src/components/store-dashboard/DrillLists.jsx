import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDate, scoreLabel } from '@/lib/auditRows';
import { issuesLink } from '@/lib/links';
import { stageBadgeClass } from '@/lib/statuses';
import { auditPath } from '@/lib/storeStats';
import { prC, sColor, stC } from '@/utils/helpers';

const ROW = 'block border-b border-border py-2.5 last:border-0 hover:bg-accent/40 focus-visible:outline-none focus-visible:bg-accent/40';

// Audit rows (from lib/auditRows mergeRows), each linking to the audit.
export function AuditList({ rows, onNavigate }) {
  if (!rows.length) return null;
  return rows.map((r) => (
    <Link key={r.key} to={auditPath(r)} onClick={onNavigate} className={ROW}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0 truncate text-[12.5px] font-semibold text-foreground">{r.tool}</div>
        {typeof r.percent === 'number' && (
          <span className="shrink-0 text-[11px] font-bold" style={{ color: sColor(r.percent) }}>{scoreLabel(r)}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className={stageBadgeClass(r.stage)}>{r.status}</Badge>
        <span className="text-[11px] text-muted-foreground">{formatDate(r.date)}</span>
        <span className="text-[11px] text-muted-foreground">{r.auditor || 'Unassigned'}</span>
      </div>
    </Link>
  ));
}

// Issue records, each linking to the issue.
export function IssueList({ issues, onNavigate }) {
  if (!issues.length) return null;
  return issues.map((i) => (
    <Link key={i.id} to={issuesLink({ id: i.id })} onClick={onNavigate} className={ROW}>
      <div className="mb-1 text-[12.5px] font-semibold text-foreground">{i.title}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className={cn(prC(i.priority))}>{i.priority || 'Unrated'}</Badge>
        <Badge className={cn(stC(i.status))}>{i.status}</Badge>
        {i.overdue === true && <span className="text-[11px] font-semibold text-destructive">Overdue</span>}
      </div>
    </Link>
  ));
}
