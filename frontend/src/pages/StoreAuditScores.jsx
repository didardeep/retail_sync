import { useState, useEffect } from 'react'
import { Line } from 'react-chartjs-2'
import { api } from '../api/client'
import { sColor, pbClass, exportCSV } from '../utils/helpers'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Modal, ModalActions } from '../components/Modal'

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4']
const SCORE_GRID = 'grid-cols-[2fr_1fr_1.5fr_1.5fr_1.5fr_1.5fr_70px]'

function deltaDisplay(curr, prev) {
  if (prev === undefined || prev === null || prev === 0) return ''
  const d = curr - prev
  if (d > 0) return <span className="rounded-[5px] bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">+{d}</span>
  if (d < 0) return <span className="rounded-[5px] bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">{d}</span>
  return <span className="rounded-[5px] bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-500">0</span>
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
      <div className="overflow-hidden rounded-[10px] border border-border bg-card">
        {/* Header row */}
        <div className={cn('grid items-center gap-2.5 border-b border-border bg-gray-50 px-3 py-2.5', SCORE_GRID)}>
          <span className="text-[11.5px] font-semibold text-muted-foreground">Store Details</span>
          <span className="text-[11.5px] font-semibold text-muted-foreground">Status</span>
          {QUARTERS.map(q => (
            <span key={q} className="text-[11.5px] font-semibold text-muted-foreground">&#x1F4C5; {q} Score</span>
          ))}
          <span className="text-[11.5px] font-semibold text-muted-foreground">Actions</span>
        </div>

        {/* Data rows */}
        {filtered.map(s => {
          return (
            <div
              key={s.id}
              className={cn('grid cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2.5 last:border-0 hover:bg-[#fafbff]', SCORE_GRID)}
              onClick={() => setDetailStore(s)}
            >
              {/* Store details */}
              <div className="flex items-center gap-2">
                <img src="store-logo.jpg" alt="" className="h-[26px] w-[26px] rounded-md" onError={e => { e.target.style.display = 'none' }} />
                <div>
                  <div className="text-[12.5px] font-semibold">{s.name}</div>
                  <div className="text-[11px] text-muted-foreground">{s.city}</div>
                </div>
              </div>

              {/* Status */}
              <div>
                <Badge className={s.status === 'Operating' ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-muted-foreground border border-border'}>{s.status}</Badge>
              </div>

              {/* Score columns */}
              {QUARTERS.map((q, idx) => {
                const score = getScore(s, q)
                const prevScore = idx > 0 ? getScore(s, QUARTERS[idx - 1]) : null
                return (
                  <div key={q}>
                    <div className="mb-1">
                      <span className="text-base font-bold" style={{ color: sColor(score) }}>{score}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-[150px] overflow-hidden rounded-[3px] bg-gray-200">
                        <div className={cn('h-full rounded-[3px]', pbClass(score))} style={{ width: `${score}%` }} />
                      </div>
                      {deltaDisplay(score, prevScore)}
                    </div>
                  </div>
                )
              })}

              {/* Actions */}
              <button className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-border bg-card text-[11px]" onClick={e => { e.stopPropagation(); setDetailStore(s) }}>&#x1F441;</button>
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
        <Modal open={!!detailStore} onClose={() => setDetailStore(null)} className="w-[540px] p-0" >
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
                    <TableHead>Score</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {storeAudits(detailStore.name).map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-semibold">{a.id}</TableCell>
                      <TableCell>{a.scheduled_at?.substring(0,10) || a.sched}</TableCell>
                      <TableCell>
                        {a.score !== null && a.score !== undefined ? (
                          <span className="font-bold" style={{ color: sColor(a.score) }}>{a.score}%</span>
                        ) : (
                          <span className="text-muted-foreground">&mdash;</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline">View Report</Button>
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
    </>
  )
}
