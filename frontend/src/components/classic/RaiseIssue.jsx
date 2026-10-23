import { useEffect, useState } from 'react';
import { Flag } from 'lucide-react';

import { api } from '@/api/client';
import { cn, fieldClass, labelClass } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/Toast';

const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

// The auditor's own choice, per question, to follow an answer up with an issue.
// The assignee can only be an auditee linked to this audit's store. Nothing is
// raised unless the auditor presses "Raise issue".
export default function RaiseIssue({ audit, question, disabled, onRaised }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [auditees, setAuditees] = useState(null);
  const [assignee, setAssignee] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [busy, setBusy] = useState(false);

  // Load the store's auditees the first time the form opens.
  useEffect(() => {
    if (!open || auditees !== null) return;
    api.storeAuditees(audit.store_id)
      .then((list) => setAuditees(list || []))
      .catch(() => setAuditees([]));
  }, [open, auditees, audit.store_id]);

  // A different question starts closed.
  useEffect(() => { setOpen(false); setAssignee(''); }, [question.id]);

  if (!question.answer) return null;

  if (question.issue_id) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-muted/40 p-2.5 text-sm text-foreground">
        <Flag className="size-4 shrink-0 text-primary" />
        Issue raised for {question.issue_assignee || 'an auditee'}
      </div>
    );
  }

  async function submit() {
    if (!assignee) { toast.error('Pick who the issue goes to'); return; }
    setBusy(true);
    try {
      const issue = await api.raiseIssue(audit.id, question.id, { assignee_id: assignee, priority });
      onRaised(question.id, issue);
      setOpen(false);
      toast('Issue raised');
    } catch (e) {
      toast.error(e.message || 'Could not raise the issue');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-3">
        <Button type="button" variant="outline" className="h-10" onClick={() => setOpen(true)} disabled={disabled}>
          <Flag /> Raise issue
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
      <div className="mb-2 text-sm font-semibold text-foreground">Raise an issue for this question</div>
      {auditees === null ? (
        <div className="text-xs text-muted-foreground">Loading the store's auditees...</div>
      ) : auditees.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          No auditee is linked to {audit.store}. Ask an admin to link one before raising an issue.
        </div>
      ) : (
        <div className="grid gap-3">
          <div>
            <label className={labelClass} htmlFor="raise-assignee">Assign to</label>
            <select id="raise-assignee" className={cn(fieldClass, 'h-11')} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Select an auditee</option>
              {auditees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="raise-priority">Priority</label>
            <select id="raise-priority" className={cn(fieldClass, 'h-11')} value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <Button type="button" variant="outline" className="h-10 flex-1" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
        <Button type="button" className="h-10 flex-1" onClick={submit} disabled={busy || !auditees?.length}>Raise issue</Button>
      </div>
    </div>
  );
}
