import { useState, useEffect } from 'react'
import { AlertTriangle, CheckCircle2, CircleOff, ClipboardList, Clock, Pencil, Trash2 } from 'lucide-react'
import { useToast } from '../components/Toast'
import { api, loadSession } from '../api/client'
import { questionsApi } from '../api/questionsApi'
import { wColor, qTypeLabel } from '../utils/helpers'
import { cn, fieldClass, labelClass } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import Tile from '@/components/Tile'
import { Modal, ModalTitle, ModalActions } from '../components/Modal'

const PER_PAGE = 10

// Status filter values: the tiles and the status dropdown share them.
const STATUS_TEST = {
  active: q => q.on,
  inactive: q => !q.on,
  critical: q => q.crit,
  pending: q => q.status === 'PENDING',
}

const APPROVAL_BADGE = {
  APPROVED: ['Approved', 'bg-emerald-50 text-emerald-700'],
  REJECTED: ['Rejected', 'bg-red-50 text-red-700'],
  PENDING: ['Pending', 'bg-amber-50 text-amber-700'],
}

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
    meta: q.meta || {},
    status: q.approval_status || 'APPROVED',
  }
}

function QuestionBank() {
  const toast = useToast()
  const role = loadSession()?.user?.role
  const isManager = role === 'ADMIN' || role === 'AUDIT_MANAGER'

  const [questions, setQuestions] = useState([])
  const [processes, setProcesses] = useState([])
  const [responseTypes, setResponseTypes] = useState([])
  const [loading, setLoading] = useState(true)

  /* ── filters ── */
  const [procFilter, setProcFilter] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  /* ── question modal state ── */
  const [showQModal, setShowQModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [qForm, setQForm] = useState({ proc: '', sp: '', text: '', at: '', w: 3, crit: false, tags: '' })

  /* ── process modal state ── */
  const [saving, setSaving] = useState(false)
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
  const qLower = search.toLowerCase()
  // Tiles count everything except the status filter, so they stay a way to switch status.
  const forTiles = questions.filter(item => {
    if (procFilter && item.proc !== procFilter) return false
    if (qLower && !(item.text.toLowerCase().includes(qLower) || item.tags.some(t => t.toLowerCase().includes(qLower)))) return false
    if (typeFilter && item.at !== typeFilter) return false
    return true
  })
  const counts = {}
  Object.entries(STATUS_TEST).forEach(([k, test]) => { counts[k] = forTiles.filter(test).length })
  const filtered = statusFilter ? forTiles.filter(STATUS_TEST[statusFilter]) : forTiles

  const types = [...new Set(questions.map(q => q.at).filter(Boolean))]
  const pages = Math.ceil(filtered.length / PER_PAGE)
  const pageNo = Math.min(page, Math.max(pages, 1))
  const paged = filtered.slice((pageNo - 1) * PER_PAGE, pageNo * PER_PAGE)
  const hasFilters = procFilter || search || typeFilter || statusFilter

  function applyFilter(set, value) {
    setPage(1)
    set(value)
  }

  function toggleStatus(value) {
    setPage(1)
    setStatusFilter(s => (s === value ? '' : value))
  }

  function clearAll() {
    setPage(1)
    setProcFilter('')
    setSearch('')
    setTypeFilter('')
    setStatusFilter('')
  }

  /* ────────────────── question modal helpers ────────────────── */
  function openAddQuestion() {
    setEditId(null)
    setQForm({ proc: processes[0] || '', sp: '', text: '', at: responseTypes[0] || '', w: 3, crit: false, tags: '' })
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
      tags: (item.tags || []).join(', '),
    })
    setShowQModal(true)
  }

  function replaceRow(id, saved) {
    setQuestions(prev => prev.map(q => q.id === id ? normalizeQ(saved) : q))
  }

  function saveQuestion() {
    if (saving) return
    if (!qForm.text.trim() || !qForm.proc) {
      toast.error('Please fill in mandatory fields (Process and Question)')
      return
    }
    const parsedTags = qForm.tags.split(',').map(t => t.trim()).filter(Boolean)
    const body = {
      text: qForm.text.trim(),
      process: qForm.proc,
      sub_process: qForm.sp,
      audit_type: qForm.at,
      weight: parseInt(qForm.w) || 3,
      is_critical: qForm.crit,
    }
    setSaving(true)
    let call
    if (editId) {
      const old = questions.find(q => q.id === editId)
      call = questionsApi.edit(editId, { ...body, meta: { ...(old?.meta || {}), tags: parsedTags } })
    } else {
      call = questionsApi.create({ ...body, meta: { tags: parsedTags } })
    }
    call.then(saved => {
      if (editId) replaceRow(editId, saved)
      else setQuestions(prev => [...prev, normalizeQ(saved)])
      toast(editId ? 'Question updated (new version saved)' : (saved.approval_status === 'PENDING' ? 'Question submitted for approval' : 'Question added'))
      setShowQModal(false)
      setEditId(null)
    }).catch(e => {
      toast.error(e.message || 'Could not save the question')
    }).finally(() => setSaving(false))
  }

  /* ────────────────── process / type pickers ────────────────── */
  // Process and type are plain values on a question, so these popups only set
  // the value for the question being edited. Nothing is saved until the question is.
  // A process created from the toolbar opens a new question under it, since a
  // process only exists once a question uses it.
  function openNewProcess() {
    setProcName('')
    setShowProcModal(true)
  }

  function saveProc() {
    const n = procName.trim()
    if (!n) { toast.error('Enter a name'); return }
    if (!processes.includes(n)) setProcesses(prev => [...prev, n])
    setProcName('')
    setShowProcModal(false)
    if (showQModal) {
      setQForm(f => ({ ...f, proc: n }))
    } else {
      openAddQuestion()
      setQForm(f => ({ ...f, proc: n }))
    }
  }

  function saveRespType() {
    const n = rtName.trim()
    if (!n) { toast.error('Enter a name'); return }
    if (!responseTypes.includes(n)) setResponseTypes(prev => [...prev, n])
    setQForm(f => ({ ...f, at: n }))
    setRTName('')
    setShowRTModal(false)
  }

  /* ────────────────── toggle / deactivate / approve ────────────────── */
  function toggleQ(id) {
    if (!isManager) return
    const item = questions.find(q => q.id === id)
    if (!item) return
    questionsApi.edit(id, { active: !item.on })
      .then(saved => replaceRow(id, saved))
      .catch(e => toast.error(e.message || 'Could not change the question'))
  }

  function deleteQ(id) {
    if (!window.confirm('Delete this question? It is switched off, not erased, so past audits keep it.')) return
    questionsApi.deactivate(id)
      .then(saved => { replaceRow(id, saved); toast('Question deleted (inactive)') })
      .catch(e => toast.error(e.message || 'Could not delete the question'))
  }

  function decide(id, decision) {
    questionsApi.approve(id, decision)
      .then(saved => { replaceRow(id, saved); toast(decision === 'APPROVED' ? 'Question approved' : 'Question rejected') })
      .catch(e => toast.error(e.message || 'Could not record the decision'))
  }

  /* ────────────────── process select change in modal ────────────────── */
  function handleProcSelectChange(val) {
    if (val === '--new--') {
      setProcName('')
      setShowProcModal(true)
    } else {
      setQForm(f => ({ ...f, proc: val }))
    }
  }

  function handleRTSelectChange(val) {
    if (val === '--new--') {
      setRTName('')
      setShowRTModal(true)
    } else {
      setQForm(f => ({ ...f, at: val }))
    }
  }

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground">Loading questions...</div>
  }

  const Toggle = ({ on, onClick, disabled, label }) => (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', on ? 'bg-primary' : 'bg-gray-300', disabled ? 'cursor-default opacity-60' : 'cursor-pointer')}
      onClick={onClick}
    >
      <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', on ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )

  const iconBtn = 'flex h-[26px] w-[26px] items-center justify-center rounded-md border border-border bg-card'

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <>
      <div className={cn('mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2', isManager ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
        <Tile icon={ClipboardList} tint="#e8eefa" label="Total Questions" value={forTiles.length}
          active={!statusFilter} onClick={() => applyFilter(setStatusFilter, '')} />
        <Tile icon={CheckCircle2} tint="#ecfdf5" label="Active" value={counts.active}
          active={statusFilter === 'active'} onClick={() => toggleStatus('active')} />
        <Tile icon={CircleOff} tint="#f3f4f6" label="Inactive" value={counts.inactive}
          active={statusFilter === 'inactive'} onClick={() => toggleStatus('inactive')} />
        <Tile icon={AlertTriangle} tint="#fde8e8" label="Critical Risk" value={counts.critical}
          active={statusFilter === 'critical'} onClick={() => toggleStatus('critical')} />
        {isManager && (
          <Tile icon={Clock} tint="#fffbeb" label="Pending Approval" value={counts.pending}
            active={statusFilter === 'pending'} onClick={() => toggleStatus('pending')} />
        )}
      </div>

      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Input placeholder="Search question text or tags..." value={search} onChange={e => applyFilter(setSearch, e.target.value)} />
        </div>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={procFilter} onChange={e => applyFilter(setProcFilter, e.target.value)} aria-label="Filter by process">
          <option value="">Process</option>
          {processes.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={typeFilter} onChange={e => applyFilter(setTypeFilter, e.target.value)} aria-label="Filter by type">
          <option value="">Type</option>
          {types.map(t => <option key={t} value={t}>{qTypeLabel(t)}</option>)}
        </select>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={statusFilter} onChange={e => applyFilter(setStatusFilter, e.target.value)} aria-label="Filter by status">
          <option value="">Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="critical">Critical risk</option>
          {isManager && <option value="pending">Pending approval</option>}
        </select>
        {hasFilters && <Button size="sm" variant="outline" onClick={clearAll}>Clear</Button>}
        {isManager && <Button size="sm" variant="outline" onClick={openNewProcess}>+ New Process</Button>}
        <Button size="sm" onClick={openAddQuestion}>+ New Question</Button>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Question</TableHead>
              <TableHead>Process</TableHead>
              <TableHead>Weight</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Active</TableHead>
              {isManager && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 && (
              <TableRow><TableCell colSpan={isManager ? 6 : 5} className="p-10 text-center text-muted-foreground">No questions match these filters</TableCell></TableRow>
            )}
            {paged.map(item => {
              const [statusLabel, statusClass] = APPROVAL_BADGE[item.status] || APPROVAL_BADGE.PENDING
              return (
                <TableRow key={item.id} className={cn(!item.on && 'opacity-60')}>
                  <TableCell className="max-w-[460px] whitespace-normal">
                    <div className="flex items-start gap-1.5">
                      {item.crit && <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-label="Critical risk" />}
                      <div className="text-[12.5px] font-semibold leading-snug">{item.text}</div>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                      <span>{qTypeLabel(item.at) || 'No type'}</span>
                      {(item.tags || []).map(t => <span className="rounded border border-border bg-muted px-1.5 text-[10.5px]" key={t}>{t}</span>)}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="text-[12.5px] font-medium">{item.proc}</div>
                    <div className="text-[11px] text-muted-foreground">{item.sp}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: wColor(item.w) }}>{item.w}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      {isManager && <Badge className={cn('text-[10.5px]', statusClass)}>{statusLabel}</Badge>}
                      {item.crit && <Badge className="bg-red-50 text-[10.5px] text-red-700">Critical</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Toggle on={item.on} onClick={() => toggleQ(item.id)} disabled={!isManager} label={item.on ? 'Deactivate question' : 'Activate question'} />
                  </TableCell>
                  {isManager && (
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <button className={iconBtn} onClick={() => openEditQuestion(item.id)} title="Edit" aria-label="Edit"><Pencil className="size-3.5" /></button>
                        <button className={iconBtn} onClick={() => deleteQ(item.id)} title="Delete" aria-label="Delete"><Trash2 className="size-3.5 text-destructive" /></button>
                        {item.status === 'PENDING' && (
                          <>
                            <button className={iconBtn} onClick={() => decide(item.id, 'APPROVED')} title="Approve" aria-label="Approve"><CheckCircle2 className="size-3.5 text-emerald-600" /></button>
                            <button className={iconBtn} onClick={() => decide(item.id, 'REJECTED')} title="Reject" aria-label="Reject"><CircleOff className="size-3.5 text-destructive" /></button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-1 text-xs text-muted-foreground">
        <span className="mr-2">{filtered.length} questions</span>
        {Array.from({ length: pages }, (_, i) => (
          <button key={i} className={cn('flex h-[27px] w-[27px] items-center justify-center rounded-md border border-border bg-card text-xs text-foreground/80', pageNo === i + 1 && 'border-primary bg-primary text-primary-foreground')} onClick={() => setPage(i + 1)}>{i + 1}</button>
        ))}
      </div>

      {/* ═══════════ QUESTION MODAL ═══════════ */}
      <Modal open={showQModal} onClose={() => setShowQModal(false)} className="w-[620px]">
        <ModalTitle>{editId ? 'Edit Audit Question' : 'New Audit Question'}</ModalTitle>
        <div className="grid gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr] sm:items-end">
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
            <label className={labelClass}>Tags (comma separated)</label>
            <Input placeholder="cash, reconciliation" value={qForm.tags} onChange={e => setQForm(f => ({ ...f, tags: e.target.value }))} />
          </div>
        </div>

        <ModalActions>
          <Button variant="outline" onClick={() => setShowQModal(false)}>Cancel</Button>
          <Button onClick={saveQuestion} disabled={saving}>{editId ? 'Save Changes' : 'Add Question'}</Button>
        </ModalActions>
      </Modal>

      {/* ═══════════ PROCESS MODAL ═══════════ */}
      <Modal open={showProcModal} onClose={() => setShowProcModal(false)} className="w-[320px]">
        <ModalTitle>{showQModal ? 'Set Process' : 'New Process'}</ModalTitle>
        <div>
          <label className={labelClass}>{showQModal ? 'Process name (applies to this question)' : 'Process name'}</label>
          <Input placeholder="e.g. Inventory Management" value={procName} onChange={e => setProcName(e.target.value)} />
        </div>
        <ModalActions>
          <Button variant="outline" onClick={() => setShowProcModal(false)}>Cancel</Button>
          <Button onClick={saveProc}>{showQModal ? 'Use' : 'Create & add question'}</Button>
        </ModalActions>
      </Modal>

      {/* ═══════════ RESPONSE TYPE MODAL ═══════════ */}
      <Modal open={showRTModal} onClose={() => setShowRTModal(false)} className="w-[320px]">
        <ModalTitle>Set Question Type</ModalTitle>
        <div>
          <label className={labelClass}>Type name (applies to this question)</label>
          <Input placeholder="e.g. Barcode Scan" value={rtName} onChange={e => setRTName(e.target.value)} />
        </div>
        <ModalActions>
          <Button variant="outline" onClick={() => setShowRTModal(false)}>Cancel</Button>
          <Button onClick={saveRespType}>Use</Button>
        </ModalActions>
      </Modal>
    </>
  )
}

// Audit Questions: the question bank.
export default function Questions() {
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Question bank</div>
      <QuestionBank />
    </div>
  );
}
