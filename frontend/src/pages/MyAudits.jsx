import { Link } from 'react-router-dom'

import { api } from '../api/client'
import { Empty, ErrorNote, Loading } from '../components/Loader'
import { useApi } from '../components/useApi'

const TONE = { Planned: 'navy', Ongoing: 'amber', Completed: 'green', Approved: 'green' }

/** The auditor's landing page — only audits assigned to them. */
export default function MyAudits() {
  const { data, error, loading } = useApi(() => api.audits())
  if (loading) return <Loading what="your audits" />
  if (error) return <ErrorNote error={error} />
  if (!data.length) return <Empty>No audits assigned to you yet.</Empty>

  return (
    <>
      <h2 className="page-title">My Audits</h2>
      <p className="page-sub">Stores assigned to you</p>
      {data.map((a) => (
        <Link className="q-card" key={a.id} to={`/audits/${a.id}`} style={{ display: 'block' }}>
          <div className="q-head">
            <div>
              <strong>{a.store}</strong>
              <div className="muted">{a.id} · {a.city}</div>
            </div>
            <span className={`badge ${TONE[a.status] || ''}`}>{a.status}</span>
          </div>
          <div className="muted">
            {a.scheduled_at ? new Date(a.scheduled_at).toLocaleString() : 'Not scheduled'}
            {a.score != null && ` · Score ${a.score}%`}
          </div>
        </Link>
      ))}
    </>
  )
}
