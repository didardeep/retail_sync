import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Save } from 'lucide-react';

import { api, loadSession } from '@/api/client';
import { cn, fieldClass, labelClass } from '@/lib/utils';
import {
  RISKS, firstUnansweredIndex, isAuditorEditable, orderedQuestions,
  parseQuestionParam, processes, progress,
} from '@/lib/classicAudit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/Toast';
import { ErrorNote, Loading } from '@/components/Loader';
import AnswerButtons from '@/components/classic/AnswerButtons';
import OnlineBanner from '@/components/classic/OnlineBanner';
import { useOnline } from '@/lib/offline';

const evidenceType = (url) => (/\.(mp4|mov|webm)$/i.test(url) ? 'video' : 'photo');

// One checklist question per screen. Unlike the SOP wizard this is online
// only: every change goes to the server first and is shown as saved only after
// the server accepted it.
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
  const [evUrl, setEvUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(null);

  const topRef = useRef(null);
  const live = useRef({});

  const questions = useMemo(() => orderedQuestions(audit), [audit]);
  const sections = useMemo(() => processes(audit), [audit]);
  const q = questions[idx];
  live.current = { q, remarks, evUrl, failed };

  // Load (unless the route wrapper already did) and pick the starting question.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const a = initialAudit || (await api.audit(id));
        if (cancelled) return;
        if (!isAuditorEditable(a, user)) {
          navigate(`/audits/${id}/review`, { replace: true });
          return;
        }
        const total = (a.responses || []).length;
        const fromLink = parseQuestionParam(search.get('q'), total);
        const firstOpen = firstUnansweredIndex(a);
        setAudit(a);
        setIdx(fromLink ?? (firstOpen >= 0 ? firstOpen : Math.max(0, total - 1)));
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
    setEvUrl(live.current.q.evidence?.[0]?.url || '');
  }, [qId]);

  // Send one change to the server. Returns true only when it was accepted.
  const save = useCallback(async (respId, patch) => {
    // A change that failed earlier on this question is sent again with this one.
    const pending = live.current.failed;
    const body = pending && pending.respId === respId ? { ...pending.patch, ...patch } : patch;
    setSaving(true);
    try {
      await api.answer(id, respId, body);
      setAudit((prev) => ({
        ...prev,
        status: prev.status === 'Planned' ? 'Ongoing' : prev.status,
        responses: prev.responses.map((r) => (r.id === respId ? { ...r, ...body } : r)),
      }));
      setFailed(null);
      return true;
    } catch (e) {
      if (e.status === 409) {
        // No longer open for editing (submitted elsewhere): show it read-only.
        navigate(`/audits/${id}/review`, { replace: true });
        return false;
      }
      setFailed({ message: e.message, offline: !!e.offline, respId, patch: body });
      return false;
    } finally {
      setSaving(false);
    }
  }, [id, navigate]);

  // Write the remarks and evidence boxes if they changed. False means a save failed.
  const flush = useCallback(async () => {
    const { q: cur, remarks: rem, evUrl: ev } = live.current;
    if (!cur) return true;
    const patch = {};
    if (rem !== (cur.remarks || '')) patch.remarks = rem;
    const url = ev.trim();
    if (url !== (cur.evidence?.[0]?.url || '')) {
      patch.evidence = url ? [{ type: evidenceType(url), url }] : [];
    }
    if (!Object.keys(patch).length) return true;
    return save(cur.id, patch);
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

  async function retry() {
    const f = live.current.failed;
    if (!f) return;
    await save(f.respId, f.patch);
  }

  function pickAnswer(a) {
    return save(q.id, { answer: a });
  }

  async function ready() {
    const pending = live.current.failed;
    if (pending && !(await save(pending.respId, {}))) return false;
    return flush();
  }

  async function go(delta) {
    if (!(await ready())) return;
    const next = idx + delta;
    if (next < 0) return;
    if (next >= questions.length) {
      navigate(`/audits/${id}/review`);
      return;
    }
    setIdx(next);
    topRef.current?.scrollIntoView({ block: 'start' });
  }

  async function jumpToSection(name) {
    if (!(await ready())) return;
    const s = sections.find((x) => x.name === name);
    if (s) setIdx(s.first);
  }

  async function saveAndExit() {
    if (!(await ready())) return;
    toast('Saved');
    navigate('/sop-audits');
  }

  if (error) return <ErrorNote error={error} />;
  if (!audit || !q) return <Loading what="audit" />;

  const { answered, total, percent } = progress(audit);
  const isLast = idx === questions.length - 1;
  const criticalNo = q.is_critical && q.answer === 'No';

  return (
    <div ref={topRef} className="mx-auto max-w-2xl scroll-mt-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-9 w-9 shrink-0 px-0"
            onClick={saveAndExit}
            disabled={saving}
            aria-label="Back to audits"
          >
            <ArrowLeft />
          </Button>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">{audit.store}</div>
            <div className="truncate text-xs text-muted-foreground">{audit.id}</div>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          Checklist audit
        </span>
      </div>

      <OnlineBanner online={online} failed={failed} onRetry={retry} retrying={saving} />

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

        <div className="mt-4">
          <AnswerButtons value={q.answer} onPick={pickAnswer} disabled={saving} />
        </div>
        {criticalNo && (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-900">
            <AlertTriangle className="size-4 shrink-0" />
            This will raise an issue for the store manager
          </div>
        )}

        <div className="mt-4">
          <label className={labelClass} htmlFor="classic-remarks">Remarks</label>
          <Textarea
            id="classic-remarks"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            onBlur={flush}
            placeholder="What did you observe?"
            rows={3}
          />
        </div>

        <div className="mt-3">
          <label className={labelClass} htmlFor="classic-risk">Risk level</label>
          <select
            id="classic-risk"
            className={cn(fieldClass, 'h-11')}
            value={q.risk || ''}
            disabled={saving}
            onChange={(e) => save(q.id, { risk: e.target.value })}
          >
            {RISKS.map((x) => <option key={x} value={x}>{x || 'None'}</option>)}
          </select>
        </div>

        <div className="mt-3">
          <label className={labelClass} htmlFor="classic-evidence">Evidence link</label>
          <Input
            id="classic-evidence"
            value={evUrl}
            onChange={(e) => setEvUrl(e.target.value)}
            onBlur={flush}
            inputMode="url"
            autoComplete="off"
            placeholder="Paste a photo or video link"
          />
        </div>
      </div>

      <div
        className="sticky -bottom-10 z-10 -mx-4 mt-4 flex items-center gap-2 border-t border-border bg-card px-4 py-3 md:mx-0 md:rounded-lg md:border"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <Button type="button" variant="outline" className="h-11 w-11 shrink-0 px-0" onClick={() => go(-1)} disabled={idx === 0 || saving} aria-label="Previous question">
          <ChevronLeft />
        </Button>
        <Button type="button" variant="outline" className="h-11 flex-1" onClick={saveAndExit} disabled={saving}>
          <Save /> Save &amp; exit
        </Button>
        <Button type="button" className="h-11 flex-1" onClick={() => go(1)} disabled={saving}>
          {isLast ? 'Review' : 'Next'} <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
