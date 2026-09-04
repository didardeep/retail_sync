import { useState } from 'react'
import { useToast } from '../components/Toast'
import { mockQuestions, mockProcesses, mockResponseTypes } from '../data/mockData'
import { wColor, qTypeLabel } from '../utils/helpers'

export default function Questions() {
  const toast = useToast()

  /* ── local state seeded from mock data ── */
  const [questions, setQuestions] = useState(() => mockQuestions.map(q => ({ ...q })))
  const [processes, setProcesses] = useState(() => [...mockProcesses])
  const [responseTypes, setResponseTypes] = useState(() => [...mockResponseTypes])

  /* ── filters ── */
  const [activeProc, setActiveProc] = useState('All Overview')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  /* ── question modal state ── */
  const [showQModal, setShowQModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [qForm, setQForm] = useState({ proc: '', sp: '', text: '', at: '', w: 3, crit: false, g: '', tags: '' })

  /* ── process modal state ── */
  const [showProcModal, setShowProcModal] = useState(false)
  const [procName, setProcName] = useState('')

  /* ── response-type modal state ── */
  const [showRTModal, setShowRTModal] = useState(false)
  const [rtName, setRTName] = useState('')

  /* ────────────────── derived data ────────────────── */
  const procCounts = {}
  questions.forEach(q => { procCounts[q.proc] = (procCounts[q.proc] || 0) + 1 })

  const qLower = search.toLowerCase()
  const filtered = questions.filter(item => {
    if (activeProc !== 'All Overview' && item.proc !== activeProc) return false
    if (qLower && !(item.text.toLowerCase().includes(qLower) || item.tags.some(t => t.toLowerCase().includes(qLower)))) return false
    if (typeFilter && item.at !== typeFilter) return false
    return true
  })

  const types = [...new Set(questions.map(q => q.at))]

  /* ────────────────── question modal helpers ────────────────── */
  function openAddQuestion() {
    setEditId(null)
    setQForm({ proc: processes[0] || '', sp: '', text: '', at: responseTypes[0] || '', w: 3, crit: false, g: '', tags: '' })
    setShowQModal(true)
  }

  function openEditQuestion(id) {
    const item = questions.find(x => x.id === id)
    if (!item) return
    setEditId(id)
    setQForm({
      proc: item.proc,
      sp: item.sp || '',
      text: item.text,
      at: item.at,
      w: item.w,
      crit: !!item.crit,
      g: item.g || '',
      tags: (item.tags || []).join(', '),
    })
    setShowQModal(true)
  }

  function saveQuestion() {
    if (!qForm.text.trim() || !qForm.proc) {
      alert('Please fill in mandatory fields (Process and Question)')
      return
    }
    const parsedTags = qForm.tags.split(',').map(t => t.trim()).filter(Boolean)
    if (editId) {
      setQuestions(prev => prev.map(q => q.id === editId ? {
        ...q,
        text: qForm.text.trim(),
        proc: qForm.proc,
        at: qForm.at,
        sp: qForm.sp,
        w: parseInt(qForm.w) || 3,
        g: qForm.g,
        tags: parsedTags,
        crit: qForm.crit,
      } : q))
      toast('Question updated')
    } else {
      const newId = 'Q' + String(questions.length + 1).padStart(3, '0')
      setQuestions(prev => [...prev, {
        id: newId,
        text: qForm.text.trim(),
        at: qForm.at,
        proc: qForm.proc,
        sp: qForm.sp,
        w: parseInt(qForm.w) || 3,
        g: qForm.g,
        tags: parsedTags,
        crit: qForm.crit,
        on: true,
      }])
      toast('Question added')
    }
    setShowQModal(false)
    setEditId(null)
  }

  /* ────────────────── process modal helpers ────────────────── */
  function saveProc() {
    const n = procName.trim()
    if (!n || processes.includes(n)) { alert('Invalid or duplicate name'); return }
    setProcesses(prev => [...prev, n])
    setProcName('')
    setShowProcModal(false)
    toast('Process added')
  }

  /* ────────────────── response-type modal helpers ────────────────── */
  function saveRespType() {
    const n = rtName.trim()
    if (!n || responseTypes.includes(n)) { alert('Invalid or duplicate name'); return }
    setResponseTypes(prev => [...prev, n])
    setRTName('')
    setShowRTModal(false)
    toast('Question type added')
  }

  /* ────────────────── toggle / delete ────────────────── */
  function toggleQ(id) {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, on: !q.on } : q))
  }

  function deleteQ(id) {
    if (!confirm('Delete question?')) return
    setQuestions(prev => prev.filter(q => q.id !== id))
    toast('Deleted')
  }

  /* ────────────────── process select change in modal ────────────────── */
  function handleProcSelectChange(val) {
    if (val === '--new--') {
      setShowProcModal(true)
      setQForm(f => ({ ...f, proc: processes[0] || '' }))
    } else {
      setQForm(f => ({ ...f, proc: val }))
    }
  }

  function handleRTSelectChange(val) {
    if (val === '--new--') {
      setShowRTModal(true)
      setQForm(f => ({ ...f, at: responseTypes[0] || '' }))
    } else {
      setQForm(f => ({ ...f, at: val }))
    }
  }

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <>
      {/* ── page header ── */}
      <div className="page-hdr">
        <div><h2>Audit Questions</h2></div>
        <button className="btn btn-primary btn-sm" onClick={openAddQuestion}>+ New Question</button>
      </div>

      {/* ── two-panel layout ── */}
      <div className="aq-layout">
        {/* ── left sidebar ── */}
        <div className="aq-sb">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>
            Process
            <button className="btn btn-outline btn-sm" onClick={() => { setProcName(''); setShowProcModal(true) }}>Add</button>
          </div>
          <div>
            {/* All Overview item */}
            <div
              className={`aq-pi${activeProc === 'All Overview' ? ' active' : ''}`}
              onClick={() => setActiveProc('All Overview')}
            >
              <span>All Overview</span>
              <span className="aq-pc">{questions.length}</span>
            </div>
            {/* Individual process items */}
            {processes.map(p => (
              <div
                key={p}
                className={`aq-pi${activeProc === p ? ' active' : ''}`}
                onClick={() => setActiveProc(p)}
              >
                <span>{p}</span>
                <span className="aq-pc">{procCounts[p] || 0}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── right main area ── */}
        <div className="aq-main">
          {/* filter bar */}
          <div className="filter-bar">
            <div className="srch">
              <span className="srch-ic">{'\uD83D\uDD0D'}</span>
              <input placeholder="Search questions..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="sel" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="">Type</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* table card */}
          <div className="tbl-card">
            {/* grid header */}
            <div className="aq-gh">
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text3)' }}>Audit Question</span>
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text3)' }}>Process</span>
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text3)' }}>Sub-Process</span>
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text3)' }}>Weight</span>
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text3)' }}>Status</span>
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text3)' }}>Actions</span>
            </div>

            {/* question rows */}
            <div>
              {filtered.length ? filtered.map(item => (
                <div className="aq-gr" key={item.id} style={{ flexDirection: 'column' }}>
                  <div style={{ display: 'flex' }}>
                    {/* critical bar or spacer */}
                    {item.crit
                      ? <div style={{ width: 3, background: '#e02424', flexShrink: 0, borderRadius: '2px 0 0 2px' }} />
                      : <div style={{ width: 3 }} />
                    }
                    <div className="aq-grc">
                      {/* question text + type + tags */}
                      <div>
                        <div style={{ fontSize: '12.5px', color: 'var(--text)', lineHeight: 1.4, marginBottom: 3 }}>{item.text}</div>
                        <div style={{ fontSize: '10.5px', color: 'var(--text3)', marginBottom: 3, fontWeight: 500 }}>
                          <span style={{ color: 'var(--text2)', fontWeight: 600 }}>Type:</span> {qTypeLabel(item.at)}
                        </div>
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                          {item.tags.map(t => <span className="chip" key={t}>{t}</span>)}
                        </div>
                      </div>
                      {/* process badge */}
                      <span className="badge bb" style={{ fontSize: '10px', whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.3, display: 'inline-block', padding: '4px 8px' }}>{item.proc}</span>
                      {/* sub-process */}
                      <span style={{ fontSize: '12px', color: 'var(--text3)' }}>{item.sp}</span>
                      {/* weight dot */}
                      <div>
                        <div className="wdot" style={{ background: wColor(item.w) }}>{item.w}</div>
                      </div>
                      {/* toggle */}
                      <div className={`toggle${item.on ? ' on' : ''}`} onClick={() => toggleQ(item.id)} />
                      {/* actions */}
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="icon-btn" style={{ width: 25, height: 25, fontSize: '11px' }} onClick={() => openEditQuestion(item.id)}>{'\u270F\uFE0F'}</button>
                        <button className="icon-btn" style={{ width: 25, height: 25, fontSize: '11px', color: 'var(--red)' }} onClick={() => deleteQ(item.id)}>{'\uD83D\uDDD1\uFE0F'}</button>
                      </div>
                    </div>
                  </div>
                </div>
              )) : (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>{'\uD83D\uDCCB'} No questions found</div>
              )}
            </div>
          </div>

          {/* pagination / count */}
          <div className="pagination"><span>{filtered.length} questions</span></div>
        </div>
      </div>

      {/* ═══════════ QUESTION MODAL ═══════════ */}
      {showQModal && (
        <div className="modal-ov" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) setShowQModal(false) }}>
          <div className="modal" style={{ width: 620 }}>
            <div className="modal-title">{editId ? 'Edit Audit Question' : 'New Audit Question'}</div>
            <div className="modal-grid">
              {/* row: process + sub-process */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="fg">
                  <label className="fl">Process <span style={{ color: 'var(--red)' }}>*</span></label>
                  <select className="fs" value={qForm.proc} onChange={e => handleProcSelectChange(e.target.value)}>
                    {processes.map(p => <option key={p} value={p}>{p}</option>)}
                    <option value="--new--">+ Add New Process</option>
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">Sub-Process</label>
                  <input className="fi" placeholder="e.g. Cash sales & Recon" value={qForm.sp} onChange={e => setQForm(f => ({ ...f, sp: e.target.value }))} />
                </div>
              </div>

              {/* question textarea */}
              <div className="fg">
                <label className="fl">Question <span style={{ color: 'var(--red)' }}>*</span></label>
                <textarea className="fta" placeholder="Whether..." value={qForm.text} onChange={e => setQForm(f => ({ ...f, text: e.target.value }))} />
              </div>

              {/* row: type + weight + critical */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, alignItems: 'flex-end' }}>
                <div className="fg">
                  <label className="fl">Question Type</label>
                  <select className="fs" value={qForm.at} onChange={e => handleRTSelectChange(e.target.value)}>
                    {responseTypes.map(rt => <option key={rt} value={rt}>{rt}</option>)}
                    <option value="--new--">+ Add New Type</option>
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">Weights</label>
                  <input type="number" className="fi" min="1" max="5" value={qForm.w} onChange={e => setQForm(f => ({ ...f, w: e.target.value }))} />
                </div>
                <div className="fg" style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8 }}>
                  <label className="fl" style={{ margin: 0 }}>Critical Risk</label>
                  <div className={`toggle${qForm.crit ? ' on' : ''}`} onClick={() => setQForm(f => ({ ...f, crit: !f.crit }))} />
                </div>
              </div>

              {/* guidance textarea */}
              <div className="fg">
                <label className="fl">Guidance</label>
                <textarea className="fta" placeholder="Provide guidance for the auditor..." value={qForm.g} onChange={e => setQForm(f => ({ ...f, g: e.target.value }))} />
              </div>

              {/* tags */}
              <div className="fg">
                <label className="fl">Tags (comma separated)</label>
                <input className="fi" placeholder="cash, reconciliation" value={qForm.tags} onChange={e => setQForm(f => ({ ...f, tags: e.target.value }))} />
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowQModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveQuestion}>{editId ? 'Save Changes' : 'Add Question'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ PROCESS MODAL ═══════════ */}
      {showProcModal && (
        <div className="modal-ov" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) setShowProcModal(false) }}>
          <div className="modal" style={{ width: 320 }}>
            <div className="modal-title">Add Process Category</div>
            <div className="fg">
              <label className="fl">Category Name</label>
              <input className="fi" placeholder="e.g. Inventory Management" value={procName} onChange={e => setProcName(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowProcModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveProc}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ RESPONSE TYPE MODAL ═══════════ */}
      {showRTModal && (
        <div className="modal-ov" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) setShowRTModal(false) }}>
          <div className="modal" style={{ width: 320 }}>
            <div className="modal-title">Add Response Type</div>
            <div className="fg">
              <label className="fl">Type Name</label>
              <input className="fi" placeholder="e.g. Barcode Scan" value={rtName} onChange={e => setRTName(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowRTModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveRespType}>Add</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
