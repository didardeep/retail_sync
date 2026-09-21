import { useState, useEffect } from 'react'
import { Line } from 'react-chartjs-2'
import { api } from '../api/client'
import { sColor, pbClass, exportCSV } from '../utils/helpers'

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4']

function deltaDisplay(curr, prev) {
  if (prev === undefined || prev === null || prev === 0) return ''
  const d = curr - prev
  if (d > 0) return <span className="db-up">+{d}</span>
  if (d < 0) return <span className="db-dn">{d}</span>
  return <span className="db-fl">0</span>
}

export default function StoreAuditScores() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [detailStore, setDetailStore] = useState(null)
  const [stores, setStores] = useState([])
  const [audits, setAudits] = useState([])
  const [scoreMap, setScoreMap] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.stores().catch(() => []),
      api.audits().catch(() => []),
      api.storeScores().catch(() => []),
    ]).then(([s, a, scores]) => {
      setStores(s || [])
      setAudits(a || [])
      // Build lookup: store_id → {q1, q2, q3, q4}
      const map = {}
      for (const sc of (scores || [])) {
        map[sc.store_id] = sc
      }
      setScoreMap(map)
      setLoading(false)
    })
  }, [])

  function getScore(store, quarter) {
    const rec = scoreMap[store.id]
    if (!rec) return 0
    return rec[quarter.toLowerCase()] ?? 0
  }

  /* ── filtering ── */
  const filtered = stores.filter(s => {
    if (search) {
      const q = search.toLowerCase()
      if (!(s.name||'').toLowerCase().includes(q) && !(s.city||'').toLowerCase().includes(q)) return false
    }
    if (statusFilter === 'open' && s.status !== 'Operating') return false
    if (statusFilter === 'closed' && s.status !== 'Dehired') return false
    return true
  })

  /* ── handlers ── */
  function handleExport() {
    const headers = ['ID', 'Store', 'City', 'Status', ...QUARTERS]
    const rows = filtered.map(s => [s.id, s.name, s.city, s.status, ...QUARTERS.map(q => getScore(s, q))])
    exportCSV(rows, headers, 'store_audit_scores.csv')
  }

  function handleRefresh() {
    setSearch('')
    setStatusFilter('all')
  }

  /* ── chart config for detail modal ── */
  function chartData(s) {
    return {
      labels: QUARTERS,
      datasets: [{
        label: 'Score',
        data: QUARTERS.map(q => getScore(s, q)),
        borderColor: '#00338D',
        backgroundColor: 'rgba(0,51,141,.1)',
        borderWidth: 2,
        tension: 0.1,
        fill: true,
        pointBackgroundColor: '#00338D',
        pointRadius: 4
      }]
    }
  }
  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { min: 0, max: 100, ticks: { font: { size: 10 } } },
      x: { ticks: { font: { size: 10 } } }
    }
  }

  /* ── recent audits for detail ── */
  function storeAudits(storeName) {
    return audits.filter(a => a.store === storeName)
  }

  if (loading) {
    return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh',color:'var(--text3)'}}>Loading store scores...</div>
  }

  /* ── render ── */
  return (
    <>
      {/* Header */}
      <div className="page-hdr">
        <div>
          <h2>Store Audit Scores</h2>
          <p>Quarterly score analysis</p>
        </div>
        <div className="btn-row">
          <button className="btn btn-outline btn-sm" onClick={handleExport}>&#x2B07; Export CSV</button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar" style={{ justifyContent: 'space-between' }}>
        <div className="srch" style={{ maxWidth: 260 }}>
          <span className="srch-ic">&#x1F50D;</span>
          <input placeholder="Search stores..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={`qtab${statusFilter === 'all' ? ' active' : ''}`} onClick={() => setStatusFilter('all')}>All</button>
            <button className={`qtab${statusFilter === 'open' ? ' active' : ''}`} onClick={() => setStatusFilter('open')}>Operating</button>
            <button className={`qtab${statusFilter === 'closed' ? ' active' : ''}`} onClick={() => setStatusFilter('closed')}>Dehired</button>
          </div>
          <button className="icon-btn" onClick={handleRefresh}>&#x1F504;</button>
        </div>
      </div>

      {/* Score table */}
      <div className="tbl-card" style={{ '--score-cols': 4 }}>
        {/* Header row */}
        <div className="score-bar-row" style={{ background: '#fafafa', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text3)' }}>Store Details</span>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text3)' }}>Status</span>
          {QUARTERS.map(q => (
            <span key={q} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text3)' }}>&#x1F4C5; {q} Score</span>
          ))}
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text3)' }}>Actions</span>
        </div>

        {/* Data rows */}
        {filtered.map(s => {
          return (
            <div
              key={s.id}
              className="score-bar-row"
              style={{ cursor: 'pointer' }}
              onClick={() => setDetailStore(s)}
            >
              {/* Store details */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <img src="store-logo.jpg" alt="" style={{ width: 26, height: 26, borderRadius: 6 }} onError={e => { e.target.style.display = 'none' }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 12.5 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{s.city}</div>
                </div>
              </div>

              {/* Status */}
              <div>
                <span className={`badge ${s.status === 'Operating' ? 'bg' : 'bgr'}`}>{s.status}</span>
              </div>

              {/* Score columns */}
              {QUARTERS.map((q, idx) => {
                const score = getScore(s, q)
                const prevScore = idx > 0 ? getScore(s, QUARTERS[idx - 1]) : null
                return (
                  <div key={q}>
                    <div style={{ marginBottom: 4 }}>
                      <span className="sn" style={{ color: sColor(score) }}>{score}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div className="prog-bg" style={{ width: 150 }}>
                        <div className={`prog-fill ${pbClass(score)}`} style={{ width: `${score}%`, height: 6 }} />
                      </div>
                      {deltaDisplay(score, prevScore)}
                    </div>
                  </div>
                )
              })}

              {/* Actions */}
              <button className="icon-btn" style={{ width: 26, height: 26, fontSize: 11 }} onClick={e => { e.stopPropagation(); setDetailStore(s) }}>&#x1F441;</button>
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>No stores found.</div>
        )}
      </div>

      {/* Pagination */}
      <div className="pagination">
        <span>{filtered.length} stores</span>
      </div>

      {/* ── Store Detail Modal ── */}
      {detailStore && (
        <div className="modal-ov open" onClick={e => { if (e.target === e.currentTarget) setDetailStore(null) }}>
          <div className="modal" style={{ width: 540, padding: 0, overflow: 'hidden', maxHeight: '88vh', overflowY: 'auto' }}>
            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{detailStore.name}, {detailStore.city}</span>
              <button className="icon-btn" style={{ width: 26, height: 26, border: 'none', fontSize: 13 }} onClick={() => setDetailStore(null)}>&times;</button>
            </div>

            {/* Info grid */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
                <div>
                  <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 2 }}>Store ID</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{detailStore.id}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 2 }}>Region</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{detailStore.region}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 2 }}>Format</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{detailStore.format}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 2 }}>Type of Store</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{detailStore.type}</div>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 2 }}>Manager</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{detailStore.manager}</div>
                </div>
              </div>
            </div>

            {/* Score History chart */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Quarterly Score Trend</div>
              <div className="ch-wrap" style={{ height: 180 }}>
                <Line data={chartData(detailStore)} options={chartOpts} />
              </div>
            </div>

            {/* Recent Audits */}
            <div style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Recent Audits</div>
              {storeAudits(detailStore.name).length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Audit ID</th>
                      <th>Date</th>
                      <th>Score</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {storeAudits(detailStore.name).map(a => (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 600 }}>{a.id}</td>
                        <td>{a.scheduled_at?.substring(0,10) || a.sched}</td>
                        <td>
                          {a.score !== null && a.score !== undefined ? (
                            <span style={{ fontWeight: 700, color: sColor(a.score) }}>{a.score}%</span>
                          ) : (
                            <span style={{ color: 'var(--text3)' }}>&mdash;</span>
                          )}
                        </td>
                        <td>
                          <button className="btn btn-outline btn-sm">View Report</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>No audits found for this store.</div>
              )}
            </div>

            {/* Close button */}
            <div className="modal-actions" style={{ padding: '4px 20px 20px' }}>
              <button className="btn btn-outline btn-sm" onClick={() => setDetailStore(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
