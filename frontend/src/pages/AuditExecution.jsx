import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { api } from '../api/client'
import { ErrorNote, Loading } from '../components/Loader'
import { useApi } from '../components/useApi'

const ANSWERS = ['Yes', 'No', 'Partial', 'NA']
const RISKS = ['', 'Low', 'Medium', 'High', 'Critical']

/**
 * The auditor's main screen and the only place answers are captured.
 * Passing `readOnly` renders the same layout for an Audit Manager reviewing
 * a submitted audit.
 */
export default function AuditExecution({ readOnly = false }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, error, loading, reload } = useApi(() => api.audit(id), [id])
  const [saving, setSaving] = useState(null)
  const [submitError, setSubmitError] = useState(null)

  if (loading) return <Loading what="audit" />
  if (error) return <ErrorNote error={error} />

  const responses = data.responses || []
  const answered = responses.filter((r) => r.answer).length
  const pct = responses.length ? Math.round((answered / responses.length) * 100) : 0
  const locked = readOnly || ['Completed', 'Approved'].includes(data.status)

  async function save(resp, patch) {
    setSaving(resp.id)
    try {
      await api.answer(id, resp.id, { ...patch })
      await reload()
    } finally {
      setSaving(null)
    }
  }

  async function submit() {
    setSubmitError(null)
    try {
      const result = await api.submitAudit(id)
      alert(
        `Submitted. Score: ${result.audit.score}%. ` +
        `${result.issues_raised} action(s) raised for the store manager.`,
      )
      navigate('/my-audits')
    } catch (e) {
      setSubmitError(e)
    }
  }

  return (
    <>
      <h2 className="page-title">{data.store}</h2>
      <p className="page-sub">
        {data.id} · {data.city} · {data.status}
        {data.score != null && ` · Score ${data.score}%`}
      </p>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <strong>{answered} of {responses.length} answered</strong>
          <span className="muted">{pct}%</span>
        </div>
        <div className="progress"><div style={{ width: `${pct}%` }} /></div>
        {!locked && (
          <div style={{ marginTop: 14 }}>
            <button className="btn" onClick={submit} disabled={answered < responses.length}>
              Submit audit
            </button>
            {answered < responses.length && (
              <span className="muted" style={{ marginLeft: 10 }}>
                Answer every question before submitting.
              </span>
            )}
            <ErrorNote error={submitError} />
          </div>
        )}
      </div>

      {responses.map((r) => (
        <div className="q-card" key={r.id}>
          <div className="q-head">
            <div>
              <span className="muted">{r.question_code} · {r.process}</span>
              {r.is_critical && <span className="badge red" style={{ marginLeft: 8 }}>Critical</span>}
            </div>
            <span className="badge">Weight {r.weight}</span>
          </div>
          <div className="q-text">{r.question_text}</div>

          <div className="answers">
            {ANSWERS.map((a) => (
              <button
                key={a}
                disabled={locked || saving === r.id}
                className={`${r.answer === a ? 'on' : ''} ${a === 'No' ? 'no' : ''}`}
                onClick={() => save(r, { answer: a })}
              >
                {a}
              </button>
            ))}
          </div>

          <div className="row">
            <label className="field" style={{ flex: 3 }}>
              <span>Remarks / observation</span>
              <textarea
                defaultValue={r.remarks || ''}
                disabled={locked}
                onBlur={(e) => !locked && e.target.value !== (r.remarks || '')
                  && save(r, { remarks: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Risk</span>
              <select
                value={r.risk || ''}
                disabled={locked}
                onChange={(e) => save(r, { risk: e.target.value })}
              >
                {RISKS.map((x) => <option key={x} value={x}>{x || '—'}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Evidence (photo / video URL)</span>
              <input
                defaultValue={(r.evidence?.[0]?.url) || ''}
                disabled={locked}
                placeholder="Paste or upload link"
                onBlur={(e) => {
                  const url = e.target.value.trim()
                  if (locked || !url) return
                  const type = /\.(mp4|mov|webm)$/i.test(url) ? 'video' : 'photo'
                  save(r, { evidence: [{ type, url }] })
                }}
              />
            </label>
          </div>
        </div>
      ))}
    </>
  )
}
