import { useState } from 'react';

import { api, loadSession } from '@/api/client';
import { openQueries } from '@/lib/auditReview';
import { cn, fieldClass } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/Toast';

// Questions the audit manager asked about this audit. The auditor answers here.
export default function ReviewQueries({ audit, onChange }) {
  const toast = useToast();
  const isAuditor = loadSession()?.user?.role === 'AUDITOR';
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(false);
  const queries = openQueries(audit.responses);
  if (!queries.length) return null;

  async function send(row) {
    const note = (drafts[row.id] || '').trim();
    if (!note) { toast.error('Write your reply first'); return; }
    setBusy(true);
    try {
      onChange(await api.replyToReview(audit.id, row.id, note));
      toast('Reply sent');
    } catch (e) {
      toast.error(e.message || 'Could not send the reply');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="bg-amber-50 px-4 py-2.5 text-[13px] font-bold text-amber-900">Questions from the audit manager ({queries.length})</div>
      {queries.map((row) => (
        <div key={row.id} className="border-t border-border px-4 py-3">
          <div className="text-[12px] text-muted-foreground">{row.question_text}</div>
          <div className="mt-1 text-[13px] font-semibold text-foreground">{row.review_note}</div>
          {row.review_reply && <div className="mt-1 text-[12.5px] text-foreground/80">Your reply: {row.review_reply}</div>}
          {isAuditor && row.review_status === 'query' && (
            <div className="mt-2 flex gap-2">
              <textarea
                aria-label="Your reply"
                className={cn(fieldClass, 'min-h-[60px] flex-1 resize-y')}
                value={drafts[row.id] || ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [row.id]: e.target.value }))}
              />
              <Button type="button" disabled={busy} onClick={() => send(row)}>Reply</Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
