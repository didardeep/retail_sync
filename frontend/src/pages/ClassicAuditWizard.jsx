import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Save } from 'lucide-react';

import { api, loadSession } from '@/api/client';
import { lockedForChanges } from '@/lib/statuses';
import { categoryLabel, fixProgress, flaggedQuestions, stepFlagged } from '@/lib/changesRequested';
import { cn, fieldClass, labelClass } from '@/lib/utils';
import {
  RISKS, firstUnansweredIndex, isAuditorEditable, orderedQuestions,
  parseQuestionParam, processes, progress,
} from '@/lib/classicAudit';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/Toast';
import { ErrorNote, Loading } from '@/components/Loader';
import { EvidencePicker } from '@/components/Evidence';
import ExceptionsCard from '@/components/ExceptionsCard';
import AnswerButtons from '@/components/classic/AnswerButtons';
import ChangesPanel from '@/components/classic/ChangesPanel';
import ConflictPanel from '@/components/classic/ConflictPanel';
import OnlineBanner from '@/components/classic/OnlineBanner';
import QuestionRail from '@/components/classic/QuestionRail';
import RaiseIssue from '@/components/classic/RaiseIssue';
import SyncChip from '@/components/SyncChip';
import { useOnline } from '@/lib/useOnline';
import {
  dismissConflict, flushAudit, forgetAudit, loadAudit, saveChange, syncNow, useSyncState,
} from '@/lib/offlineSync';
import { submitBlock } from '@/lib/offlineQueue';
import { updateCachedResponse } from '@/lib/offlineStore';

// One checklist question per screen. Works offline: every change is written to
// this device first (IndexedDB) and sent to the server when a connection is
// there. The sync chip shows whether anything is still waiting.
export default function ClassicAuditWizard({ initialAudit }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const toast = useToast();
  const online = useOnline();
  const user = loadSession()?.user;

  const [audit, setAudit] = useState(initialAudit || null);
  const [error, setError] = useState(null);
  const [idx, setIdx] = useState(0);
  const [remarks, setRemarks] = useState('');
  const [saveError, setSaveError] = useState(null);
  const [dismissing, setDismissing] = useState(false);
  // Sent back for changes: the flagged questions the auditor has changed so far.
  const [changed, setChanged] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const changedRef = useRef([]);
  const sync = useSyncState();
  const conflict = sync.conflicts[id];

  const topRef = useRef(null);
  const live = useRef({});

  const questions = useMemo(() => orderedQuestions(audit), [audit]);
  const sections = useMemo(() => processes(audit), [audit]);
  const q = questions[idx];
  // The changes made since the audit came back are kept per return, so a second return starts fresh.
  const fixKey = audit?.status === 'Changes Requested' ? `fix:${id}:${audit.decision_at || ''}` : null;
  live.current = { q, remarks, conflict, fixKey };

  useEffect(() => {
    let saved = [];
    if (fixKey) {
      try { saved = JSON.parse(sessionStorage.getItem(fixKey) || '[]'); } catch { saved = []; }
    }
    changedRef.current = saved;
    setChanged(saved);
  }, [fixKey]);

  const markChanged = useCallback((respId) => {
    const key = live.current.fixKey;
    if (!key || changedRef.current.includes(respId)) return;
    changedRef.current = [...changedRef.current, respId];
    setChanged(changedRef.current);
    try { sessionStorage.setItem(key, JSON.stringify(changedRef.current)); } catch { /* storage can be unavailable */ }
  }, []);

  // Load (unless the route wrapper already did) and pick the starting question.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const a = initialAudit || (await loadAudit(id)).audit;
        if (cancelled) return;
        if (!isAuditorEditable(a, user)) {
          navigate(`/audits/${id}/review`, { replace: true });
          return;
        }
        syncNow();
        const total = (a.responses || []).length;
        const fromLink = parseQuestionParam(search.get('q'), total);
        const firstOpen = firstUnansweredIndex(a);
        // Sent back for changes: start at the first question the manager queried.
        const firstQueried = a.status === 'Changes Requested'
          ? orderedQuestions(a).findIndex((r) => r.review_status === 'query') : -1;
        setAudit(a);
        setIdx(fromLink ?? (firstQueried >= 0 ? firstQueried
          : firstOpen >= 0 ? firstOpen : Math.max(0, total - 1)));
      } catch (e) {
        if (!cancelled) setError(e);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fill the text boxes whenever the question on screen changes.
  const qId = q?.id;
  useEffect(() => {
    if (!live.current.q) return;
    setRemarks(live.current.q.remarks || '');
  }, [qId]);

  // Store one change on this device and let the sync engine send it.
  // Returns true only when it is safely stored.
  const save = useCallback(async (respId, patch) => {
    if (live.current.conflict) return false;
    try {
      await saveChange(id, respId, patch);
    } catch (e) {
      setSaveError(e.message || 'storage is unavailable');
      return false;
    }
    setSaveError(null);
    markChanged(respId);
    setAudit((prev) => ({
      ...prev,
      status: prev.status === 'Planned' ? 'Ongoing' : prev.status,
      responses: prev.responses.map((r) => (r.id === respId ? { ...r, ...patch } : r)),
    }));
    return true;
  }, [id, markChanged]);

  // Write the remarks box if it changed. False means a save failed.
  const flush = useCallback(async () => {
    const { q: cur, remarks: rem } = live.current;
    if (!cur || rem === (cur.remarks || '')) return true;
    return save(cur.id, { remarks: rem });
  }, [save]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  function pickAnswer(a) {
    return save(q.id, { answer: a });
  }

  // Remember on the question that an issue now exists for it.
  function markRaised(respId, issue) {
    updateCachedResponse(id, respId, { issue_id: issue.id, issue_assignee: issue.assignee }).catch(() => {});
    setAudit((prev) => ({
      ...prev,
      responses: prev.responses.map((r) => (
        r.id === respId ? { ...r, issue_id: issue.id, issue_assignee: issue.assignee } : r)),
    }));
  }

  async function go(delta) {
    if (!(await flush())) return;
    if (audit.status === 'Changes Requested') {
      // Only the flagged questions can change, so Next and Back skip the locked ones.
      const target = stepFlagged(flaggedQuestions(audit), idx, delta);
      if (target !== null) {
        setIdx(target);
        topRef.current?.scrollIntoView({ block: 'start' });
      } else if (delta > 0) {
        await submitChanges();
      }
      return;
    }
    const next = idx + delta;
    if (next < 0) return;
    if (next >= questions.length) {
      navigate(`/audits/${id}/review`);
      return;
    }
    setIdx(next);
    topRef.current?.scrollIntoView({ block: 'start' });
  }

  async function jumpTo(index) {
    if (!(await flush())) return;
    setIdx(index);
    topRef.current?.scrollIntoView({ block: 'start' });
  }

  // Send the fixed audit straight back to the audit manager, without the review step.
  async function submitChanges() {
    if (!(await flush())) return;
    const left = fixProgress(flaggedQuestions(audit), changedRef.current).left;
    if (left > 0 && !window.confirm(`${left} flagged ${left === 1 ? 'question is' : 'questions are'} still unchanged. Submit anyway?`)) return;
    setSubmitting(true);
    try {
      // Never submit with answers that are still only on this device.
      const pending = await flushAudit(id);
      const why = submitBlock({ online: navigator.onLine, ...pending });
      if (why) {
        toast.error(why);
        return;
      }
      await api.submitAudit(id);
      await forgetAudit(id);
      toast('Changes submitted. The audit is back with the audit manager.');
      navigate('/audits');
    } catch (e) {
      toast.error(e.offline ? 'You need a connection to submit. Reconnect and try again.' : (e.message || 'Could not submit the changes'));
    } finally {
      setSubmitting(false);
    }
  }

  async function jumpToSection(name) {
    if (!(await flush())) return;
    const s = sections.find((x) => x.name === name);
    if (s) setIdx(s.first);
  }

  async function saveAndExit() {
    if (!(await flush())) return;
    toast(online && !sync.pending ? 'Saved' : 'Saved on this device');
    navigate('/audits');
  }

  async function dismiss() {
    setDismissing(true);
    await dismissConflict(id);
    navigate(`/audits/${id}/review`, { replace: true });
  }

  if (error) return <ErrorNote error={error} />;
  if (!audit || !q) return <Loading what="audit" />;
  if (conflict) return <ConflictPanel audit={audit} message={conflict} busy={dismissing} onDismiss={dismiss} />;

  const { answered, total, percent } = progress(audit);
  const isLast = idx === questions.length - 1;
  const locked = lockedForChanges(audit, q);
  const fixing = audit.status === 'Changes Requested';
  const flagged = fixing ? flaggedQuestions(audit) : [];
  const nextFlagged = fixing ? stepFlagged(flagged, idx, 1) : null;
  const prevFlagged = fixing ? stepFlagged(flagged, idx, -1) : null;
  const railItems = fixing
    ? flagged.map((f) => ({ index: f.index, label: f.code.replace(/^Q0*/, 'Q'), state: changed.includes(f.id) ? 'flag-done' : 'flag' }))
    : questions.map((r, i) => ({ index: i, label: String(i + 1), state: r.answer ? 'done' : 'todo' }));

  return (
    <div className="mx-auto flex max-w-4xl items-start gap-5">
    <div ref={topRef} className="min-w-0 max-w-2xl flex-1 scroll-mt-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-9 w-9 shrink-0 px-0"
            onClick={saveAndExit}
            aria-label="Back to audits"
          >
            <ArrowLeft />
          </Button>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">{audit.store}</div>
            <div className="truncate text-xs text-muted-foreground">{audit.id}</div>
          </div>
        </div>
        <SyncChip auditId={id} className="shrink-0" />
      </div>

      <OnlineBanner online={online} saveError={saveError} />

      {fixing && (
        <ChangesPanel audit={audit} flagged={flagged} changed={changed} currentIndex={idx}
          onJump={jumpTo} onSubmit={submitChanges} submitting={submitting} />
      )}

      {online && (
        <details className="mb-3">
          <summary className="cursor-pointer text-xs font-medium text-primary">Data analytics exceptions to verify at this store</summary>
          <div className="mt-2"><ExceptionsCard storeIds={[audit.store_id]} limit={5} /></div>
        </details>
      )}

      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>{answered} of {total} answered</span>
        <span>{percent}%</span>
      </div>
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>

      <select
        className={cn(fieldClass, 'mb-3 h-11')}
        value={q.process}
        onChange={(e) => jumpToSection(e.target.value)}
        aria-label="Jump to section"
      >
        {sections.map((s) => (
          <option key={s.name} value={s.name}>{s.name}</option>
        ))}
      </select>

      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-primary">
          {q.process} - Q{q.index_in_process + 1} of {q.process_size}
        </div>
        <h2 className="whitespace-pre-line text-base font-bold leading-snug text-foreground">{q.question_text}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {q.is_critical && (
            <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10.5px] font-semibold text-red-700">Critical</span>
          )}
          <span>Weight {q.weight ?? 1}</span>
          {q.question_code && <span className="font-mono">{q.question_code}</span>}
        </div>

        {q.review_status === 'query' && q.review_note && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[12.5px] text-amber-900">
            <span className="font-semibold">{q.reviewed_by || 'Audit manager'}: </span>{q.review_note}
            {categoryLabel(q.review_category) && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium">{categoryLabel(q.review_category)}</span>}
          </div>
        )}
        {locked && (
          <div className="mt-3 rounded-md bg-muted px-2.5 py-2 text-[12px] text-muted-foreground">Locked: only the queried questions can be changed.</div>
        )}

        <div className="mt-4">
          <AnswerButtons value={q.answer} onPick={pickAnswer} disabled={locked} />
        </div>
        {!locked && <RaiseIssue audit={audit} question={q} onRaised={markRaised} />}

        <div className="mt-4">
          <label className={labelClass} htmlFor="classic-remarks">Remarks</label>
          <Textarea
            id="classic-remarks"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            onBlur={flush}
            placeholder="What did you observe?"
            rows={3}
            disabled={locked}
          />
        </div>

        <div className="mt-3">
          <label className={labelClass} htmlFor="classic-risk">Risk level</label>
          <select
            id="classic-risk"
            className={cn(fieldClass, 'h-11')}
            value={q.risk || ''}
            disabled={locked}
            onChange={(e) => save(q.id, { risk: e.target.value })}
          >
            {RISKS.map((x) => <option key={x} value={x}>{x || 'None'}</option>)}
          </select>
        </div>

        <div className="mt-3">
          <div className={labelClass}>Evidence</div>
          <EvidencePicker
            key={q.id}
            value={q.evidence}
            onChange={(next) => save(q.id, { evidence: next })}
            disabled={!online || locked}
          />
          {!online && (
            <p className="mt-1 text-xs text-muted-foreground">Evidence needs a connection. Add it once you are back online.</p>
          )}
        </div>
      </div>

      <div
        className="sticky -bottom-10 z-10 -mx-4 mt-4 flex items-center gap-2 border-t border-border bg-card px-4 py-3 md:mx-0 md:rounded-lg md:border"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <Button type="button" variant="outline" className="h-11 w-11 shrink-0 px-0" onClick={() => go(-1)} disabled={fixing ? prevFlagged === null : idx === 0} aria-label="Previous question">
          <ChevronLeft />
        </Button>
        <Button type="button" variant="outline" className="h-11 flex-1" onClick={saveAndExit}>
          <Save /> Save &amp; exit
        </Button>
        <Button type="button" className="h-11 flex-1" onClick={() => go(1)}>
          {fixing ? (nextFlagged === null ? 'Submit changes' : 'Next flagged') : (isLast ? 'Review' : 'Next')} <ChevronRight />
        </Button>
      </div>
    </div>
    <QuestionRail
      title={fixing ? 'Flagged' : 'Questions'}
      items={railItems}
      currentIndex={idx}
      onJump={jumpTo}
      endLabel={fixing ? 'Submit changes' : 'End: review'}
      onEnd={fixing ? submitChanges : () => go(questions.length)}
    />
    </div>
  );
}
