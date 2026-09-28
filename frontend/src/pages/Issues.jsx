import { useState, useEffect } from 'react';
import { useToast } from '../components/Toast';
import { api } from '../api/client';
import { avC, prC, stC, exportCSV } from '../utils/helpers';
import { cn, fieldClass, labelClass } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal, ModalActions } from '../components/Modal';

function stBorder(s) {
  return s === 'In Progress' ? '#00338D' : s === 'Resolved' ? '#0e9f6e' : s === 'On Hold' ? '#f59e0b' : s === 'Closed' ? '#6b7280' : '#e02424';
}

const colColor = { Open: '#e02424', 'In Progress': '#00338D', 'On Hold': '#f59e0b', Resolved: '#0e9f6e', Closed: '#6b7280' };

function fmtLocalDT(d) {
  const dt = new Date(d);
  const pad = n => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function fmtDisp(d) {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function Issues() {
  const toast = useToast();
  const [issues, setIssues] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('table');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priFilter, setPriFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [statusTab, setStatusTab] = useState('');

  /* modal state */
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({
    title: '', status: 'Open', desc: '', pri: 'Critical', store: '', assignee: 'Jitendra',
    created: '', due: '', aid: '', tags: '', comment: ''
  });
  const [files, setFiles] = useState([]);

  useEffect(() => {
    Promise.all([
      api.issues().catch(() => []),
      api.stores().catch(() => []),
    ]).then(([i, s]) => {
      // Normalize issue data for display
      const normalized = (i || []).map(iss => ({
        ...iss,
        pri: iss.priority || iss.pri || 'Medium',
        store: iss.store || iss.store_id || '',
        assignee: iss.assignee || iss.assignee_id || 'Unassigned',
        desc: iss.description || iss.desc || '',
        aid: iss.audit_id || iss.aid || '',
        created: iss.created_at ? fmtDisp(new Date(iss.created_at)) : '',
        due: iss.due_date || '',
        ov: iss.is_overdue || false,
        tags: iss.tags || [],
        dp: 0,
        dc: '#6b7280',
        files: 0,
        comments: 0,
      }));
      setIssues(normalized);
      setStores(s || []);
      setLoading(false);
    });
  }, []);

  /* ── derived data ── */
  const storeOpts = [...new Set(issues.map(i => i.store).filter(Boolean))];
  const assigneeOpts = [...new Set(issues.map(i => i.assignee).filter(Boolean))];

  const filtered = issues.filter(i => {
    if (search) {
      const q = search.toLowerCase();
      if (!(i.title||'').toLowerCase().includes(q) && !(i.desc||'').toLowerCase().includes(q) && !(i.tags||[]).join(' ').toLowerCase().includes(q)) return false;
    }
    if (statusFilter && i.status !== statusFilter) return false;
    if (priFilter && i.pri !== priFilter) return false;
    if (storeFilter && i.store !== storeFilter) return false;
    if (assigneeFilter && i.assignee !== assigneeFilter) return false;
    return true;
  });

  const tableData = filtered.filter(i => !statusTab || i.status === statusTab);

  /* KPI counts from full issues array */
  const totalCount = issues.length;
  const openNotDue = issues.filter(i => !i.ov && i.status !== 'Resolved' && i.status !== 'Closed').length;
  const overdueCount = issues.filter(i => i.ov === true).length;
  const completedCount = issues.filter(i => i.status === 'Resolved').length;

  /* ── modal store options ── */
  const modalStoreOpts = [...new Set([...issues.map(i => i.store).filter(Boolean), ...stores.map(s => s.name)])];

  /* ── handlers ── */
  function setIssueView(v) {
    setView(v);
  }

  function clearFilters() {
    setSearch('');
    setStatusFilter('');
    setPriFilter('');
    setStoreFilter('');
    setAssigneeFilter('');
  }

  function openNewIssue() {
    setEditId(null);
    const now = new Date();
    const due = new Date(now.getTime() + 48 * 3600 * 1000);
    setForm({
      title: '', status: 'Open', desc: '', pri: 'Critical', store: '', assignee: 'Jitendra',
      created: fmtLocalDT(now), due: fmtLocalDT(due), aid: '', tags: '', comment: ''
    });
    setFiles([]);
    setModalOpen(true);
  }

  function openEditIssue(id) {
    const i = issues.find(x => x.id === id);
    if (!i) return;
    setEditId(id);
    setForm({
      title: i.title,
      status: i.status,
      desc: i.desc || '',
      pri: i.pri,
      store: i.store,
      assignee: i.assignee,
      created: fmtLocalDT(new Date()),
      due: fmtLocalDT(new Date()),
      aid: i.aid || '',
      tags: (i.tags || []).join(', '),
      comment: ''
    });
    setFiles([]);
    setModalOpen(true);
  }

  function saveIssue() {
    if (!form.title.trim()) { alert('Please enter a title'); return; }
    if (!form.store) { alert('Please select a store'); return; }

    const priColor = { Critical: '#e02424', High: '#f59e0b', Medium: '#00338D', Low: '#0e9f6e' };
    const dueDate = form.due ? new Date(form.due) : null;
    const now = new Date();
    const overdue = dueDate ? dueDate < now && form.status !== 'Resolved' && form.status !== 'Closed' : false;
    const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean);

    if (editId) {
      setIssues(prev => prev.map(i => {
        if (i.id !== editId) return i;
        return {
          ...i,
          title: form.title.trim(),
          status: form.status,
          pri: form.pri,
          tags,
          store: form.store,
          assignee: form.assignee,
          created: form.created ? fmtDisp(new Date(form.created)) : i.created,
          due: form.due ? fmtDisp(new Date(form.due)).split(',')[0] : i.due,
          ov: overdue,
          dp: overdue ? 100 : i.dp,
          dc: overdue ? '#e02424' : (priColor[form.pri] || '#00338D'),
          desc: form.desc,
          aid: form.aid.trim() || i.aid
        };
      }));
      // Also update in backend
      api.updateIssue(editId, {
        title: form.title.trim(),
        status: form.status,
        priority: form.pri,
        description: form.desc,
      }).catch(() => {});
      toast('Issue updated');
    } else {
      const newId = 'ISS' + String(issues.length + 1).padStart(3, '0');
      setIssues(prev => [...prev, {
        id: newId,
        aid: form.aid.trim() || 'AUD-NEW',
        title: form.title.trim(),
        status: form.status,
        pri: form.pri,
        tags,
        proc: '',
        sp: '',
        store: form.store,
        assignee: form.assignee,
        created: form.created ? fmtDisp(new Date(form.created)) : fmtDisp(now),
        due: form.due ? fmtDisp(new Date(form.due)).split(',')[0] : '—',
        ov: false,
        dp: 0,
        dc: '#6b7280',
        desc: form.desc,
        files: files.length,
        comments: form.comment.trim() ? 1 : 0
      }]);
      toast('Issue created');
    }
    setModalOpen(false);
    setEditId(null);
  }

  function deleteIssue(id) {
    if (!window.confirm('Delete this issue?')) return;
    setIssues(prev => prev.filter(i => i.id !== id));
    toast('Issue deleted');
  }

  function handleExport() {
    const headers = ['ID', 'Audit ID', 'Title', 'Priority', 'Status', 'Store', 'Assignee', 'Due', 'Overdue'];
    const rows = issues.map(i => [i.id, i.aid, i.title, i.pri, i.status, i.store, i.assignee, i.due, i.ov ? 'Yes' : 'No']);
    exportCSV(rows, headers, 'issues.csv');
    toast('CSV exported');
  }

  function handleAddFiles(e) {
    const newFiles = Array.from(e.target.files || []).map(f => f.name);
    setFiles(prev => [...prev, ...newFiles]);
    e.target.value = '';
  }

  function removeFile(idx) {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  }

  /* ── board columns ── */
  const boardCols = ['Open', 'In Progress', 'On Hold', 'Resolved', 'Closed'];

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground">Loading issues...</div>;
  }

  /* ── render ── */
  return (
    <>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2 className="text-xl font-bold text-foreground">Action Taken Tracking</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Monitor, prioritise and resolve issues across stores</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant={view === 'table' ? 'default' : 'outline'} onClick={() => setIssueView('table')}>&#x1F4CB; Table</Button>
          <Button size="sm" variant={view === 'board' ? 'default' : 'outline'} onClick={() => setIssueView('board')}>&#x1F4CC; Board</Button>
          <Button size="sm" variant="outline" onClick={handleExport}>&#x2B07; Export</Button>
          <Button size="sm" onClick={openNewIssue}>+ New Issue</Button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4">
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{ background: '#f3f4f6' }}>&#x1F4CA;</div>
          <div><div className="mb-0.5 text-[11px] text-muted-foreground">Total Issues</div><div className="text-2xl font-bold leading-none text-foreground">{totalCount}</div></div>
        </div>
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4">
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{ background: '#fffbeb' }}>&#x1F7E1;</div>
          <div><div className="mb-0.5 text-[11px] text-muted-foreground">Open (Not Due)</div><div className="text-2xl font-bold leading-none text-foreground">{openNotDue}</div></div>
        </div>
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4">
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{ background: '#fde8e8' }}>&#x1F534;</div>
          <div><div className="mb-0.5 text-[11px] text-muted-foreground">Open (Overdue)</div><div className="text-2xl font-bold leading-none text-foreground">{overdueCount}</div></div>
        </div>
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4">
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{ background: '#ecfdf5' }}>&#x2705;</div>
          <div><div className="mb-0.5 text-[11px] text-muted-foreground">Completed</div><div className="text-2xl font-bold leading-none text-foreground">{completedCount}</div></div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <div className="relative max-w-[250px] flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">&#x1F50D;</span>
          <Input className="pl-8" placeholder="Search title, tags..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Status</option>
          <option>Open</option>
          <option>In Progress</option>
          <option>On Hold</option>
          <option>Closed</option>
        </select>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={priFilter} onChange={e => setPriFilter(e.target.value)}>
          <option value="">Priority</option>
          <option>Critical</option>
          <option>High</option>
          <option>Medium</option>
          <option>Low</option>
        </select>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={storeFilter} onChange={e => setStoreFilter(e.target.value)}>
          <option value="">Store</option>
          {storeOpts.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}>
          <option value="">Assignee</option>
          {assigneeOpts.map(a => <option key={a}>{a}</option>)}
        </select>
        <button className="flex h-[30px] w-[30px] items-center justify-center rounded-md border border-border bg-card text-[13px]" onClick={clearFilters} title="Clear filters">&#x1F504;</button>
      </div>

      {/* Status Tabs */}
      {view === 'table' && (
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {[{ label: 'All Status', val: '' }, { label: 'Open', val: 'Open' }, { label: 'In Progress', val: 'In Progress' }, { label: 'On Hold', val: 'On Hold' }, { label: 'Closed', val: 'Closed' }].map(t => (
            <button key={t.val} className={cn('rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground', statusTab === t.val && 'border-primary bg-primary text-primary-foreground')} onClick={() => setStatusTab(t.val)}>{t.label}</button>
          ))}
        </div>
      )}

      {/* Table View */}
      {view === 'table' && (
        <div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
            {tableData.length ? tableData.map(i => (
              <div key={i.id} className="rounded-[10px] border border-border bg-card p-3.5" style={{ borderLeft: `4px solid ${stBorder(i.status)}` }}>
                {/* top row: audit id + overdue + actions */}
                <div className="mb-1.5 flex items-center justify-between">
                  <a className="text-[11.5px] font-semibold text-primary no-underline">{i.aid}</a>
                  <div className="flex items-center gap-1.5">
                    {i.ov && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-800">Overdue</span>}
                    <button className="flex h-[22px] w-[22px] items-center justify-center rounded-md border border-border bg-card text-[10px]" onClick={() => openEditIssue(i.id)}>&#x270F;&#xFE0F;</button>
                    <button className="flex h-[22px] w-[22px] items-center justify-center rounded-md border border-border bg-card text-[10px] text-destructive" onClick={() => deleteIssue(i.id)}>&#x1F5D1;</button>
                  </div>
                </div>
                {/* title */}
                <div className="mb-1.5 text-[13.5px] font-semibold text-foreground">{i.title}</div>
                {/* badges */}
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <Badge className={stC(i.status)}>{i.status}</Badge>
                  <Badge className={prC(i.pri)}>{i.pri}</Badge>
                </div>
                {/* description */}
                <div className="mb-2.5 text-[11.5px] leading-snug text-muted-foreground">{i.desc}</div>
                {/* assignee + store */}
                <div className="flex items-center justify-between border-t border-border pt-2">
                  <div className="flex items-center gap-1.5">
                    <div className={cn('flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[9.5px] font-bold text-white', avC(i.assignee||'U'))}>{(i.assignee||'U')[0]}</div>
                    <span className="text-[11.5px] text-foreground/80">{i.assignee}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">{i.store}</span>
                </div>
                {/* dates */}
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-[10.5px] text-muted-foreground">Created {i.created}</span>
                  <span className="text-[11px] font-semibold" style={{ color: i.ov ? '#e02424' : 'var(--text3)' }}>Due {i.due}</span>
                </div>
              </div>
            )) : (
              <div className="col-span-full p-10 text-center text-muted-foreground">&#x2705; No issues match your filters</div>
            )}
          </div>
          <div className="mt-3 flex justify-end text-xs text-muted-foreground"><span>{tableData.length} items</span></div>
        </div>
      )}

      {/* Board View */}
      {view === 'board' && (
        <div className="overflow-x-auto pb-1.5">
          <div className="flex items-start gap-3" style={{ minHeight: 220 }}>
            {boardCols.map(col => {
              const items = filtered.filter(i => i.status === col);
              return (
                <div key={col} className="rounded-[10px] border border-border bg-[#fafbfc] p-2.5" style={{ flex: '0 0 250px' }}>
                  <div className="mb-2.5 flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground/80">{col}</span>
                    <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground">{items.length}</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {items.length ? items.map(i => (
                      <div key={i.id} className="rounded-lg border border-border bg-card p-2.5" style={{ borderLeft: `3px solid ${colColor[col]}` }}>
                        <div className="mb-1 text-xs font-semibold text-foreground">{i.title}</div>
                        <div className="mb-1.5 flex flex-wrap gap-1">
                          <Badge className={prC(i.pri)}>{i.pri}</Badge>
                          {i.ov && <Badge className="bg-red-50 text-red-800">Overdue</Badge>}
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <div className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white', avC(i.assignee||'U'))}>{(i.assignee||'U')[0]}</div>
                            <span className="text-[11px] text-muted-foreground">{i.store}</span>
                          </div>
                          <span className="text-[10.5px]" style={{ color: i.ov ? '#e02424' : 'var(--text3)' }}>{i.due}</span>
                        </div>
                      </div>
                    )) : (
                      <div className="py-3.5 text-center text-[11px] text-muted-foreground">No issues</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex justify-end text-xs text-muted-foreground"><span>{filtered.length} items</span></div>
        </div>
      )}

      {/* ── Issue Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} className="w-[660px] max-w-[95vw]">
        {/* header */}
        <div className="mb-4.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="cursor-pointer text-base text-muted-foreground" onClick={() => setModalOpen(false)}>&times;</span>
            <span className="text-[15px] font-bold text-foreground">{editId ? 'Edit Issue' : 'New Issue'}</span>
          </div>
          <Button size="sm" onClick={saveIssue}>{editId ? 'Save Changes' : 'Save'}</Button>
        </div>

        <div className="grid gap-3">
          {/* title + status (2-col) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Title <span className="text-destructive">*</span></label>
              <Input placeholder="Short summary of the issue" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select className={fieldClass} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option>Open</option><option>In Progress</option><option>On Hold</option><option>Resolved</option><option>Closed</option>
              </select>
            </div>
          </div>

          {/* description */}
          <div>
            <label className={labelClass}>Description</label>
            <textarea className={cn(fieldClass, 'min-h-[72px] resize-y')} placeholder="Describe the issue, steps, context..." value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} />
          </div>

          {/* priority + store + assignee (3-col) */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Priority <span className="text-destructive">*</span></label>
              <select className={fieldClass} value={form.pri} onChange={e => setForm(f => ({ ...f, pri: e.target.value }))}>
                <option>Critical</option><option>High</option><option>Medium</option><option>Low</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Store <span className="text-destructive">*</span></label>
              <select className={fieldClass} value={form.store} onChange={e => setForm(f => ({ ...f, store: e.target.value }))}>
                <option value="">Select store</option>
                {modalStoreOpts.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Assignee</label>
              <select className={fieldClass} value={form.assignee} onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}>
                <option>Jitendra</option><option>Lisa</option><option>Raj</option><option>Zed</option>
              </select>
            </div>
          </div>

          {/* created at + due at (2-col) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Created At <span className="text-destructive">*</span></label>
              <Input type="datetime-local" value={form.created} onChange={e => setForm(f => ({ ...f, created: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Due At <span className="text-destructive">*</span></label>
              <Input type="datetime-local" value={form.due} onChange={e => setForm(f => ({ ...f, due: e.target.value }))} />
            </div>
          </div>

          {/* audit id + tags (2-col) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Audit ID</label>
              <Input placeholder="Link to Audit (optional)" value={form.aid} onChange={e => setForm(f => ({ ...f, aid: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Tags</label>
              <Input placeholder="Type and press Enter to add tags" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} />
            </div>
          </div>

          {/* file attachments */}
          <div>
            <label className={labelClass}>Attachments</label>
            <input type="file" multiple className="hidden" id="iss-file-input" onChange={handleAddFiles} />
            <Button size="sm" variant="outline" onClick={() => document.getElementById('iss-file-input').click()}>&#x1F4CE; Add files</Button>
            <div className="mt-1.5">
              {files.map((n, idx) => (
                <div key={idx} className="mr-1 mb-1 inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2 py-1 text-[11.5px]">
                  &#x1F4CE; {n} <span className="cursor-pointer text-muted-foreground" onClick={() => removeFile(idx)}>&times;</span>
                </div>
              ))}
            </div>
          </div>

          {/* comments */}
          <div>
            <label className={labelClass}>Comments</label>
            <textarea className={cn(fieldClass, 'min-h-[52px] resize-y')} placeholder="Write a comment..." value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} />
          </div>
        </div>
      </Modal>
    </>
  );
}
