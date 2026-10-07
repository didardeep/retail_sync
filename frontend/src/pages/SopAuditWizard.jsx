import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Camera, ChevronLeft, ChevronRight, MessageSquare, Save } from 'lucide-react';

import { cn, fieldClass } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/Toast';
import { ErrorNote, Loading } from '@/components/Loader';
import ProofSheet from '@/components/ProofSheet';
import SyncChip from '@/components/SyncChip';
import {
  addAttachment, compressImage, flattenCriteria, getBundle, hydrateFromServer,
  isNa, removeAttachment, saveAnswer, setHeader, summarize, validateScore,
} from '@/lib/offline';

const fmt = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

// One criterion per screen (D6). Every change is written to the device first;
// Next/Prev flush the score box, save the position, then move.
export default function SopAuditWizard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [bundle, setBundle] = useState(null);
  const [error, setError] = useState(null);
  const [idx, setIdx] = useState(0);
  const [scoreText, setScoreText] = useState('');
  const [scoreError, setScoreError] = useState(null);
  const [proofOpen, setProofOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const topRef = useRef(null);
  const timer = useRef(null);
  const textRef = useRef('');
  const live = useRef({});

  const criteria = useMemo(
    () => (bundle ? flattenCriteria(bundle.template) : []),
    [bundle?.template], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const c = criteria[idx];
  const row = c && bundle ? bundle.rows[c.id] : undefined;
  live.current = { c, bundle };

  const refresh = useCallback(async () => {
    const b = await getBundle(id);
    setBundle(b);
    return b;
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        let b = await getBundle(id);
        if (!b) {
          await hydrateFromServer(id); // started on another device
          b = await getBundle(id);
        }
        if (cancelled) return;
        if (!b) throw new Error('Audit not found on this device');
        if (b.audit.status === 'Submitted') {
          navigate(`/sop-audits/${id}/review`, { replace: true });
          return;
        }
        setBundle(b);
        const total = flattenCriteria(b.template).length;
        setIdx(Math.min(b.audit.position || 0, total - 1));
      } catch (e) {
        if (!cancelled) setError(e);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id, navigate]);

  // Load the score box whenever the criterion changes.
  const critId = c?.id;
  const loaded = !!bundle;
  useEffect(() => {
    if (!live.current.bundle || !critId) return;
    const r = live.current.bundle.rows[critId];
    const t = r?.score != null ? String(r.score) : '';
    setScoreText(t);
    textRef.current = t;
    setScoreError(null);
  }, [critId, loaded]);

  async function commitScore(criterion, text) {
    const err = validateScore(text, criterion.marks);
    setScoreError(err);
    if (err) return false;
    const existing = live.current.bundle.rows[criterion.id];
    if (existing?.is_na) return true;
    const next = text === '' ? null : Number(text);
    if ((existing?.score ?? null) === next) return true;
    await saveAnswer(id, criterion, { score: next, is_na: false });
    await refresh();
    return true;
  }

  // Flush the score box now (used by Next/Prev/Save and when the app hides).
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const { c: cur, bundle: b } = live.current;
    if (!cur || !b) return true;
    return commitScore(cur, textRef.current);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  function onScoreChange(e) {
    const v = e.target.value.replace(/[^0-9.]/g, '');
    setScoreText(v);
    textRef.current = v;
    setScoreError(validateScore(v, c.marks));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => commitScore(c, textRef.current), 600);
  }

  async function toggleNa() {
    clearTimeout(timer.current);
    const next = !isNa(c, row);
    await saveAnswer(id, c, { is_na: next });
    if (next) {
      setScoreText('');
      textRef.current = '';
      setScoreError(null);
    }
    await refresh();
  }

  async function go(delta) {
    if (!(await flush())) return;
    const next = idx + delta;
    if (next < 0) return;
    if (next >= criteria.length) {
      await setHeader(id, { position: criteria.length - 1 });
      navigate(`/sop-audits/${id}/review`);
      return;
    }
    await setHeader(id, { position: next });
    setIdx(next);
    topRef.current?.scrollIntoView({ block: 'start' });
  }

  async function jumpToSection(code) {
    if (!(await flush())) return;
    const target = criteria.findIndex((x) => x.section_code === code);
    if (target >= 0) {
      await setHeader(id, { position: target });
      setIdx(target);
    }
  }

  async function saveAndExit() {
    if (!(await flush())) return;
    await setHeader(id, { position: idx });
    toast('Saved on this device');
    navigate('/audits');
  }

  // Jump to the review screen from anywhere (used after fixing a question the review flagged).
  async function goToReview() {
    if (!(await flush())) return;
    await setHeader(id, { position: idx });
    navigate(`/sop-audits/${id}/review`);
  }

  async function onComment(text) {
    await saveAnswer(id, c, { comment: text });
    await refresh();
  }

  async function onAddPhoto(file) {
    setBusy(true);
    try {
      const blob = await compressImage(file);
      await addAttachment(id, c.id, blob);
      await refresh();
    } catch (e) {
      toast.error(e.message || 'Could not add that photo');
    } finally {
      setBusy(false);
    }
  }

  async function onRemovePhoto(attId) {
    await removeAttachment(attId);
    await refresh();
  }

  if (error) return <ErrorNote error={error} />;
  if (!bundle || !c) return <Loading what="audit" />;

  const { audit, template, attachments } = bundle;
  const na = isNa(c, row);
  const mine = attachments.filter((a) => a.criterion_id === c.id);
  const summary = summarize(template, bundle.rows);
  const pct = summary.applicable ? Math.round((summary.answered / summary.applicable) * 100) : 0;
  const hasComment = !!(row?.comment || '').trim();
  const missingComment = c.requires_comment && !na && !hasComment;
  const missingPhoto = c.requires_photo && !na && mine.length === 0;
  const isLast = idx === criteria.length - 1;
  const sections = template.sections;

  return (
    <div ref={topRef} className="mx-auto max-w-2xl scroll-mt-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{audit.store_name}</div>
          <div className="truncate text-xs text-muted-foreground">{audit.template_name}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="h-8" onClick={goToReview}>Review</Button>
          <SyncChip />
        </div>
      </div>

      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>{summary.answered} of {summary.applicable} answered</span>
        <span>{pct}%</span>
      </div>
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>

      <select
        className={cn(fieldClass, 'mb-3 h-11')}
        value={c.section_code}
        onChange={(e) => jumpToSection(e.target.value)}
        aria-label="Jump to section"
      >
        {sections.map((s) => (
          <option key={s.id} value={s.code}>Section {s.code} - {s.name}</option>
        ))}
      </select>

      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-primary">
          Section {c.section_code} - Q{c.index_in_section + 1} of {c.section_size}
        </div>
        <h2 className="whitespace-pre-line text-base font-bold leading-snug text-foreground">{c.title}</h2>
        <div className="mt-1 text-xs text-muted-foreground">{fmt(c.marks)} marks</div>

        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-950">
          <div className="mb-1 text-xs font-bold">Best - {fmt(c.max_points)} pts</div>
          <div className="whitespace-pre-line text-[13px] leading-relaxed">{c.max_text || 'No description'}</div>
        </div>

        {c.avg_text && (
          <details className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-950">
            <summary className="cursor-pointer text-xs font-bold">Average - {fmt(c.avg_points)} pts</summary>
            <div className="mt-1 whitespace-pre-line text-[13px] leading-relaxed">{c.avg_text}</div>
          </details>
        )}

        <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-3 text-red-950">
          <div className="mb-1 text-xs font-bold">Least - {fmt(c.min_points)} pts</div>
          <div className="whitespace-pre-line text-[13px] leading-relaxed">{c.min_text || 'No description'}</div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Input
            value={scoreText}
            onChange={onScoreChange}
            disabled={na}
            inputMode="decimal"
            autoComplete="off"
            placeholder="--"
            aria-label="Score"
            className={cn('h-14 w-28 text-center text-2xl font-bold md:text-2xl', scoreError && 'border-destructive')}
          />
          <div className="text-lg font-semibold text-muted-foreground">/ {fmt(c.marks)}</div>
          <label className="ml-auto flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={na} onChange={toggleNa} className="size-5" />
            N/A
          </label>
        </div>
        {scoreError && <div className="mt-1 text-xs text-destructive">{scoreError}</div>}

        <Button
          type="button"
          variant="outline"
          className="mt-4 h-11 w-full justify-start"
          onClick={() => setProofOpen(true)}
        >
          {mine.length ? <Camera /> : <MessageSquare />}
          Add proof / comment
          <span className="ml-auto flex items-center gap-2 text-xs font-normal text-muted-foreground">
            {hasComment && <span>comment</span>}
            {mine.length > 0 && <span>{mine.length} photo{mine.length > 1 ? 's' : ''}</span>}
          </span>
        </Button>
        {(missingComment || missingPhoto) && (
          <div className="mt-1 text-xs text-destructive">
            {[missingComment && 'A comment is required', missingPhoto && 'A photo is required']
              .filter(Boolean).join(' and ')} for this question.
          </div>
        )}
      </div>

      <div
        className="sticky -bottom-10 z-10 -mx-4 mt-4 flex items-center gap-2 border-t border-border bg-card px-4 py-3 md:mx-0 md:rounded-lg md:border"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <Button type="button" variant="outline" className="h-11 w-11 shrink-0 px-0" onClick={() => go(-1)} disabled={idx === 0} aria-label="Previous question">
          <ChevronLeft />
        </Button>
        <Button type="button" variant="outline" className="h-11 flex-1" onClick={saveAndExit}>
          <Save /> Save &amp; exit
        </Button>
        <Button type="button" className="h-11 flex-1" onClick={() => go(1)}>
          {isLast ? 'Review' : 'Next'} <ChevronRight />
        </Button>
      </div>

      <ProofSheet
        open={proofOpen}
        onClose={() => setProofOpen(false)}
        criterion={c}
        comment={row?.comment || ''}
        attachments={mine}
        onComment={onComment}
        onAddPhoto={onAddPhoto}
        onRemovePhoto={onRemovePhoto}
        busy={busy}
      />
    </div>
  );
}
