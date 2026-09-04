import { useState } from 'react'

import { api } from '../api/client'
import { Empty, ErrorNote, Loading } from '../components/Loader'
import { useApi } from '../components/useApi'

/**
 * Store Manager view. They cannot re-prioritise or reassign — the backend
 * restricts them to recording what was done and attaching evidence.
 */
export default function MyActions() {
  const { data, error, loading, reload } = useApi(() => api.issues())
  const [busy, setBusy] = useState(null)

  if (loading) return <Loading what="your actions" />
  if (error) return <ErrorNote error={error} />
  if (!data.length) return <Empty>No actions assigned to your store.</Empty>

  async function update(issue, patch) {
    setBusy(issue.id)
    try {
      await api.updateIssue(issue.id, patch)
      await reload()
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <h2 className="page-title">My Actions</h2>
      <p className="page-sub">Observations raised against your store</p>

      {data.map((i) => (
        <div className="q-card" key={i.id}>
          <div className="q-head">
            <div>
              <strong>{i.title}</strong>
              <div className="muted">{i.process} · {i.sub_process}</div>
            </div>
            <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              <span className={`badge ${i.priority === 'Critical' ? 'red' : 'amber'}`}>
                {i.priority}
              </span>
              {i.overdue && <div><span className="badge red">Overdue</span></div>}
            </div>
          </div>
          <p>{i.description}</p>
          <p className="muted">Due {i.due_date || '—'}</p>

          <label className="field">
            <span>Action taken</span>
            <textarea
              defaultValue={i.action_taken || ''}
              disabled={busy === i.id}
              onBlur={(e) => e.target.value !== (i.action_taken || '')
                && update(i, { action_taken: e.target.value })}
            />
          </label>

          <div className="row">
            <label className="field">
              <span>Evidence (photo / video URL)</span>
              <input
                defaultValue={i.evidence?.[0]?.url || ''}
                placeholder="Paste or upload link"
                onBlur={(e) => {
                  const url = e.target.value.trim()
                  if (!url) return
                  const type = /\.(mp4|mov|webm)$/i.test(url) ? 'video' : 'photo'
                  update(i, { evidence: [{ type, url }] })
                }}
              />
            </label>
            <label className="field" style={{ maxWidth: 180 }}>
              <span>Status</span>
              <select value={i.status} onChange={(e) => update(i, { status: e.target.value })}>
                {['Open', 'In Progress', 'On Hold', 'Closed'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      ))}
    </>
  )
}
