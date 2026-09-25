import { useState, useEffect } from 'react'
import { Line } from 'react-chartjs-2'
import { useToast } from '../components/Toast'
import { api } from '../api/client'
import { avC, sColor, pbClass, exportCSV } from '../utils/helpers'
import { cn, fieldClass, labelClass } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Modal, ModalTitle, ModalActions } from '../components/Modal'

const PP = 7

export default function Stores() {
  const toast = useToast()
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  /* modals */
  const [insightOpen, setInsightOpen] = useState(false)
  const [insightStore, setInsightStore] = useState(null)
  const [siTab, setSiTab] = useState('info')

  const [scoreMap, setScoreMap] = useState({})
  const [selectedQ, setSelectedQ] = useState('q4')

  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ name: '', city: '', format: 'COCO', type: 'Standard', manager: '', region: 'North India', status: 'Operating' })

  useEffect(() => {
    Promise.all([
      api.stores().catch(() => []),
      api.storeScores().catch(() => []),
    ]).then(([s, scores]) => {
      const normalized = (s || []).map(st => ({
        ...st,
        format: st.format || st.store_format || '',
        type: st.type || st.store_type || '',
        manager: st.manager || '',
      }))
      setStores(normalized)
      const map = {}
      for (const sc of (scores || [])) map[sc.store_id] = sc
      setScoreMap(map)
      setLoading(false)
    })
  }, [])

  function storeScore(s) {
    const sc = scoreMap[s.id]
    if (!sc) return 0
    return sc[selectedQ] || 0
  }
  function qScores(s) {
    const sc = scoreMap[s.id] || {}
    return [sc.q1 || 0, sc.q2 || 0, sc.q3 || 0, sc.q4 || 0]
  }

  /* ── derived ── */
  const filtered = stores.filter(s => {
    if (search) {
      const q = search.toLowerCase()
      if (!(s.name||'').toLowerCase().includes(q) && !(s.city||'').toLowerCase().includes(q)) return false
    }
    if (statusFilter && s.status !== statusFilter) return false
    return true
  })
  const totalPages = Math.ceil(filtered.length / PP) || 1
  const safePage = page > totalPages ? 1 : page
  const pageData = filtered.slice((safePage - 1) * PP, safePage * PP)

  const totalStores = stores.length
  const operational = stores.filter(s => s.status === 'Operating').length
  const criticalAudit = stores.filter(s => storeScore(s) < 60).length
  const avgScore = totalStores ? Math.round(stores.reduce((a, s) => a + storeScore(s), 0) / totalStores) : 0

  /* ── handlers ── */
  function handleTabFilter(f) {
    setStatusFilter(f)
    setPage(1)
  }

  function openInsight(id) {
    const s = stores.find(x => x.id === id)
    if (!s) return
    setInsightStore(s)
    setSiTab('info')
    setInsightOpen(true)
  }

  function openAdd() {
    setEditId(null)
    setForm({ name: '', city: '', format: 'COCO', type: 'Standard', manager: '', region: 'North India', status: 'Operating' })
    setFormOpen(true)
  }

  function openEdit(id) {
    const s = stores.find(x => x.id === id)
    if (!s) return
    setEditId(id)
    setForm({ name: s.name, city: s.city, format: s.format || 'COCO', type: s.type || 'Standard', manager: s.manager || '', region: s.region || 'North India', status: s.status || 'Operating' })
    setFormOpen(true)
  }

  function saveStore() {
    if (!form.name.trim() || !form.city.trim()) { alert('Fill in name and city'); return }
    if (editId) {
      setStores(prev => prev.map(s => s.id === editId ? { ...s, name: form.name.trim(), city: form.city.trim(), format: form.format, type: form.type, manager: form.manager || 'Unassigned', region: form.region, status: form.status } : s))
      api.updateStore(editId, { name: form.name.trim(), city: form.city.trim(), format: form.format, type: form.type, region: form.region, status: form.status }).catch(() => {})
      toast('Store updated')
    } else {
      const newId = 'ST' + String(stores.length + 1).padStart(3, '0')
      setStores(prev => [...prev, { id: newId, name: form.name.trim(), city: form.city.trim(), region: form.region, format: form.format, type: form.type, manager: form.manager || 'Unassigned', status: form.status, contact: '', email: '', address: '' }])
      toast('Store added')
    }
    setFormOpen(false)
    setEditId(null)
  }

  function deleteStore(id) {
    if (!window.confirm('Delete store?')) return
    setStores(prev => prev.filter(s => s.id !== id))
    toast('Store deleted')
  }

  function handleExport() {
    const headers = ['ID', 'Store', 'City', 'Region', 'Format', 'Manager', 'Status', 'Latest Score']
    const rows = stores.map(s => [s.id, s.name, s.city, s.region, s.format, s.manager, s.status, storeScore(s)])
    exportCSV(rows, headers, 'stores.csv')
    toast('CSV exported')
  }

  /* ── chart data for insight modal ── */
  function perfChartData(s) {
    return {
      labels: ['Q1', 'Q2', 'Q3', 'Q4'],
      datasets: [{
        label: 'Score',
        data: qScores(s),
        borderColor: '#00338D',
        backgroundColor: 'rgba(0,51,141,.1)',
        borderWidth: 2,
        tension: 0.1,
        fill: true
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

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground">Loading stores...</div>
  }

  /* ── render ── */
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2 className="text-xl font-bold text-foreground">Store Management</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Manage your retail locations &bull; {selectedQ.toUpperCase()}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {['q1','q2','q3','q4'].map(q => (
            <Button key={q} size="sm" variant={selectedQ === q ? 'default' : 'outline'} onClick={() => setSelectedQ(q)}>{q.toUpperCase()}</Button>
          ))}
          <Button size="sm" variant="outline" onClick={handleExport}>&#x2B07; Export</Button>
          <Button size="sm" onClick={openAdd}>+ Add Store</Button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4"><div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{ background: '#e8eefa' }}>&#x1F3EA;</div><div><div className="mb-0.5 text-[11px] text-muted-foreground">Total Stores</div><div className="text-2xl font-bold leading-none text-foreground">{totalStores}</div></div></div>
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4"><div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{ background: '#ecfdf5' }}>&uarr;</div><div><div className="mb-0.5 text-[11px] text-muted-foreground">Operational</div><div className="text-2xl font-bold leading-none text-foreground">{operational}</div></div></div>
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4"><div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{ background: '#fde8e8' }}>&#x26A0;</div><div><div className="mb-0.5 text-[11px] text-muted-foreground">Critical Audit</div><div className="text-2xl font-bold leading-none text-foreground">{criticalAudit}</div></div></div>
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4"><div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{ background: '#f3f4f6' }}>&#x25CC;</div><div><div className="mb-0.5 text-[11px] text-muted-foreground">Avg. Audit Score</div><div className="text-2xl font-bold leading-none text-foreground">{avgScore}%</div></div></div>
      </div>

      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <div className="relative max-w-[360px] flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">&#x1F50D;</span>
          <Input className="pl-8" placeholder="Search name, ID or city..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <div className="flex items-center gap-1.5">
          <button className={cn('rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground', statusFilter === '' && 'border-primary bg-primary text-primary-foreground')} onClick={() => handleTabFilter('')}>All</button>
          <button className={cn('rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground', statusFilter === 'Operating' && 'border-primary bg-primary text-primary-foreground')} onClick={() => handleTabFilter('Operating')}>Operating</button>
          <button className={cn('rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground', statusFilter === 'Dehired' && 'border-primary bg-primary text-primary-foreground')} onClick={() => handleTabFilter('Dehired')}>Dehired</button>
          <button className="flex h-[30px] w-[30px] items-center justify-center rounded-md border border-border bg-card text-[13px]" onClick={() => { setSearch(''); setStatusFilter(''); setPage(1) }}>&#x1F504;</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Store Details</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>{selectedQ.toUpperCase()} Score</TableHead>
              <TableHead>Manager</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageData.map(s => (
              <TableRow key={s.id} className="cursor-pointer" onClick={() => openInsight(s.id)}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="flex h-[26px] w-[26px] items-center justify-center rounded-md text-xs" style={{ background: '#e8eefa' }}>&#x1F3EA;</div>
                    <div>
                      <div className="flex items-center gap-1.5 font-semibold">{s.name}{s.type && <span className="rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[10.5px] font-medium text-gray-700">{s.type}</span>}</div>
                      <div className="text-[11px] text-muted-foreground">{s.city}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell><Badge className={s.status === 'Operating' ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-muted-foreground border border-border'}>{s.status}</Badge></TableCell>
                <TableCell>
                  <div className="mb-1 text-[15px] font-bold" style={{ color: sColor(storeScore(s)) }}>{storeScore(s)}%</div>
                  <div className="h-1.5 w-[130px] overflow-hidden rounded-[3px] bg-gray-200"><div className={cn('h-full rounded-[3px]', pbClass(storeScore(s)))} style={{ width: `${storeScore(s)}%` }} /></div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <div className={cn('flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white', avC(s.manager||'U'))}>{(s.manager || 'U')[0]}</div>
                    <span className="text-[12.5px]">{s.manager}</span>
                  </div>
                </TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  <div className="flex gap-1">
                    <button className="flex h-[25px] w-[25px] items-center justify-center rounded-md border border-border bg-card text-[11px]" onClick={() => openInsight(s.id)}>&#x1F441;</button>
                    <button className="flex h-[25px] w-[25px] items-center justify-center rounded-md border border-border bg-card text-[11px]" onClick={() => openEdit(s.id)}>&#x270F;&#xFE0F;</button>
                    <button className="flex h-[25px] w-[25px] items-center justify-center rounded-md border border-border bg-card text-[11px] text-destructive" onClick={() => deleteStore(s.id)}>&#x1F5D1;</button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-3 flex items-center justify-end gap-1 text-xs text-muted-foreground">
        <span className="mr-2">{filtered.length} stores</span>
        <div className="flex gap-1">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
            <button key={n} className={cn('flex h-[27px] w-[27px] items-center justify-center rounded-md border border-border bg-card text-xs text-foreground/80', n === safePage && 'border-primary bg-primary text-primary-foreground')} onClick={() => setPage(n)}>{n}</button>
          ))}
        </div>
      </div>

      {insightStore && (
        <Modal open={insightOpen} onClose={() => setInsightOpen(false)} className="w-[480px] p-0">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <span className="text-[13px] font-semibold text-muted-foreground">Store Insights</span>
            <button className="flex h-[26px] w-[26px] items-center justify-center rounded-md text-[13px]" onClick={() => setInsightOpen(false)}>&times;</button>
          </div>
          <div className="border-b border-border px-5 pb-4 pt-[22px] text-center">
            <div className="mx-auto mb-3 flex h-[52px] w-[52px] items-center justify-center rounded-xl bg-accent text-[22px] text-primary">&#x1F3EC;</div>
            <div className="text-base font-bold text-foreground">{insightStore.name}</div>
            <div className="mt-2 inline-block rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold text-primary">
              {'SI-' + (1000 + parseInt(insightStore.id.replace('ST', ''), 10) - 1)}
            </div>
          </div>
          <div className="flex border-b border-border px-5">
            <div className={cn('cursor-pointer border-b-2 border-transparent px-4 py-2.5 text-[12.5px] font-semibold text-muted-foreground', siTab === 'info' && 'border-primary text-primary')} onClick={() => setSiTab('info')}>General Info</div>
            <div className={cn('cursor-pointer border-b-2 border-transparent px-4 py-2.5 text-[12.5px] font-semibold text-muted-foreground', siTab === 'perf' && 'border-primary text-primary')} onClick={() => setSiTab('perf')}>Performance</div>
          </div>
          <div className="px-5 pb-1.5 pt-4">
            {siTab === 'info' && (
              <div>
                <div className="grid grid-cols-[120px_1fr] gap-3.5 border-b border-border py-2.5 text-sm last:border-0"><span className="text-muted-foreground">Manager</span><span className="font-semibold text-foreground">{insightStore.manager || '—'}</span></div>
                <div className="grid grid-cols-[120px_1fr] gap-3.5 border-b border-border py-2.5 text-sm last:border-0"><span className="text-muted-foreground">Type of Store</span><span className="font-semibold text-foreground">{insightStore.type || '—'}</span></div>
                <div className="grid grid-cols-[120px_1fr] gap-3.5 border-b border-border py-2.5 text-sm last:border-0"><span className="text-muted-foreground">Location</span><span className="font-semibold text-foreground">{insightStore.city}{insightStore.region ? ', ' + insightStore.region : ''}</span></div>
                <div className="grid grid-cols-[120px_1fr] gap-3.5 border-b border-border py-2.5 text-sm last:border-0"><span className="text-muted-foreground">Contact</span><span className="font-semibold text-foreground">{insightStore.contact || '—'}</span></div>
                <div className="grid grid-cols-[120px_1fr] gap-3.5 border-b border-border py-2.5 text-sm last:border-0"><span className="text-muted-foreground">Email</span><span className="font-semibold text-foreground">{insightStore.email || '—'}</span></div>
                <div className="grid grid-cols-[120px_1fr] gap-3.5 py-2.5 text-sm"><span className="text-muted-foreground">Address</span><span className="font-semibold text-foreground">{insightStore.address || '—'}</span></div>
              </div>
            )}
            {siTab === 'perf' && (
              <div className="relative w-full" style={{ height: 170 }}><Line data={perfChartData(insightStore)} options={chartOpts} /></div>
            )}
          </div>
          <ModalActions>
            <Button size="sm" variant="outline" onClick={() => setInsightOpen(false)}>Close</Button>
            <Button size="sm" onClick={() => setInsightOpen(false)}>Full History</Button>
          </ModalActions>
        </Modal>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)}>
        <ModalTitle>{editId ? 'Edit Store' : 'Add New Store'}</ModalTitle>
        <div className="grid gap-3">
          <div><label className={labelClass}>Store Name</label><Input placeholder="e.g. Phoenix Mall" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div><label className={labelClass}>City</label><Input placeholder="e.g. Mumbai" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
          <div><label className={labelClass}>Format</label><select className={fieldClass} value={form.format} onChange={e => setForm(f => ({ ...f, format: e.target.value }))}><option>COCO</option><option>COFO</option><option>FOCO</option><option>FOFO</option></select></div>
          <div><label className={labelClass}>Type of Store</label><select className={fieldClass} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}><option>Flagship</option><option>Standard</option><option>Compact</option><option>Kiosk</option></select></div>
          <div><label className={labelClass}>Manager</label><Input placeholder="Manager name" value={form.manager} onChange={e => setForm(f => ({ ...f, manager: e.target.value }))} /></div>
          <div><label className={labelClass}>Region</label><select className={fieldClass} value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))}><option>North India</option><option>South India</option><option>East India</option><option>West India</option></select></div>
          <div><label className={labelClass}>Status</label><select className={fieldClass} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}><option>Operating</option><option>Dehired</option></select></div>
        </div>
        <ModalActions>
          <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
          <Button onClick={saveStore}>{editId ? 'Save Changes' : 'Add Store'}</Button>
        </ModalActions>
      </Modal>
    </>
  )
}
