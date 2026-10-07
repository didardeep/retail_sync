import { ChevronRight } from 'lucide-react';

import { cn, fieldClass } from '@/lib/utils';
import { STAGES } from '@/lib/statuses';
import { formatDate, scoreLabel } from '@/lib/auditRows';
import AuditRowStatus from '@/components/AuditRowStatus';
import SopStatusBadge from '@/components/SopStatusBadge';
import AuditTypeChip from './AuditTypeChip';
import { percentOf } from './auditHelpers';

function StatusBadge({ row }) {
  if (row.kind === 'sop' && (row.submit_pending || row.sync_error)) {
    return (
      <SopStatusBadge
        status={row.status}
        submitPending={row.submit_pending}
        syncError={row.sync_error}
        version={row.version}
      />
    );
  }
  return <AuditRowStatus row={row} />;
}

// Right-hand figure: percent done for drafts, score for finished audits.
function Figure({ row }) {
  if (row.stage === 'in_progress') {
    const pct = percentOf(row.progress);
    return pct === null ? null : <div className="text-xs font-semibold text-foreground">{pct}% done</div>;
  }
  if (row.stage === 'completed' || row.stage === 'approved') {
    return typeof row.percent === 'number'
      ? <div className="text-xs font-semibold text-foreground">{scoreLabel(row)}</div>
      : null;
  }
  return null;
}

// History of the auditor's own audits, filterable by store and status.
export default function MyAuditsList({
  rows, stores, store, onStore, status, onStatus, openingKey, onOpen,
}) {
  return (
    <section aria-label="My audits">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="mr-auto text-sm font-semibold text-foreground">My audits</div>
        <select
          className={cn(fieldClass, 'h-10 w-auto min-w-[130px]')}
          value={store}
          onChange={(e) => onStore(e.target.value)}
          aria-label="Filter by store"
        >
          <option value="">All stores</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select
          className={cn(fieldClass, 'h-10 w-auto')}
          value={status}
          onChange={(e) => onStatus(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All status</option>
          {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No audits yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
          {rows.map((r, i) => (
            <button
              key={r.key}
              type="button"
              disabled={openingKey === r.key}
              onClick={() => onOpen(r)}
              className={cn('flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent', i > 0 && 'border-t border-border')}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground">{r.store || 'Unknown store'}</div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <AuditTypeChip label={r.kind === 'sop' ? 'Scored' : 'Checklist'} />
                  <span className="truncate text-xs text-muted-foreground">
                    {r.tool} - {formatDate(r.date)}
                  </span>
                </div>
                {r.sync_error && <div className="mt-0.5 truncate text-xs text-destructive">{r.sync_error}</div>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <StatusBadge row={r} />
                <Figure row={r} />
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
