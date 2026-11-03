import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Check, MessageCircleQuestion } from 'lucide-react';

import { api, loadSession } from '@/api/client';
import { issuesLink } from '@/lib/links';
import { REVIEW_FILTERS, reviewFilter, reviewProgress } from '@/lib/auditReview';
import { cn, fieldClass, labelClass } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EvidenceList } from '@/components/Evidence';
import { ErrorNote, Loading } from '@/components/Loader';
import { useToast } from '@/components/Toast';
import AnnexurePanel from '@/components/AnnexurePanel';

const ANSWER_CLASS = {
  Yes: 'bg-emerald-50 text-emerald-700',
  No: 'bg-red-50 text-red-800',
};
const REVIEW_BADGE = {
  approved: ['Approved', 'bg-emerald-50 text-emerald-700'],
  query: ['Waiting for auditor', 'bg-amber-50 text-amber-800'],
  replied: ['Auditor replied', 'bg-blue-50 text-blue-800'],
};

function QuestionCard({ row, canReview, busy, onDecide }) {
  const navigate = useNavigate();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const badge = REVIEW_BADGE[row.review_status];

  async function ask() {
    if (await onDecide(row, 'query', note)) { setAsking(false); setNote(''); }
  }

  return (
    <div className="rounded-[10px] border border-border bg-card p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">{row.process}</span>
        <span className="flex flex-wrap gap-1.5">
          {row.is_critical && <Badge className="bg-red-50 text-red-800">Critical</Badge>}
          {row.risk && row.risk !== 'None' && <Badge className="bg-muted text-foreground/80">Risk: {row.risk}</Badge>}
          {badge && <Badge className={badge[1]}>{badge[0]}</Badge>}
        </span>
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[13.5px] font-semibold leading-snug text-foreground">{row.question_text}</div>
        <Badge className={cn('shrink-0', ANSWER_CLASS[row.answer] || 'bg-muted text-muted-foreground')}>{row.answer || 'Not answered'}</Badge>
      </div>
      {row.remarks && <div className="mt-2 text-[12.5px] text-foreground/80"><span className="text-muted-foreground">Auditor remarks: </span>{row.remarks}</div>}
      <div className="mt-3">
        <div className={labelClass}>Evidence</div>
        {row.evidence?.length ? <EvidenceList items={row.evidence} /> : <div className="text-xs text-muted-foreground">None uploaded</div>}
      </div>
      {row.issue_id && (
        <button type="button" className="mt-2 text-xs font-medium text-primary hover:underline" onClick={() => navigate(issuesLink({ id: row.issue_id }))}>
          Issue {row.issue_id} raised for {row.issue_assignee || 'an assignee'}
        </button>
      )}
      {row.review_note && (
        <div className="mt-3 rounded-md bg-muted/50 p-2.5 text-[12.5px]">
          <div><span className="text-muted-foreground">{row.reviewed_by || 'Audit manager'} asked: </span>{row.review_note}</div>
          {row.review_reply && <div className="mt-1"><span className="text-muted-foreground">Auditor replied: </span>{row.review_reply}</div>}
        </div>
      )}
      {canReview && row.review_status !== 'approved' && (
        <div className="mt-3 border-t border-border pt-3">
          {asking ? (
            <>
              <label className={labelClass} htmlFor={`ask-${row.id}`}>Your question for the auditor</label>
              <textarea id={`ask-${row.id}`} className={cn(fieldClass, 'min-h-[64px] resize-y')} value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="mt-2 flex justify-end gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setAsking(false)}>Cancel</Button>
                <Button size="sm" disabled={busy} onClick={ask}>Send question</Button>
              </div>
            </>
          ) : (
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setAsking(true)}><MessageCircleQuestion /> Ask a question</Button>
              <Button size="sm" disabled={busy || row.review_status === 'query'} onClick={() => onDecide(row, 'approve')}><Check /> Approve</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// The audit manager's page for one audit: every question with its answer and
// evidence, approved or queried one at a time. The audit is approved with its last question.
export default function AuditApproval() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const role = loadSession()?.user?.role;
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const allowed = role === 'ADMIN' || role === 'AUDIT_MANAGER';

  useEffect(() => {
    if (allowed) api.audit(id).then(setAudit).catch(setError);
  }, [id, allowed]);

  const responses = useMemo(() => audit?.responses || [], [audit]);
  const shown = useMemo(() => reviewFilter(responses, filter), [responses, filter]);

  if (!allowed) return <Navigate to={`/audits/${id}`} replace />;
  if (error) return <ErrorNote error={error} />;
  if (!audit) return <Loading what="audit" />;

  const progress = reviewProgress(responses);
  const canReview = audit.status === 'Completed';

  async function decide(row, decision, note = '') {
    setBusy(true);
    try {
      const updated = await api.reviewResponse(audit.id, row.id, { decision, note });
      setAudit(updated);
      if (updated.status === 'Approved') toast('Every question is approved, so the audit is approved');
      return true;
    } catch (e) {
      toast.error(e.message || 'Could not save the review');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Audit Reference</div>
          <h2 className="text-xl font-bold text-foreground">{audit.id} - {audit.store || audit.store_id}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Auditor: {audit.auditor || 'Unassigned'}{audit.score != null ? ` • Score ${audit.score}%` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={audit.status === 'Approved' ? 'bg-emerald-600 text-white' : 'bg-muted text-foreground'}>{audit.status === 'Completed' ? 'Awaiting review' : audit.status}</Badge>
          <Button size="sm" variant="outline" onClick={() => navigate('/audits')}>Back to audits</Button>
        </div>
      </div>

      {!canReview && audit.status !== 'Approved' && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Questions can be reviewed once the auditor submits this audit.</div>
      )}

      <div className="mb-3 rounded-[10px] border border-border bg-card p-4">
        <div className="mb-1 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
          <span>{progress.approved} of {progress.total} questions approved</span>
          <span>{progress.pending} to review • {progress.queried} waiting for the auditor</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${progress.percent}%` }} /></div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter questions">
        {REVIEW_FILTERS.map((f) => (
          <Button key={f.value} size="sm" variant={filter === f.value ? 'default' : 'outline'} onClick={() => setFilter(f.value)}>
            {f.label} ({reviewFilter(responses, f.value).length})
          </Button>
        ))}
      </div>

      <div className="mb-4 grid gap-3">
        {shown.map((row) => <QuestionCard key={row.id} row={row} canReview={canReview} busy={busy} onDecide={decide} />)}
        {!shown.length && <div className="rounded-[10px] border border-border bg-card p-8 text-center text-xs text-muted-foreground">No questions here</div>}
      </div>

      <AnnexurePanel auditId={audit.id} />
    </div>
  );
}
