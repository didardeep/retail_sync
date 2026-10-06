import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { api } from '../api/client'
import { ErrorNote, Loading } from '../components/Loader'
import { useApi } from '../components/useApi'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { sColor, sBadge, pbClass, prC } from '../utils/helpers'

const ANSWERS = ['Yes', 'No', 'Partial', 'NA']
const RISKS   = ['', 'Low', 'Medium', 'High', 'Critical']

const ANS_STYLE = {
  Yes:     'border-emerald-500 bg-emerald-50 text-emerald-700',
  No:      'border-red-500 bg-red-50 text-red-700',
  Partial: 'border-amber-500 bg-amber-50 text-amber-700',
  NA:      'border-slate-400 bg-slate-100 text-slate-500',
}
const ANS_IDLE = 'border-border bg-card text-muted-foreground hover:bg-muted/60'

export default function AuditExecution({ readOnly = false }) {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { data, error, loading, reload } = useApi(() => api.audit(id), [id])
  const [saving, setSaving]         = useState(null)
  const [submitError, setSubmitError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  if (loading) return <Loading what="audit" />
  if (error)   return <ErrorNote error={error} />

  const responses = data.responses || []
  const answered  = responses.filter(r => r.answer).length
  const pct       = responses.length ? Math.round((answered / responses.length) * 100) : 0
  const locked    = readOnly || ['Completed', 'Approved'].includes(data.status)

  // Group by process
  const grouped = responses.reduce((acc, r) => {
    const key = r.process || 'General'
    ;(acc[key] = acc[key] || []).push(r)
    return acc
  }, {})

  async function save(resp, patch) {
    setSaving(resp.id)
    try {
      await api.answer(id, resp.id, patch)
      await reload()
    } finally {
      setSaving(null)
    }
  }

  async function submit() {
    setSubmitError(null)
    setSubmitting(true)
    try {
      const result = await api.submitAudit(id)
      await reload()
      alert(
        `Audit submitted. Score: ${result.audit.score}%.\n` +
        `${result.issues_raised} action item(s) raised for the store manager.`
      )
      navigate('/audits')
    } catch (e) {
      setSubmitError(e)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(-1)}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted/60"
              title="Back"
            >
              &#8592;
            </button>
            <h2 className="text-xl font-bold tracking-tight text-foreground">{data.store}</h2>
            <Badge className={cn('text-[11px]', sBadge(data.status))}>{data.status}</Badge>
            {data.score != null && (
              <span
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold"
                style={{ border: `2px solid ${sColor(data.score)}`, color: sColor(data.score) }}
              >
                {data.score}%
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {data.id} &middot; {data.city}
            {data.auditor && ` · Auditor: ${data.auditor}`}
            {data.scheduled_at && ` · ${data.scheduled_at.substring(0, 10)}`}
          </p>
        </div>
        {!locked && (
          <Button
            onClick={submit}
            disabled={answered < responses.length || submitting}
            className="shrink-0"
          >
            {submitting ? 'Submitting…' : 'Submit Audit'}
          </Button>
        )}
      </div>

      {/* ── Progress bar ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card px-5 py-4">
        <div className="mb-2 flex items-center justify-between text-[13px]">
          <span className="font-semibold text-foreground">
            {answered} <span className="font-normal text-muted-foreground">of</span> {responses.length} answered
          </span>
          <span className="font-bold" style={{ color: sColor(pct) }}>{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full transition-all', pbClass(pct))}
            style={{ width: `${pct}%` }}
          />
        </div>
        {!locked && answered < responses.length && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Answer all {responses.length - answered} remaining question(s) to submit.
          </p>
        )}
        {submitError && <ErrorNote error={submitError} />}
      </div>

      {/* ── Questions grouped by process ───────────────────────────────── */}
      {Object.entries(grouped).map(([process, items]) => (
        <div key={process} className="space-y-3">
          {/* Process heading */}
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
              {process}
            </span>
            <div className="flex-1 border-t border-border" />
            <span className="text-[11px] text-muted-foreground">
              {items.filter(r => r.answer).length}/{items.length}
            </span>
          </div>

          {items.map((r, idx) => {
            const isSaving = saving === r.id
            return (
              <div
                key={r.id}
                className={cn(
                  'rounded-xl border bg-card p-4 shadow-sm transition-colors',
                  r.answer
                    ? 'border-border'
                    : 'border-amber-200 bg-amber-50/40'
                )}
              >
                {/* Question header */}
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    {r.question_code && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                        {r.question_code}
                      </span>
                    )}
                    {r.is_critical && (
                      <Badge className="bg-red-50 text-red-700 text-[10px]">Critical</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {r.risk && (
                      <Badge className={cn('text-[10px]', prC(r.risk))}>{r.risk} risk</Badge>
                    )}
                    <span className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Wt {r.weight}
                    </span>
                  </div>
                </div>

                {/* Question text */}
                <p className="mb-3 text-[13.5px] font-medium leading-snug text-foreground">
                  {r.question_text}
                </p>

                {/* Answer buttons */}
                <div className="mb-3 flex flex-wrap gap-2">
                  {ANSWERS.map(a => (
                    <button
                      key={a}
                      disabled={locked || isSaving}
                      onClick={() => save(r, { answer: a })}
                      className={cn(
                        'rounded-lg border px-4 py-1.5 text-[12px] font-semibold transition-colors',
                        r.answer === a ? ANS_STYLE[a] : ANS_IDLE,
                        (locked || isSaving) && 'cursor-not-allowed opacity-60'
                      )}
                    >
                      {a}
                    </button>
                  ))}
                  {isSaving && (
                    <span className="self-center text-[11px] text-muted-foreground">Saving…</span>
                  )}
                </div>

                {/* Remarks / Risk / Evidence row */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {/* Remarks */}
                  <div className="sm:col-span-1">
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                      Remarks / Observation
                    </label>
                    <textarea
                      rows={2}
                      defaultValue={r.remarks || ''}
                      disabled={locked}
                      placeholder="Add observation…"
                      onBlur={e => !locked && e.target.value !== (r.remarks || '') &&
                        save(r, { remarks: e.target.value })}
                      className={cn(
                        'w-full resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary',
                        locked && 'cursor-not-allowed opacity-60'
                      )}
                    />
                  </div>

                  {/* Risk */}
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                      Risk Level
                    </label>
                    <select
                      value={r.risk || ''}
                      disabled={locked}
                      onChange={e => save(r, { risk: e.target.value })}
                      className={cn(
                        'w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary',
                        locked && 'cursor-not-allowed opacity-60'
                      )}
                    >
                      {RISKS.map(x => <option key={x} value={x}>{x || '— None —'}</option>)}
                    </select>
                  </div>

                  {/* Evidence */}
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                      Evidence URL
                    </label>
                    <input
                      type="text"
                      defaultValue={r.evidence?.[0]?.url || ''}
                      disabled={locked}
                      placeholder="Paste photo / video link"
                      onBlur={e => {
                        const url = e.target.value.trim()
                        if (locked || !url) return
                        const type = /\.(mp4|mov|webm)$/i.test(url) ? 'video' : 'photo'
                        save(r, { evidence: [{ type, url }] })
                      }}
                      className={cn(
                        'w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary',
                        locked && 'cursor-not-allowed opacity-60'
                      )}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {/* ── Bottom submit (repeat for long pages) ─────────────────────── */}
      {!locked && responses.length > 5 && (
        <div className="flex items-center justify-end gap-3 rounded-xl border border-border bg-card px-5 py-3">
          <span className="text-[12px] text-muted-foreground">{answered}/{responses.length} answered</span>
          <Button
            onClick={submit}
            disabled={answered < responses.length || submitting}
          >
            {submitting ? 'Submitting…' : 'Submit Audit'}
          </Button>
        </div>
      )}

      {/* ── Read-only banner ──────────────────────────────────────────── */}
      {locked && (
        <div className="rounded-xl border border-border bg-muted/40 px-5 py-3 text-center text-[12px] text-muted-foreground">
          This audit is <span className="font-semibold">{data.status}</span> — read-only view.
        </div>
      )}
    </div>
  )
}
