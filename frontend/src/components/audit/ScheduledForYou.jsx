import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isOverdue } from '@/lib/auditRows';
import AuditTypeChip from './AuditTypeChip';

// Scoped to the browser's local zone on purpose: scheduled times carry no zone.
function whenScheduled(iso) {
  if (!iso) return 'No date';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'No date';
  return d.toLocaleString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

// Top section: audits a manager scheduled for this auditor (both kinds).
export default function ScheduledForYou({ rows, openingKey, onOpen }) {
  return (
    <section className="mb-5" aria-label="Scheduled for you">
      <div className="mb-2 text-sm font-semibold text-foreground">Scheduled for you</div>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
          Nothing is scheduled for you right now.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
          {rows.map((r, i) => {
            const overdue = isOverdue(r);
            return (
              <div
                key={r.key}
                className={cn(
                  'flex items-center gap-3 px-4 py-3',
                  i > 0 && 'border-t border-border',
                  overdue && 'bg-red-50',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">{r.store || 'Unknown store'}</div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <AuditTypeChip label={r.kind === 'sop' ? 'Scored' : 'Checklist'} />
                    <span className="truncate text-xs text-muted-foreground">{r.tool}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className={overdue ? 'font-semibold text-destructive' : 'text-foreground/80'}>
                      {whenScheduled(r.date)}
                    </span>
                    {overdue && <Badge variant="destructive">Overdue</Badge>}
                    {r.sync_error && <span className="text-destructive">{r.sync_error}</span>}
                  </div>
                  {r.notes && <div className="mt-0.5 truncate text-xs text-muted-foreground">{r.notes}</div>}
                </div>
                <Button
                  size="sm"
                  className="h-10 shrink-0"
                  disabled={openingKey === r.key}
                  onClick={() => onOpen(r)}
                >
                  Start
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
