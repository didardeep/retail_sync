import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import { api, loadSession } from '@/api/client';
import { cn } from '@/lib/utils';
import {
  isAuditorEditable, orderedQuestions, previewScore, problems, progress,
} from '@/lib/classicAudit';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/Toast';
import { ErrorNote, Loading } from '@/components/Loader';
import { Modal, ModalActions, ModalTitle } from '@/components/Modal';

const fmt = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

function Row({ item, onClick, tone }) {
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      className={cn(
        'block w-full border-t border-border px-4 py-3 text-left',
        onClick && 'hover:bg-accent',
        tone,
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{item.process}</div>
      <div className="whitespace-pre-line text-[13px] font-medium leading-snug text-foreground">{item.text}</div>
    </button>
  );
}

export default function ClassicAuditReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const user = loadSession()?.user;

  const [audit, setAudit] = useState(null);
  const [error, setError] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.audit(id)
      .then((a) => { if (!cancelled) setAudit(a); })
      .catch((e) => { if (!cancelled) setError(e); });
    return () => { cancelled = true; };
  }, [id]);

  if (error) return <ErrorNote error={error} />;
  if (!audit) return <Loading what="review" />;

  const editable = isAuditorEditable(audit, user) && !result;
  const found = problems(audit);
  const unanswered = found.filter((p) => p.kind === 'unanswered');
  const raising = found.filter((p) => p.kind === 'raises_issue');
  const { answered, total } = progress(audit);
  const preview = previewScore(audit);
  const questions = orderedQuestions(audit);
  const finished = audit.status === 'Completed' || audit.status === 'Approved';

  function jumpTo(index) {
    navigate(`/audits/${id}?q=${index}`);
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.submitAudit(id);
      setAudit(res.audit ? { ...audit, ...res.audit, responses: audit.responses } : audit);
      setResult({ score: res.audit?.score, issues: res.issues_raised ?? 0 });
      setConfirmOpen(false);
    } catch (e) {
      setConfirmOpen(false);
      if (e.status === 409) {
        // Already submitted (or no longer open): reload and show it read-only.
        toast.error('This audit has already been submitted');
        try {
          setAudit(await api.audit(id));
        } catch (e2) {
          setError(e2);
        }
      } else if (e.status === 400) {
        setSubmitError('Some questions are still unanswered. Answer them before submitting.');
        try {
          setAudit(await api.audit(id));
        } catch (e2) {
          setError(e2);
        }
      } else {
        setSubmitError(e.offline
          ? 'You need a connection to submit a checklist audit. Reconnect and try again.'
          : e.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-lg border bg-card p-5 text-center shadow-sm">
          <CheckCircle2 className="mx-auto mb-2 size-10 text-emerald-600" />
          <div className="text-lg font-bold text-foreground">Audit submitted</div>
          <div className="mt-1 truncate text-sm text-muted-foreground">{audit.store}</div>
          <div className="mt-4 text-4xl font-bold text-primary">
            {result.score != null ? `${fmt(result.score)}%` : '--'}
          </div>
          <div className="text-xs text-muted-foreground">Audit score</div>
          <div className="mt-4 text-sm text-foreground">
            {result.issues > 0
              ? `${result.issues} ${result.issues > 1 ? 'issues were' : 'issue was'} raised for the store manager.`
              : 'No issues were raised.'}
          </div>
          <Button className="mt-5 h-11 w-full" onClick={() => navigate('/sop-audits')}>Back to audits</Button>
        </div>
      </div>
    );
  }

  const shownScore = finished && audit.score != null ? audit.score : preview;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-base font-bold text-foreground">{audit.store}</div>
          <div className="truncate text-xs text-muted-foreground">{audit.id} - Checklist audit</div>
        </div>
        <span className="shrink-0 rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          {audit.status}
        </span>
      </div>

      <div className="mb-4 rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-baseline justify-between">
          <div className="text-3xl font-bold text-foreground">
            {shownScore != null ? `${fmt(shownScore)}%` : '--'}
          </div>
          <div className="text-xs text-muted-foreground">
            {finished ? 'Final score' : 'Score preview'} - {answered} of {total} answered
          </div>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary" style={{ width: `${Math.min(100, shownScore || 0)}%` }} />
        </div>
        {editable && (
          <div className={cn('mt-3 flex items-center gap-2 text-sm', unanswered.length ? 'text-destructive' : 'text-emerald-700')}>
            {unanswered.length
              ? <><AlertTriangle className="size-4" /> {unanswered.length} {unanswered.length > 1 ? 'items need' : 'item needs'} attention before you can submit</>
              : <><CheckCircle2 className="size-4" /> Everything is answered. Ready to submit.</>}
          </div>
        )}
      </div>

      {submitError && <div className="mb-3"><ErrorNote error={submitError} /></div>}

      {editable && unanswered.length > 0 && (
        <div className="mb-4 overflow-hidden rounded-lg border bg-card shadow-sm">
          <div className="bg-muted px-4 py-2.5 text-[13px] font-bold text-foreground">
            {unanswered.length} {unanswered.length > 1 ? 'items need' : 'item needs'} attention
          </div>
          {unanswered.map((p) => (
            <Row key={p.id} item={p} tone="bg-red-50/60" onClick={() => jumpTo(p.index)} />
          ))}
        </div>
      )}

      {raising.length > 0 && (
        <div className="mb-4 overflow-hidden rounded-lg border bg-card shadow-sm">
          <div className="bg-muted px-4 py-2.5 text-[13px] font-bold text-foreground">
            Critical questions answered No ({raising.length})
          </div>
          <div className="px-4 pb-1 pt-2 text-xs text-muted-foreground">
            {finished || !editable
              ? 'These raised an issue for the store manager.'
              : 'Submitting will raise an issue for the store manager for each of these.'}
          </div>
          {raising.map((p) => (
            <Row key={p.id} item={p} onClick={editable ? () => jumpTo(p.index) : undefined} />
          ))}
        </div>
      )}

      {audit.notes && (
        <div className="mb-4 rounded-lg border bg-card p-4 shadow-sm">
          <div className="mb-1 text-[11.5px] font-semibold text-foreground/80">Audit notes</div>
          <div className="whitespace-pre-line text-sm text-foreground">{audit.notes}</div>
        </div>
      )}

      {!editable && questions.length > 0 && (
        <div className="mb-4 overflow-hidden rounded-lg border bg-card shadow-sm">
          <div className="bg-muted px-4 py-2.5 text-[13px] font-bold text-foreground">Answers</div>
          {questions.map((x) => (
            <div key={x.id} className="flex items-start justify-between gap-3 border-t border-border px-4 py-3">
              <div className="text-[13px] leading-snug text-foreground">{x.question_text}</div>
              <div className="shrink-0 text-sm font-bold">{x.answer || '--'}</div>
            </div>
          ))}
        </div>
      )}

      <div
        className="sticky -bottom-10 z-10 -mx-4 flex gap-2 border-t border-border bg-card px-4 py-3 md:mx-0 md:rounded-lg md:border"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        {editable ? (
          <>
            <Button variant="outline" className="h-11 flex-1" onClick={() => navigate(`/audits/${id}`)}>Back to questions</Button>
            <Button className="h-11 flex-1" disabled={unanswered.length > 0} onClick={() => setConfirmOpen(true)}>Submit audit</Button>
          </>
        ) : (
          <Button variant="outline" className="h-11 flex-1" onClick={() => navigate('/sop-audits')}>Back to audits</Button>
        )}
      </div>

      <Modal open={confirmOpen} onClose={() => !submitting && setConfirmOpen(false)}>
        <ModalTitle>Submit this audit?</ModalTitle>
        <p className="text-sm text-muted-foreground">
          Score {preview != null ? `${fmt(preview)}%` : '--'}.
          {raising.length > 0 && ` ${raising.length} ${raising.length > 1 ? 'issues' : 'issue'} will be raised for the store manager.`}
          {' '}You will not be able to change it after submitting.
        </p>
        <ModalActions>
          <Button variant="outline" disabled={submitting} onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button disabled={submitting} onClick={submit}>{submitting ? 'Submitting...' : 'Submit'}</Button>
        </ModalActions>
      </Modal>
    </div>
  );
}
