import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import { api, loadSession } from '@/api/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { storeScorecardLink } from '@/lib/links';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/Toast';
import { ErrorNote, Loading } from '@/components/Loader';
import { Modal, ModalActions, ModalTitle } from '@/components/Modal';
import AttachmentThumb from '@/components/AttachmentThumb';
import SopStatusBadge from '@/components/SopStatusBadge';
import SyncChip from '@/components/SyncChip';
import { isAuditorEditable } from '@/lib/statuses';
import {
  flattenCriteria, getBundle, getTemplate, isNa, problems, requestSubmit,
  setHeader, summarize, useOnline,
} from '@/lib/offline';

const fmt = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

// Audits that are not on this device (a manager looking at an auditor's work)
// are read straight from the server.
async function loadServerBundle(id) {
  const detail = await api.sopAudit(id);
  const template = await getTemplate(detail.template_id);
  const rows = {};
  for (const s of detail.scores) rows[s.criterion_id] = s;
  return {
    audit: {
      id: detail.id,
      store_name: detail.store,
      template_name: detail.template,
      status: detail.status,
      template_version: detail.template_version,
      submit_pending: false,
      overall_remarks: detail.overall_remarks || '',
      server_summary: {
        score: detail.score, max_score: detail.max_score, percent: detail.percent,
      },
    },
    template,
    rows,
    attachments: detail.attachments,
    readOnly: true,
  };
}

export default function SopAuditReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const role = loadSession()?.user?.role;
  const toast = useToast();
  const online = useOnline();

  const [bundle, setBundle] = useState(null);
  const [error, setError] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const local = await getBundle(id);
        const b = local || (await loadServerBundle(id));
        if (cancelled) return;
        setBundle(b);
        setRemarks(b.audit.overall_remarks || '');
      } catch (e) {
        if (!cancelled) setError(e);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  if (error) return <ErrorNote error={error} />;
  if (!bundle) return <Loading what="review" />;

  const { audit, template, rows, attachments } = bundle;
  const editable = !bundle.readOnly && isAuditorEditable(audit.status);
  const found = problems(template, rows, attachments);
  const issueByCriterion = {};
  for (const p of found) (issueByCriterion[p.criterion_id] ||= []).push(p.problem);
  const summary = summarize(template, rows);
  const final = audit.server_summary && audit.status === 'Submitted' && !audit.submit_pending
    ? audit.server_summary : summary;
  const flat = flattenCriteria(template);

  async function jumpTo(criterionId) {
    if (!editable) return;
    const target = flat.findIndex((x) => x.id === criterionId);
    await setHeader(id, { position: Math.max(0, target) });
    navigate(`/sop-audits/${id}`);
  }

  async function saveRemarks() {
    if (editable && remarks !== audit.overall_remarks) {
      await setHeader(id, { overall_remarks: remarks });
    }
  }

  async function submit() {
    setSubmitting(true);
    try {
      await saveRemarks();
      await requestSubmit(id);
      toast(online ? 'Audit submitted' : 'Audit submitted - will sync when you are back online');
      navigate('/sop-audits');
    } catch (e) {
      toast.error(e.message);
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-base font-bold text-foreground">{audit.store_name}</div>
          <div className="truncate text-xs text-muted-foreground">{audit.template_name}</div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <SopStatusBadge
            status={audit.status}
            submitPending={audit.submit_pending}
            version={audit.template_version}
          />
          {!bundle.readOnly && <SyncChip />}
        </div>
      </div>

      {audit.sync_error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          The server could not accept this audit: {audit.sync_error}
        </div>
      )}

      <div className="mb-4 rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-baseline justify-between">
          <div className="text-3xl font-bold text-foreground">
            {fmt(final.score)}<span className="text-lg font-semibold text-muted-foreground"> / {fmt(final.max_score)}</span>
          </div>
          <div className="text-xl font-bold text-primary">{fmt(final.percent)}%</div>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary" style={{ width: `${Math.min(100, final.percent)}%` }} />
        </div>
        {editable && (
          <div className={cn('mt-3 flex items-center gap-2 text-sm', found.length ? 'text-destructive' : 'text-emerald-700')}>
            {found.length
              ? <><AlertTriangle className="size-4" /> {found.length} {found.length > 1 ? 'items need' : 'item needs'} attention before you can submit</>
              : <><CheckCircle2 className="size-4" /> Everything is answered. Ready to submit.</>}
          </div>
        )}
      </div>

      {template.sections.map((sec) => {
        const s = summary.sections.find((x) => x.id === sec.id);
        return (
          <div key={sec.id} className="mb-4 overflow-hidden rounded-lg border bg-card shadow-sm">
            <div className="flex items-center justify-between bg-muted px-4 py-2.5">
              <div className="text-[13px] font-bold text-foreground">Section {sec.code} - {sec.name}</div>
              <div className="shrink-0 pl-2 text-xs font-semibold text-muted-foreground">{fmt(s.score)} / {fmt(s.max_score)}</div>
            </div>
            {sec.criteria.map((crit) => {
              const row = rows[crit.id];
              const na = isNa(crit, row);
              const issues = issueByCriterion[crit.id];
              const photos = attachments.filter((a) => a.criterion_id === crit.id && !a.deleted);
              return (
                <button
                  key={crit.id}
                  type="button"
                  disabled={!editable}
                  onClick={() => jumpTo(crit.id)}
                  className={cn(
                    'block w-full border-t border-border px-4 py-3 text-left',
                    editable && 'hover:bg-accent',
                    issues && editable && 'bg-red-50/60',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="whitespace-pre-line text-[13px] font-medium leading-snug text-foreground">{crit.title}</div>
                    <div className={cn('shrink-0 text-sm font-bold', !na && row?.score == null && 'text-destructive')}>
                      {na ? 'N/A' : row?.score != null ? `${fmt(row.score)} / ${fmt(crit.marks)}` : `-- / ${fmt(crit.marks)}`}
                    </div>
                  </div>
                  {issues && editable && (
                    <div className="mt-1 text-xs font-medium text-destructive">{issues.join(', ')}</div>
                  )}
                  {(row?.comment || photos.length > 0) && (
                    <div className="mt-2">
                      {row?.comment && <div className="text-xs italic text-muted-foreground">{row.comment}</div>}
                      {photos.length > 0 && (
                        <div className="mt-1.5 flex gap-1.5 overflow-x-auto">
                          {photos.map((a) => <AttachmentThumb key={a.id} att={a} />)}
                        </div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}

      <div className="mb-4">
        <label className="mb-1 block text-[11.5px] font-semibold text-foreground/80">Overall remarks</label>
        <Textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          onBlur={saveRemarks}
          readOnly={!editable}
          placeholder={editable ? 'Anything else the store manager should know?' : 'No remarks'}
          rows={3}
        />
      </div>

      <div
        className="sticky -bottom-10 z-10 -mx-4 flex gap-2 border-t border-border bg-card px-4 py-3 md:mx-0 md:rounded-lg md:border"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        {editable ? (
          <>
            <Button variant="outline" className="h-11 flex-1" onClick={() => navigate(`/sop-audits/${id}`)}>Back to questions</Button>
            <Button className="h-11 flex-1" disabled={found.length > 0} onClick={() => setConfirmOpen(true)}>Submit audit</Button>
          </>
        ) : (
          <div className="flex w-full gap-2">
            <Button variant="outline" className="h-11 flex-1" onClick={() => navigate(-1)}>Back</Button>
            {audit.store_id && (
              <Button variant="outline" className="h-11 flex-1" onClick={() => navigate(storeScorecardLink(audit.store_id, role))}>
                Store dashboard
              </Button>
            )}
          </div>
        )}
      </div>

      <Modal open={confirmOpen} onClose={() => !submitting && setConfirmOpen(false)}>
        <ModalTitle>Submit this audit?</ModalTitle>
        <p className="text-sm text-muted-foreground">
          Score {fmt(summary.score)} / {fmt(summary.max_score)} ({fmt(summary.percent)}%).
          You will not be able to change it after submitting.
          {!online && ' You are offline, so it will be sent as soon as you reconnect.'}
        </p>
        <ModalActions>
          <Button variant="outline" disabled={submitting} onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button disabled={submitting} onClick={submit}>{submitting ? 'Submitting...' : 'Submit'}</Button>
        </ModalActions>
      </Modal>
    </div>
  );
}
