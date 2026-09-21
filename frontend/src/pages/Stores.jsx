import { useState, useEffect } from 'react'
import { Line } from 'react-chartjs-2'
import { useToast } from '../components/Toast'
import { api } from '../api/client'
import { avC, sColor, pbClass, exportCSV } from '../utils/helpers'

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
    return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh',color:'var(--text3)'}}>Loading stores...</div>
  }

  /* ── render ── */
  return (
    <>
      <div className="page-hdr">
        <div>
          <h2>Store Management</h2>
          <p>Manage your retail locations &bull; {selectedQ.toUpperCase()}</p>
        </div>
        <div className="btn-row">
          {['q1','q2','q3','q4'].map(q => (
            <button key={q} className={`btn ${selectedQ === q ? 'btn-primary' : 'btn-outline'} btn-sm`} onClick={() => setSelectedQ(q)}>{q.toUpperCase()}</button>
          ))}
          <button className="btn btn-outline btn-sm" onClick={handleExport}>&#x2B07; Export</button>
          <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Store</button>
        </div>
      </div>

      <div className="kpi-row c4">
        <div className="kpi"><div className="kpi-ico" style={{ background: '#e8eefa' }}>&#x1F3EA;</div><div><div className="kpi-lbl">Total Stores</div><div className="kpi-val">{totalStores}</div></div></div>
        <div className="kpi"><div className="kpi-ico" style={{ background: '#ecfdf5' }}>&uarr;</div><div><div className="kpi-lbl">Operational</div><div className="kpi-val">{operational}</div></div></div>
        <div className="kpi"><div className="kpi-ico" style={{ background: '#fde8e8' }}>&#x26A0;</div><div><div className="kpi-lbl">Critical Audit</div><div className="kpi-val">{criticalAudit}</div></div></div>
        <div className="kpi"><div className="kpi-ico" style={{ background: '#f3f4f6' }}>&#x25CC;</div><div><div className="kpi-lbl">Avg. Audit Score</div><div className="kpi-val">{avgScore}%</div></div></div>
      </div>

      <div className="filter-bar" style={{ justifyContent: 'space-between' }}>
        <div className="srch" style={{ maxWidth: 360 }}>
          <span className="srch-ic">&#x1F50D;</span>
          <input placeholder="Search name, ID or city..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <button className={`qtab${statusFilter === '' ? ' active' : ''}`} onClick={() => handleTabFilter('')}>All</button>
          <button className={`qtab${statusFilter === 'Operating' ? ' active' : ''}`} onClick={() => handleTabFilter('Operating')}>Operating</button>
          <button className={`qtab${statusFilter === 'Dehired' ? ' active' : ''}`} onClick={() => handleTabFilter('Dehired')}>Dehired</button>
          <button className="icon-btn" onClick={() => { setSearch(''); setStatusFilter(''); setPage(1) }}>&#x1F504;</button>
        </div>
      </div>

      <div className="tbl-card">
        <table>
          <thead><tr><th>Store Details</th><th>Status</th><th>{selectedQ.toUpperCase()} Score</th><th>Manager</th><th>Actions</th></tr></thead>
          <tbody>
            {pageData.map(s => (
              <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => openInsight(s.id)}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 26, height: 26, background: '#e8eefa', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>&#x1F3EA;</div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{s.name}{s.type && <span className="chip">{s.type}</span>}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{s.city}</div>
                    </div>
                  </div>
                </td>
                <td><span className={`badge ${s.status === 'Operating' ? 'bg' : 'bgr'}`}>{s.status}</span></td>
                <td>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 3, color: sColor(storeScore(s)) }}>{storeScore(s)}%</div>
                  <div className="prog-bg" style={{ width: 130 }}><div className={`prog-fill ${pbClass(storeScore(s))}`} style={{ width: `${storeScore(s)}%`, height: 6 }} /></div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div className={`av ${avC(s.manager||'U')}`}>{(s.manager || 'U')[0]}</div>
                    <span style={{ fontSize: 12.5 }}>{s.manager}</span>
                  </div>
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', gap: 3 }}>
                    <button className="icon-btn" style={{ width: 25, height: 25, fontSize: 11 }} onClick={() => openInsight(s.id)}>&#x1F441;</button>
                    <button className="icon-btn" style={{ width: 25, height: 25, fontSize: 11 }} onClick={() => openEdit(s.id)}>&#x270F;&#xFE0F;</button>
                    <button className="icon-btn" style={{ width: 25, height: 25, fontSize: 11, color: 'var(--red)' }} onClick={() => deleteStore(s.id)}>&#x1F5D1;</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <span style={{ marginRight: 8 }}>{filtered.length} stores</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
            <button key={n} className={`pgbtn${n === safePage ? ' active' : ''}`} onClick={() => setPage(n)}>{n}</button>
          ))}
        </div>
      </div>

      {insightOpen && insightStore && (
        <div className="modal-ov open" onClick={e => { if (e.target === e.currentTarget) setInsightOpen(false) }}>
          <div className="modal" style={{ width: 480, padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text3)' }}>Store Insights</span>
              <button className="icon-btn" style={{ width: 26, height: 26, border: 'none', fontSize: 13 }} onClick={() => setInsightOpen(false)}>&times;</button>
            </div>
            <div style={{ padding: '22px 20px 16px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 52, height: 52, background: 'var(--accent-soft)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, margin: '0 auto 12px', color: 'var(--accent)' }}>&#x1F3EC;</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{insightStore.name}</div>
              <div style={{ display: 'inline-block', marginTop: 8, background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 11, fontWeight: 700, padding: '3px 11px', borderRadius: 20 }}>
                {'SI-' + (1000 + parseInt(insightStore.id.replace('ST', ''), 10) - 1)}
              </div>
            </div>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
              <div className={`si-tab${siTab === 'info' ? ' active' : ''}`} onClick={() => setSiTab('info')}>General Info</div>
              <div className={`si-tab${siTab === 'perf' ? ' active' : ''}`} onClick={() => setSiTab('perf')}>Performance</div>
            </div>
            <div style={{ padding: '16px 20px 6px' }}>
              {siTab === 'info' && (
                <div>
                  <div className="si-row"><span className="si-lbl">Manager</span><span className="si-val">{insightStore.manager || '\u2014'}</span></div>
                  <div className="si-row"><span className="si-lbl">Type of Store</span><span className="si-val">{insightStore.type || '\u2014'}</span></div>
                  <div className="si-row"><span className="si-lbl">Location</span><span className="si-val">{insightStore.city}{insightStore.region ? ', ' + insightStore.region : ''}</span></div>
                  <div className="si-row"><span className="si-lbl">Contact</span><span className="si-val">{insightStore.contact || '\u2014'}</span></div>
                  <div className="si-row"><span className="si-lbl">Email</span><span className="si-val">{insightStore.email || '\u2014'}</span></div>
                  <div className="si-row"><span className="si-lbl">Address</span><span className="si-val">{insightStore.address || '\u2014'}</span></div>
                </div>
              )}
              {siTab === 'perf' && (
                <div className="ch-wrap" style={{ height: 170 }}><Line data={perfChartData(insightStore)} options={chartOpts} /></div>
              )}
            </div>
            <div className="modal-actions" style={{ padding: '4px 20px 20px', marginTop: 8 }}>
              <button className="btn btn-outline btn-sm" onClick={() => setInsightOpen(false)}>Close</button>
              <button className="btn btn-primary btn-sm" onClick={() => setInsightOpen(false)}>Full History</button>
            </div>
          </div>
        </div>
      )}

      {formOpen && (
        <div className="modal-ov open" onClick={e => { if (e.target === e.currentTarget) setFormOpen(false) }}>
          <div className="modal">
            <div className="modal-title">{editId ? 'Edit Store' : 'Add New Store'}</div>
            <div className="fg"><label className="fl">Store Name</label><input className="fi" placeholder="e.g. Phoenix Mall" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="fg"><label className="fl">City</label><input className="fi" placeholder="e.g. Mumbai" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
            <div className="fg"><label className="fl">Format</label><select className="fs" value={form.format} onChange={e => setForm(f => ({ ...f, format: e.target.value }))}><option>COCO</option><option>COFO</option><option>FOCO</option><option>FOFO</option></select></div>
            <div className="fg"><label className="fl">Type of Store</label><select className="fs" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}><option>Flagship</option><option>Standard</option><option>Compact</option><option>Kiosk</option></select></div>
            <div className="fg"><label className="fl">Manager</label><input className="fi" placeholder="Manager name" value={form.manager} onChange={e => setForm(f => ({ ...f, manager: e.target.value }))} /></div>
            <div className="fg"><label className="fl">Region</label><select className="fs" value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))}><option>North India</option><option>South India</option><option>East India</option><option>West India</option></select></div>
            <div className="fg"><label className="fl">Status</label><select className="fs" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}><option>Operating</option><option>Dehired</option></select></div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setFormOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveStore}>{editId ? 'Save Changes' : 'Add Store'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
