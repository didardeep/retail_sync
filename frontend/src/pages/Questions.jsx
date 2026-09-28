import { useState, useEffect } from 'react'
import { useToast } from '../components/Toast'
import { api } from '../api/client'
import { wColor, qTypeLabel } from '../utils/helpers'
import { cn, fieldClass, labelClass } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal, ModalTitle, ModalActions } from '../components/Modal'

function normalizeQ(q) {
  return {
    id: q.id || q.code,
    text: q.text || '',
    proc: q.process || '',
    sp: q.sub_process || '',
    at: q.audit_type || '',
    w: q.weight || 1,
    crit: !!q.is_critical,
    on: q.active !== false,
    tags: (q.meta?.tags) || [],
    g: q.guidance || '',
  }
}

export default function Questions() {
  const toast = useToast()

  const [questions, setQuestions] = useState([])
  const [processes, setProcesses] = useState([])
  const [responseTypes, setResponseTypes] = useState([])
  const [loading, setLoading] = useState(true)

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

  useEffect(() => {
    api.questions().then(data => {
      const qs = (data || []).map(normalizeQ)
      setQuestions(qs)
      const procs = [...new Set(qs.map(q => q.proc).filter(Boolean))]
      setProcesses(procs)
      const types = [...new Set(qs.map(q => q.at).filter(Boolean))]
      setResponseTypes(types)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

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
      const body = {
        text: qForm.text.trim(),
        process: qForm.proc,
        sub_process: qForm.sp,
        audit_type: qForm.at,
        weight: parseInt(qForm.w) || 3,
        is_critical: qForm.crit,
        meta: { tags: parsedTags },
      }
      api.createQuestion(body).then(newQ => {
        setQuestions(prev => [...prev, normalizeQ(newQ)])
      }).catch(() => {
        const newId = 'Q' + String(questions.length + 1).padStart(3, '0')
        setQuestions(prev => [...prev, {
          id: newId, text: qForm.text.trim(), at: qForm.at,
          proc: qForm.proc, sp: qForm.sp, w: parseInt(qForm.w) || 3,
          g: qForm.g, tags: parsedTags, crit: qForm.crit, on: true,
        }])
      })
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

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground">Loading questions...</div>
  }

  const Toggle = ({ on, onClick }) => (
    <div
      className={cn('relative h-[17px] w-8 shrink-0 cursor-pointer rounded-full transition-colors', on ? 'bg-primary' : 'bg-gray-300')}
      onClick={onClick}
    >
      <div className={cn('absolute top-[1.5px] h-3.5 w-3.5 rounded-full bg-white shadow transition-all', on ? 'left-4' : 'left-0.5')} />
    </div>
  )

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <>
      {/* ── page header ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div><h2 className="text-xl font-bold text-foreground">Audit Questions</h2></div>
        <Button size="sm" onClick={openAddQuestion}>+ New Question</Button>
      </div>

      {/* ── two-panel layout ── */}
      <div className="flex gap-3.5">
        {/* ── left sidebar ── */}
        <div className="w-[196px] shrink-0">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-foreground/80">
            Process
            <Button size="sm" variant="outline" onClick={() => { setProcName(''); setShowProcModal(true) }}>Add</Button>
          </div>
          <div>
            <div
              className={cn('mb-0.5 flex cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-[12.5px] text-foreground/80 hover:bg-muted', activeProc === 'All Overview' && 'bg-accent font-semibold text-primary hover:bg-accent')}
              onClick={() => setActiveProc('All Overview')}
            >
              <span>All Overview</span>
              <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{questions.length}</span>
            </div>
            {processes.map(p => (
              <div
                key={p}
                className={cn('mb-0.5 flex cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-[12.5px] text-foreground/80 hover:bg-muted', activeProc === p && 'bg-accent font-semibold text-primary hover:bg-accent')}
                onClick={() => setActiveProc(p)}
              >
                <span>{p}</span>
                <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{procCounts[p] || 0}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── right main area ── */}
        <div className="flex-1">
          <div className="mb-3.5 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{'🔍'}</span>
              <Input className="pl-8" placeholder="Search questions..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="">Type</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="overflow-hidden rounded-[10px] border border-border bg-card">
            <div className="grid grid-cols-[1fr_150px_155px_55px_75px_75px] gap-2 border-b border-border bg-gray-50 px-2.5 py-2">
              <span className="text-[11.5px] font-semibold text-muted-foreground">Audit Question</span>
              <span className="text-[11.5px] font-semibold text-muted-foreground">Process</span>
              <span className="text-[11.5px] font-semibold text-muted-foreground">Sub-Process</span>
              <span className="text-[11.5px] font-semibold text-muted-foreground">Weight</span>
              <span className="text-[11.5px] font-semibold text-muted-foreground">Status</span>
              <span className="text-[11.5px] font-semibold text-muted-foreground">Actions</span>
            </div>

            <div>
              {filtered.length ? filtered.map(item => (
                <div className="flex flex-col border-b border-border last:border-0 hover:bg-[#fafbff]" key={item.id}>
                  <div className="flex">
                    {item.crit
                      ? <div className="w-[3px] shrink-0 rounded-l-sm bg-red-600" />
                      : <div className="w-[3px]" />
                    }
                    <div className="grid flex-1 grid-cols-[1fr_150px_155px_55px_75px_75px] items-center gap-2 px-2.5 py-2">
                      <div>
                        <div className="mb-0.5 text-[12.5px] leading-snug text-foreground">{item.text}</div>
                        <div className="mb-0.5 text-[10.5px] font-medium text-muted-foreground">
                          <span className="font-semibold text-foreground/80">Type:</span> {qTypeLabel(item.at)}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {(item.tags || []).map(t => <span className="rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[10.5px] font-medium text-gray-700" key={t}>{t}</span>)}
                        </div>
                      </div>
                      <Badge className="bg-sky-50 text-center text-[10px] font-medium leading-tight text-sky-700" style={{whiteSpace:'normal'}}>{item.proc}</Badge>
                      <span className="text-xs text-muted-foreground">{item.sp}</span>
                      <div>
                        <div className="flex h-[19px] w-[19px] items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: wColor(item.w) }}>{item.w}</div>
                      </div>
                      <Toggle on={item.on} onClick={() => toggleQ(item.id)} />
                      <div className="flex gap-1">
                        <button className="flex h-[25px] w-[25px] items-center justify-center rounded-md border border-border bg-card text-[11px]" onClick={() => openEditQuestion(item.id)}>{'✏️'}</button>
                        <button className="flex h-[25px] w-[25px] items-center justify-center rounded-md border border-border bg-card text-[11px] text-destructive" onClick={() => deleteQ(item.id)}>{'🗑️'}</button>
                      </div>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="p-10 text-center text-muted-foreground">{'📋'} No questions found</div>
              )}
            </div>
          </div>

          <div className="mt-3 flex justify-end text-xs text-muted-foreground"><span>{filtered.length} questions</span></div>
        </div>
      </div>

      {/* ═══════════ QUESTION MODAL ═══════════ */}
      <Modal open={showQModal} onClose={() => setShowQModal(false)} className="w-[620px]">
        <ModalTitle>{editId ? 'Edit Audit Question' : 'New Audit Question'}</ModalTitle>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Process <span className="text-destructive">*</span></label>
              <select className={fieldClass} value={qForm.proc} onChange={e => handleProcSelectChange(e.target.value)}>
                {processes.map(p => <option key={p} value={p}>{p}</option>)}
                <option value="--new--">+ Add New Process</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Sub-Process</label>
              <Input placeholder="e.g. Cash sales & Recon" value={qForm.sp} onChange={e => setQForm(f => ({ ...f, sp: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Question <span className="text-destructive">*</span></label>
            <textarea className={cn(fieldClass, 'min-h-[72px] resize-y')} placeholder="Whether..." value={qForm.text} onChange={e => setQForm(f => ({ ...f, text: e.target.value }))} />
          </div>

          <div className="grid grid-cols-[2fr_1fr_1fr] items-end gap-3">
            <div>
              <label className={labelClass}>Question Type</label>
              <select className={fieldClass} value={qForm.at} onChange={e => handleRTSelectChange(e.target.value)}>
                {responseTypes.map(rt => <option key={rt} value={rt}>{rt}</option>)}
                <option value="--new--">+ Add New Type</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Weights</label>
              <Input type="number" min="1" max="5" value={qForm.w} onChange={e => setQForm(f => ({ ...f, w: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2 pb-2">
              <label className={cn(labelClass, 'mb-0')}>Critical Risk</label>
              <Toggle on={qForm.crit} onClick={() => setQForm(f => ({ ...f, crit: !f.crit }))} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Guidance</label>
            <textarea className={cn(fieldClass, 'min-h-[72px] resize-y')} placeholder="Provide guidance for the auditor..." value={qForm.g} onChange={e => setQForm(f => ({ ...f, g: e.target.value }))} />
          </div>

          <div>
            <label className={labelClass}>Tags (comma separated)</label>
            <Input placeholder="cash, reconciliation" value={qForm.tags} onChange={e => setQForm(f => ({ ...f, tags: e.target.value }))} />
          </div>
        </div>

        <ModalActions>
          <Button variant="outline" onClick={() => setShowQModal(false)}>Cancel</Button>
          <Button onClick={saveQuestion}>{editId ? 'Save Changes' : 'Add Question'}</Button>
        </ModalActions>
      </Modal>

      {/* ═══════════ PROCESS MODAL ═══════════ */}
      <Modal open={showProcModal} onClose={() => setShowProcModal(false)} className="w-[320px]">
        <ModalTitle>Add Process Category</ModalTitle>
        <div>
          <label className={labelClass}>Category Name</label>
          <Input placeholder="e.g. Inventory Management" value={procName} onChange={e => setProcName(e.target.value)} />
        </div>
        <ModalActions>
          <Button variant="outline" onClick={() => setShowProcModal(false)}>Cancel</Button>
          <Button onClick={saveProc}>Add</Button>
        </ModalActions>
      </Modal>

      {/* ═══════════ RESPONSE TYPE MODAL ═══════════ */}
      <Modal open={showRTModal} onClose={() => setShowRTModal(false)} className="w-[320px]">
        <ModalTitle>Add Response Type</ModalTitle>
        <div>
          <label className={labelClass}>Type Name</label>
          <Input placeholder="e.g. Barcode Scan" value={rtName} onChange={e => setRTName(e.target.value)} />
        </div>
        <ModalActions>
          <Button variant="outline" onClick={() => setShowRTModal(false)}>Cancel</Button>
          <Button onClick={saveRespType}>Add</Button>
        </ModalActions>
      </Modal>
    </>
  )
}
