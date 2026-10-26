import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Line } from 'react-chartjs-2'
import { api, loadSession } from '../api/client'
import { sColor, pbClass, exportCSV } from '../utils/helpers'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Modal, ModalActions } from '../components/Modal'
import { storeScorecardLink } from '@/lib/links'
import AuditReport from '@/components/audit/AuditReport'

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4']
const SCORE_GRID = 'grid-cols-[minmax(180px,2fr)_110px_repeat(4,minmax(140px,1fr))_56px]'

// Scores are shown with two decimals; a missing score is '--', never 0.
function fmtScore(v) {
  return typeof v === 'number' ? v.toFixed(2) : '--'
}

// Change from the previous quarter. Always rendered in a fixed-width slot (empty
// when there is nothing to compare) so the bars line up in every column and row.
function deltaDisplay(curr, prev) {
  if (typeof curr !== 'number' || typeof prev !== 'number') return null
  const d = Math.round((curr - prev) * 100) / 100
  const base = 'rounded-[5px] px-1.5 py-0.5 text-[10px] font-bold tabular-nums'
  if (d > 0) return <span className={cn(base, 'bg-emerald-100 text-emerald-700')}>+{d.toFixed(2)}</span>
  if (d < 0) return <span className={cn(base, 'bg-red-100 text-red-700')}>{d.toFixed(2)}</span>
  return <span className={cn(base, 'bg-gray-100 text-gray-500')}>0.00</span>
}

export default function StoreAuditScores() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const role = loadSession()?.user?.role
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [detailStore, setDetailStore] = useState(null)
  // The audit whose report is open; the store pop-up hides behind it and comes back on Back.
  const [reportId, setReportId] = useState(null)
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
      // open detail from ?id= query param
      const idParam = params.get('id')
      if (idParam) {
        const found = (s || []).find(x => x.id === idParam)
        if (found) setDetailStore(found)
      }
    })
  }, [])

  function getScore(store, quarter) {
    const v = scoreMap[store.id]?.[quarter.toLowerCase()]
    return typeof v === 'number' && v > 0 ? v : null
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
    const rows = filtered.map(s => [s.id, s.name, s.city, s.status, ...QUARTERS.map(q => {
      const v = getScore(s, q)
      return v === null ? '' : v.toFixed(2)
    })])
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
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `Score ${fmtScore(ctx.parsed.y)}` } } },
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
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground">Loading store scores...</div>
  }

  /* ── render ── */
  return (
    <>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2 className="text-xl font-bold text-foreground">Store Audit Scores</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Quarterly score analysis</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={handleExport}>&#x2B07; Export CSV</Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <div className="relative max-w-[260px] flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">&#x1F50D;</span>
          <Input className="pl-8" placeholder="Search stores..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <button className={cn('rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground', statusFilter === 'all' && 'border-primary bg-primary text-primary-foreground')} onClick={() => setStatusFilter('all')}>All</button>
            <button className={cn('rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground', statusFilter === 'open' && 'border-primary bg-primary text-primary-foreground')} onClick={() => setStatusFilter('open')}>Operating</button>
            <button className={cn('rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground', statusFilter === 'closed' && 'border-primary bg-primary text-primary-foreground')} onClick={() => setStatusFilter('closed')}>Dehired</button>
          </div>
          <button className="flex h-[30px] w-[30px] items-center justify-center rounded-md border border-border bg-card text-[13px]" onClick={handleRefresh}>&#x1F504;</button>
        </div>
      </div>

      {/* Score table */}
      <div className="overflow-x-auto rounded-[10px] border border-border bg-card">
        {/* Header row */}
        <div className={cn('grid min-w-[820px] items-center gap-2.5 border-b border-border bg-gray-50 px-3 py-2.5', SCORE_GRID)}>
          <span className="text-[11.5px] font-semibold text-muted-foreground">Store Details</span>
          <span className="text-center text-[11.5px] font-semibold text-muted-foreground">Status</span>
          {QUARTERS.map(q => (
            <span key={q} className="text-center text-[11.5px] font-semibold text-muted-foreground">&#x1F4C5; {q} Score</span>
          ))}
          <span className="text-center text-[11.5px] font-semibold text-muted-foreground">View</span>
        </div>

        {/* Data rows */}
        {filtered.map(s => {
          return (
            <div
              key={s.id}
              className={cn('grid min-w-[820px] cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2.5 last:border-0 hover:bg-[#fafbff]', SCORE_GRID)}
              onClick={() => setDetailStore(s)}
            >
              {/* Store details */}
              <div className="flex items-center gap-2">
                <img src="store-logo.jpg" alt="" className="h-[26px] w-[26px] rounded-md" onError={e => { e.target.style.display = 'none' }} />
                <div>
                  <button
                    className="text-left text-[12.5px] font-semibold text-primary hover:underline"
                    onClick={e => { e.stopPropagation(); navigate(storeScorecardLink(s.id, role)) }}
                  >
                    {s.name}
                  </button>
                  <div className="text-[11px] text-muted-foreground">{s.city}</div>
                </div>
              </div>

              {/* Status */}
              <div className="flex justify-center">
                {(() => {
                  const st = s.status || 'Operating'
                  return (
                    <Badge className={st === 'Operating'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-red-50 text-red-600 border border-red-200'}>
                      {st}
                    </Badge>
                  )
                })()}
              </div>

              {/* Score columns */}
              {QUARTERS.map((q, idx) => {
                const score = getScore(s, q)
                const prevScore = idx > 0 ? getScore(s, QUARTERS[idx - 1]) : null
                return (
                  <div key={q} className="flex justify-center">
                    <div className="grid w-[128px] grid-cols-[72px_52px] items-center gap-x-1 gap-y-1">
                      <span
                        className="text-base font-bold tabular-nums"
                        style={{ color: score === null ? 'var(--text3)' : sColor(score) }}
                      >
                        {fmtScore(score)}
                      </span>
                      <span />
                      <div className="h-1.5 w-[72px] overflow-hidden rounded-[3px] bg-gray-200">
                        {score !== null && <div className={cn('h-full rounded-[3px]', pbClass(score))} style={{ width: `${score}%` }} />}
                      </div>
                      <div className="flex justify-start">{deltaDisplay(score, prevScore)}</div>
                    </div>
                  </div>
                )
              })}

              {/* Actions */}
              <div className="flex justify-center">
                <button className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-border bg-card text-[11px]" onClick={e => { e.stopPropagation(); setDetailStore(s) }}>&#x1F441;</button>
              </div>
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="p-6 text-center text-[13px] text-muted-foreground">No stores found.</div>
        )}
      </div>

      {/* Pagination */}
      <div className="mt-3 flex justify-end text-xs text-muted-foreground">
        <span>{filtered.length} stores</span>
      </div>

      {/* ── Store Detail Modal ── */}
      {detailStore && (
        <Modal open={!!detailStore && !reportId} onClose={() => setDetailStore(null)} className="w-[540px] p-0" >
          {/* Modal header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <span className="text-[15px] font-bold text-foreground">{detailStore.name}, {detailStore.city}</span>
            <button className="flex h-[26px] w-[26px] items-center justify-center rounded-md text-[13px]" onClick={() => setDetailStore(null)}>&times;</button>
          </div>

          {/* Info grid */}
          <div className="border-b border-border px-5 py-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
              <div>
                <div className="mb-0.5 text-[10.5px] text-muted-foreground">Store ID</div>
                <div className="text-[12.5px] font-semibold text-foreground">{detailStore.id}</div>
              </div>
              <div>
                <div className="mb-0.5 text-[10.5px] text-muted-foreground">Region</div>
                <div className="text-[12.5px] font-semibold text-foreground">{detailStore.region}</div>
              </div>
              <div>
                <div className="mb-0.5 text-[10.5px] text-muted-foreground">Format</div>
                <div className="text-[12.5px] font-semibold text-foreground">{detailStore.format}</div>
              </div>
              <div>
                <div className="mb-0.5 text-[10.5px] text-muted-foreground">Type of Store</div>
                <div className="text-[12.5px] font-semibold text-foreground">{detailStore.type}</div>
              </div>
              <div className="col-span-2">
                <div className="mb-0.5 text-[10.5px] text-muted-foreground">Manager</div>
                <div className="text-[12.5px] font-semibold text-foreground">{detailStore.manager}</div>
              </div>
            </div>
          </div>

          {/* Score History chart */}
          <div className="border-b border-border px-5 py-4">
            <div className="mb-3 text-[13px] font-semibold text-foreground">Quarterly Score Trend</div>
            <div className="relative w-full" style={{ height: 180 }}>
              <Line data={chartData(detailStore)} options={chartOpts} />
            </div>
          </div>

          {/* Recent Audits */}
          <div className="px-5 py-4">
            <div className="mb-3 text-[13px] font-semibold text-foreground">Recent Audits</div>
            {storeAudits(detailStore.name).length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Audit ID</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {storeAudits(detailStore.name).map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-semibold">{a.id}</TableCell>
                      <TableCell className="tabular-nums">{a.scheduled_at?.substring(0,10) || a.sched}</TableCell>
                      <TableCell className="text-right">
                        {a.score !== null && a.score !== undefined ? (
                          <span className="font-bold tabular-nums" style={{ color: sColor(a.score) }}>{fmtScore(a.score)}%</span>
                        ) : (
                          <span className="text-muted-foreground">&mdash;</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setReportId(a.id)}>View Report</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-xs text-muted-foreground">No audits found for this store.</div>
            )}
          </div>

          {/* Close button */}
          <ModalActions>
            <Button size="sm" variant="outline" onClick={() => setDetailStore(null)}>Close</Button>
          </ModalActions>
        </Modal>
      )}

      {/* ── Audit report (opened from Recent Audits) ── */}
      <Modal open={!!reportId} onClose={() => setReportId(null)} className="w-[640px] max-w-[95vw]">
        <div className="mb-3.5 flex items-center justify-between">
          <span className="text-[15px] font-bold text-foreground">
            Audit report {reportId}{detailStore ? ` - ${detailStore.name}` : ''}
          </span>
          <button className="flex h-[26px] w-[26px] items-center justify-center rounded-md text-[13px]" onClick={() => setReportId(null)} aria-label="Close">&times;</button>
        </div>
        {reportId && <AuditReport auditId={reportId} />}
        <ModalActions>
          <Button size="sm" variant="outline" onClick={() => setReportId(null)}>Back to store</Button>
        </ModalActions>
      </Modal>
    </>
  )
}
