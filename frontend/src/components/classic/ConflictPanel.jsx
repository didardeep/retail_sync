import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { orderedQuestions } from '@/lib/classicAudit';

// The server refused this device's offline changes (the audit was submitted or
// closed meanwhile). Nothing is overwritten: the answers stay on this device,
// listed here, until the auditor dismisses the message.
export default function ConflictPanel({ audit, message, onDismiss, busy }) {
  const answered = orderedQuestions(audit).filter((q) => q.answer);
  return (
    <div className="mx-auto max-w-2xl">
      <div role="alert" className="mb-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div>
          <div className="font-semibold">Sync conflict - {audit.store} ({audit.id})</div>
          <div className="mt-0.5">{message}</div>
        </div>
      </div>
      <div className="mb-4 overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="bg-muted px-4 py-2.5 text-[13px] font-bold text-foreground">
          Your answers on this device ({answered.length})
        </div>
        {answered.map((q) => (
          <div key={q.id} className="flex items-start justify-between gap-3 border-t border-border px-4 py-3">
            <div className="text-[13px] leading-snug text-foreground">
              {q.question_text}
              {q.remarks && <div className="mt-0.5 text-xs text-muted-foreground">{q.remarks}</div>}
            </div>
            <div className="shrink-0 text-sm font-bold">{q.answer}</div>
          </div>
        ))}
      </div>
      <Button className="h-11 w-full" disabled={busy} onClick={onDismiss}>
        Dismiss and discard my offline changes
      </Button>
    </div>
  );
}
