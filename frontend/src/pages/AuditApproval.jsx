import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, CornerUpLeft, Paperclip, XCircle } from 'lucide-react';

import { api, loadSession } from '@/api/client';
import { issuesLink } from '@/lib/links';
import {
  REVIEW_FILTERS, checkDecision, decisionBody, evidenceCount, reviewFilter, reviewProgress,
} from '@/lib/auditReview';
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
  replied: ['Fixed by auditor', 'bg-blue-50 text-blue-800'],
};
// What is wrong with an answer (same values as the API).
const QUERY_CATEGORIES = [
  { value: 'wrong_answer', label: 'Wrong answer' },
  { value: 'missing_evidence', label: 'Missing evidence' },
  { value: 'unclear_photo', label: 'Unclear photo' },
  { value: 'other', label: 'Other' },
];
const categoryLabel = (v) => QUERY_CATEGORIES.find((c) => c.value === v)?.label;
const STATUS_LABEL = { Completed: 'Awaiting review', 'Changes Requested': 'Returned to auditor' };

// One question: its answer, the auditor's remarks and evidence, and a checkbox
// for "check this again" that opens a box for the reason.
function QuestionCard({ number, row, canReview, ticked, note, category, onTick, onNote, onCategory }) {
  const navigate = useNavigate();
  const badge = REVIEW_BADGE[row.review_status];
  const files = row.evidence?.length || 0;

  return (
    <div className={cn('rounded-[10px] border bg-card p-4', ticked ? 'border-primary ring-1 ring-primary/30' : 'border-border')}>
      <div className="flex items-start gap-3">
        {canReview && (
          <input
            type="checkbox"
            checked={ticked}
            onChange={(e) => onTick(row.id, e.target.checked)}
            aria-label={`Check question ${number} again`}
            className="mt-1 size-4 shrink-0 cursor-pointer accent-primary"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Q{number} - {row.process}</span>
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
            <div className={cn(labelClass, 'flex items-center gap-1')}>
              <Paperclip className="size-3" /> Evidence
              <span className="font-normal normal-case text-muted-foreground">
                {files ? `(${files} ${files === 1 ? 'item' : 'items'} attached)` : '(none attached)'}
              </span>
            </div>
            {files > 0 && <EvidenceList items={row.evidence} />}
          </div>

          {row.issue_id && (
            <button type="button" className="mt-2 text-xs font-medium text-primary hover:underline" onClick={() => navigate(issuesLink({ id: row.issue_id }))}>
              Issue {row.issue_id} raised for {row.issue_assignee || 'an assignee'}
            </button>
          )}
          {row.review_note && (
            <div className="mt-3 rounded-md bg-muted/50 p-2.5 text-[12.5px]">
              <div>
                <span className="text-muted-foreground">{row.reviewed_by || 'Audit manager'} flagged: </span>{row.review_note}
                {categoryLabel(row.review_category) && <Badge className="ml-1.5 bg-amber-50 text-amber-800">{categoryLabel(row.review_category)}</Badge>}
              </div>
              {row.review_reply && <div className="mt-1"><span className="text-muted-foreground">Auditor replied: </span>{row.review_reply}</div>}
            </div>
          )}

          {ticked && (
            <div className="mt-3">
              <label className={labelClass} htmlFor={`cat-${row.id}`}>What is wrong</label>
              <select id={`cat-${row.id}`} className={cn(fieldClass, 'mb-2')} value={category} onChange={(e) => onCategory(row.id, e.target.value)}>
                {QUERY_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <label className={labelClass} htmlFor={`why-${row.id}`}>Why should this be checked again? <span className="text-destructive">*</span></label>
              <textarea
                id={`why-${row.id}`}
                className={cn(fieldClass, 'min-h-[64px] resize-y')}
                placeholder="For example: the photo does not show the shelf"
                value={note}
                onChange={(e) => onNote(row.id, e.target.value)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// The audit manager's page for one submitted audit. Tick the questions to check
// again (each with a reason), then approve the audit, return it for fixing, or reject it.
export default function AuditApproval() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const role = loadSession()?.user?.role;
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [ticked, setTicked] = useState({});        // response id -> { note, category }
  const [asking, setAsking] = useState(null);      // 'return' | 'reject' while the overall reason is open
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [auditees, setAuditees] = useState(null);   // the store's auditees, told when an audit is returned
  const allowed = role === 'ADMIN' || role === 'AUDIT_MANAGER';

  useEffect(() => {
    if (allowed) api.audit(id).then(setAudit).catch(setError);
  }, [id, allowed]);

  const storeId = audit?.store_id;
  useEffect(() => {
    if (allowed && storeId) api.storeAuditees(storeId).then(setAuditees).catch(() => setAuditees(null));
  }, [allowed, storeId]);

  const responses = useMemo(() => audit?.responses || [], [audit]);
  const shown = useMemo(() => reviewFilter(responses, filter), [responses, filter]);
  const numbers = useMemo(() => new Map(responses.map((r, i) => [r.id, i + 1])), [responses]);

  if (!allowed) return <Navigate to={`/audits/${id}`} replace />;
  if (error) return <ErrorNote error={error} />;
  if (!audit) return <Loading what="audit" />;

  const progress = reviewProgress(responses);
  const canReview = audit.status === 'Completed';
  const tickedCount = Object.keys(ticked).length;
  const files = evidenceCount(responses);

  function tick(rid, on) {
    setTicked((prev) => {
      const next = { ...prev };
      if (on) next[rid] = next[rid] ?? { note: '', category: 'wrong_answer' };
      else delete next[rid];
      return next;
    });
  }

  async function decide(decision) {
    const problem = checkDecision({ decision, reason, ticked });
    if (problem) { toast.error(problem); return; }
    setBusy(true);
    try {
      await api.decideAudit(audit.id, decisionBody(decision, reason, ticked));
      toast({ approve: 'Audit approved', return: 'Audit returned to the auditor', reject: 'Audit rejected' }[decision]);
      navigate('/audits');
    } catch (e) {
      toast.error(e.message || 'Could not save your decision');
      setBusy(false);
    }
  }

  function startAsking(kind) {
    const problem = kind === 'return' ? checkDecision({ decision: 'return', reason: 'x', ticked }) : '';
    if (problem) { toast.error(problem); return; }
    setAsking(kind);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Audit review</div>
          <h2 className="text-xl font-bold text-foreground">{audit.id} - {audit.store || audit.store_id}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Auditor: {audit.auditor || 'Unassigned'}{audit.score != null ? ` | Score ${audit.score}%` : ''} | {responses.length} questions | {files} {files === 1 ? 'file' : 'files'} of evidence
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={audit.status === 'Approved' ? 'bg-emerald-600 text-white' : audit.status === 'Rejected' ? 'bg-red-600 text-white' : 'bg-muted text-foreground'}>
            {STATUS_LABEL[audit.status] || audit.status}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => navigate('/audits')}><ArrowLeft /> Back to audits</Button>
        </div>
      </div>

      {!canReview && (
        <div className={cn('mb-3 rounded-md border p-3 text-sm',
          audit.status === 'Rejected' ? 'border-red-200 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-900')}>
          {audit.status === 'Rejected' && `Rejected: ${audit.decision_note || 'no reason recorded'}`}
          {audit.status === 'Changes Requested' && `Returned to the auditor${audit.decision_note ? `: ${audit.decision_note}` : ''}. The flagged questions come back here when they resubmit.`}
          {audit.status === 'Approved' && 'This audit is approved.'}
          {!['Rejected', 'Changes Requested', 'Approved'].includes(audit.status) && 'Questions can be reviewed once the auditor submits this audit.'}
        </div>
      )}

      <div className="mb-3 rounded-[10px] border border-border bg-card p-4">
        <div className="mb-1 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
          <span>{progress.total} questions | {progress.pending} to review</span>
          <span>{tickedCount} ticked to check again</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${progress.percent}%` }} /></div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter questions">
        {REVIEW_FILTERS.filter((f) => f.value !== 'query').map((f) => (
          <Button key={f.value} size="sm" variant={filter === f.value ? 'default' : 'outline'} onClick={() => setFilter(f.value)}>
            {f.label} ({reviewFilter(responses, f.value).length})
          </Button>
        ))}
      </div>

      <div className="mb-4 grid gap-3">
        {shown.map((row) => (
          <QuestionCard
            key={row.id}
            number={numbers.get(row.id)}
            row={row}
            canReview={canReview}
            ticked={row.id in ticked}
            note={ticked[row.id]?.note || ''}
            category={ticked[row.id]?.category || 'wrong_answer'}
            onTick={tick}
            onNote={(rid, text) => setTicked((prev) => ({ ...prev, [rid]: { ...prev[rid], note: text } }))}
            onCategory={(rid, value) => setTicked((prev) => ({ ...prev, [rid]: { ...prev[rid], category: value } }))}
          />
        ))}
        {!shown.length && <div className="rounded-[10px] border border-border bg-card p-8 text-center text-xs text-muted-foreground">No questions here</div>}
      </div>

      <AnnexurePanel auditId={audit.id} />

      {canReview && (
        <div className="sticky bottom-0 z-10 -mx-1 mt-4 border-t border-border bg-card/95 p-3 backdrop-blur">
          {asking && (
            <div className="mb-3">
              <label className={labelClass} htmlFor="decision-reason">
                {asking === 'return' ? 'What should the auditor fix?' : 'Why is this audit rejected?'} <span className="text-destructive">*</span>
              </label>
              <textarea id="decision-reason" className={cn(fieldClass, 'min-h-[64px] resize-y')} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
              {asking === 'return' && (
                auditees && auditees.length === 0 ? (
                  <p className="mt-1 text-xs text-amber-800">
                    This store has no auditee, so only the auditor will be told.{' '}
                    <button type="button" className="font-medium text-primary hover:underline"
                      onClick={() => navigate(`/stores?id=${audit.store_id}`)}>+ Add auditee</button>
                  </p>
                ) : auditees && (
                  <p className="mt-1 text-xs text-muted-foreground">The auditor and {auditees.map((a) => a.name).join(', ')} will be notified with your comments.</p>
                )
              )}
              <div className="mt-2 flex justify-end gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => { setAsking(null); setReason(''); }}>Cancel</Button>
                <Button size="sm" variant={asking === 'reject' ? 'destructive' : 'default'} disabled={busy} onClick={() => decide(asking)}>
                  {asking === 'return' ? 'Send back for fixing' : 'Reject audit'}
                </Button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {tickedCount ? `${tickedCount} ${tickedCount === 1 ? 'question' : 'questions'} ticked: return it for fixing, or untick to approve.` : 'Nothing ticked: you can approve the audit.'}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="border-red-200 text-destructive" disabled={busy || !!asking} onClick={() => startAsking('reject')}>
                <XCircle /> Reject
              </Button>
              <Button variant="outline" disabled={busy || !!asking} onClick={() => startAsking('return')}>
                <CornerUpLeft /> Return for fixing
              </Button>
              <Button disabled={busy || !!asking || tickedCount > 0} onClick={() => decide('approve')}>
                <Check /> Approve audit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
