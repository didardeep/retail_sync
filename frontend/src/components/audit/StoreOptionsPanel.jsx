import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import AuditTypeChip from './AuditTypeChip';
import { ACTION_LABELS, optionStateLine, percentOf } from './auditHelpers';

// A submitted audit can only be viewed, whatever action the option carries.
const isView = (o) => o.action === 'view' || o.state === 'submitted';

// What the auditor can do at one store: start, resume or view each audit.
export default function StoreOptionsPanel({
  store, options, openingKey, checklistNote, onAction, onClose,
}) {
  return (
    <div className="rounded-lg border bg-card shadow-sm" aria-label={`Audits for ${store.name}`}>
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-foreground">{store.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {[store.city, store.region].filter(Boolean).join(' - ') || 'Choose an audit'}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
        >
          <X className="size-4" />
        </button>
      </div>

      {checklistNote && (
        <div className="border-b border-border bg-amber-50 px-4 py-2 text-xs text-amber-900">
          {checklistNote}
        </div>
      )}

      {options.length === 0 ? (
        <div className="p-5 text-center text-sm text-muted-foreground">
          No audits are available for this store yet.
        </div>
      ) : (
        <div>
          {options.map((o, i) => {
            const pct = o.state === 'in_progress' ? percentOf(o.progress) : null;
            return (
              <div
                key={o.key}
                className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <AuditTypeChip label={o.type_label} />
                    <span className="truncate text-sm font-semibold text-foreground">{o.name}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{optionStateLine(o)}</div>
                  {pct !== null && (
                    <div
                      className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={pct}
                    >
                      <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant={isView(o) ? 'outline' : 'default'}
                    className="h-10"
                    disabled={openingKey === o.key}
                    onClick={() => onAction(o)}
                  >
                    {isView(o) ? ACTION_LABELS.view : (ACTION_LABELS[o.action] || 'Open')}
                  </Button>
                  {isView(o) && (
                    <Button
                      size="sm"
                      className="h-10"
                      disabled={openingKey === o.key}
                      onClick={() => onAction({ ...o, state: 'not_started', action: 'start', row: null })}
                    >
                      New audit
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
