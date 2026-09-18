import { useState, useEffect } from 'react';
import { useToast } from '../components/Toast';
import { api } from '../api/client';
import { avC, prC, stC, exportCSV } from '../utils/helpers';

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
        due: form.due ? fmtDisp(new Date(form.due)).split(',')[0] : '\u2014',
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
    return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh',color:'var(--text3)'}}>Loading issues...</div>;
  }

  /* ── render ── */
  return (
    <>
      {/* Header */}
      <div className="page-hdr">
        <div>
          <h2>Action Taken Tracking</h2>
          <p>Monitor, prioritise and resolve issues across stores</p>
        </div>
        <div className="btn-row">
          <button className={`btn ${view === 'table' ? 'btn-primary' : 'btn-outline'} btn-sm`} onClick={() => setIssueView('table')}>&#x1F4CB; Table</button>
          <button className={`btn ${view === 'board' ? 'btn-primary' : 'btn-outline'} btn-sm`} onClick={() => setIssueView('board')}>&#x1F4CC; Board</button>
          <button className="btn btn-outline btn-sm" onClick={handleExport}>&#x2B07; Export</button>
          <button className="btn btn-primary btn-sm" onClick={openNewIssue}>+ New Issue</button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="kpi-row c4">
        <div className="kpi">
          <div className="kpi-ico" style={{ background: '#f3f4f6' }}>&#x1F4CA;</div>
          <div><div className="kpi-lbl">Total Issues</div><div className="kpi-val">{totalCount}</div></div>
        </div>
        <div className="kpi">
          <div className="kpi-ico" style={{ background: '#fffbeb' }}>&#x1F7E1;</div>
          <div><div className="kpi-lbl">Open (Not Due)</div><div className="kpi-val">{openNotDue}</div></div>
        </div>
        <div className="kpi">
          <div className="kpi-ico" style={{ background: '#fde8e8' }}>&#x1F534;</div>
          <div><div className="kpi-lbl">Open (Overdue)</div><div className="kpi-val">{overdueCount}</div></div>
        </div>
        <div className="kpi">
          <div className="kpi-ico" style={{ background: '#ecfdf5' }}>&#x2705;</div>
          <div><div className="kpi-lbl">Completed</div><div className="kpi-val">{completedCount}</div></div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="srch" style={{ maxWidth: 250 }}>
          <span className="srch-ic">&#x1F50D;</span>
          <input placeholder="Search title, tags..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="sel" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Status</option>
          <option>Open</option>
          <option>In Progress</option>
          <option>On Hold</option>
          <option>Closed</option>
        </select>
        <select className="sel" value={priFilter} onChange={e => setPriFilter(e.target.value)}>
          <option value="">Priority</option>
          <option>Critical</option>
          <option>High</option>
          <option>Medium</option>
          <option>Low</option>
        </select>
        <select className="sel" value={storeFilter} onChange={e => setStoreFilter(e.target.value)}>
          <option value="">Store</option>
          {storeOpts.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="sel" value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}>
          <option value="">Assignee</option>
          {assigneeOpts.map(a => <option key={a}>{a}</option>)}
        </select>
        <button className="icon-btn" onClick={clearFilters} title="Clear filters">&#x1F504;</button>
      </div>

      {/* Status Tabs */}
      {view === 'table' && (
        <div style={{ display: 'flex', gap: 5, marginBottom: 10, flexWrap: 'wrap' }}>
          {[{ label: 'All Status', val: '' }, { label: 'Open', val: 'Open' }, { label: 'In Progress', val: 'In Progress' }, { label: 'On Hold', val: 'On Hold' }, { label: 'Closed', val: 'Closed' }].map(t => (
            <button key={t.val} className={`qtab${statusTab === t.val ? ' active' : ''}`} onClick={() => setStatusTab(t.val)}>{t.label}</button>
          ))}
        </div>
      )}

      {/* Table View */}
      {view === 'table' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 12 }}>
            {tableData.length ? tableData.map(i => (
              <div key={i.id} style={{ background: '#fff', border: '1px solid var(--border)', borderLeft: `4px solid ${stBorder(i.status)}`, borderRadius: 10, padding: '13px 14px' }}>
                {/* top row: audit id + overdue + actions */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <a style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none', fontSize: 11.5 }}>{i.aid}</a>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {i.ov && <span style={{ background: '#fde8e8', color: '#9b1c1c', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4 }}>Overdue</span>}
                    <button className="icon-btn" style={{ width: 22, height: 22, fontSize: 10 }} onClick={() => openEditIssue(i.id)}>&#x270F;&#xFE0F;</button>
                    <button className="icon-btn" style={{ width: 22, height: 22, fontSize: 10, color: 'var(--red)' }} onClick={() => deleteIssue(i.id)}>&#x1F5D1;</button>
                  </div>
                </div>
                {/* title */}
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', marginBottom: 7 }}>{i.title}</div>
                {/* badges */}
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                  <span className={`badge ${stC(i.status)}`}>{i.status}</span>
                  <span className={`badge ${prC(i.pri)}`}>{i.pri}</span>
                </div>
                {/* description */}
                <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 10, lineHeight: 1.4 }}>{i.desc}</div>
                {/* assignee + store */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 9, borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div className={`av ${avC(i.assignee||'U')}`} style={{ width: 22, height: 22, fontSize: 9.5 }}>{(i.assignee||'U')[0]}</div>
                    <span style={{ fontSize: 11.5, color: 'var(--text2)' }}>{i.assignee}</span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>{i.store}</span>
                </div>
                {/* dates */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ fontSize: 10.5, color: 'var(--text3)' }}>Created {i.created}</span>
                  <span style={{ fontSize: 11, color: i.ov ? 'var(--red)' : 'var(--text3)', fontWeight: 600 }}>Due {i.due}</span>
                </div>
              </div>
            )) : (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--text3)' }}>&#x2705; No issues match your filters</div>
            )}
          </div>
          <div className="pagination"><span>{tableData.length} items</span></div>
        </div>
      )}

      {/* Board View */}
      {view === 'board' && (
        <div style={{ overflowX: 'auto', paddingBottom: 6 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minHeight: 220 }}>
            {boardCols.map(col => {
              const items = filtered.filter(i => i.status === col);
              return (
                <div key={col} style={{ flex: '0 0 250px', background: '#fafbfc', border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)' }}>{col}</span>
                    <span style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 20, padding: '1px 8px', fontSize: 11, color: 'var(--text3)' }}>{items.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.length ? items.map(i => (
                      <div key={i.id} style={{ background: '#fff', border: '1px solid var(--border)', borderLeft: `3px solid ${colColor[col]}`, borderRadius: 8, padding: '9px 10px' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 5 }}>{i.title}</div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                          <span className={`badge ${prC(i.pri)}`}>{i.pri}</span>
                          {i.ov && <span className="badge br">Overdue</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div className={`av ${avC(i.assignee||'U')}`} style={{ width: 20, height: 20, fontSize: 9 }}>{(i.assignee||'U')[0]}</div>
                            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{i.store}</span>
                          </div>
                          <span style={{ fontSize: 10.5, color: i.ov ? 'var(--red)' : 'var(--text3)' }}>{i.due}</span>
                        </div>
                      </div>
                    )) : (
                      <div style={{ textAlign: 'center', padding: '14px 0', color: 'var(--text3)', fontSize: 11 }}>No issues</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="pagination"><span>{filtered.length} items</span></div>
        </div>
      )}

      {/* ── Issue Modal ── */}
      {modalOpen && (
        <div className="modal-ov open" onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}>
          <div className="modal" style={{ width: 660, maxWidth: '95vw' }}>
            {/* header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }} onClick={() => setModalOpen(false)}>&times;</span>
                <span className="modal-title" style={{ marginBottom: 0 }}>{editId ? 'Edit Issue' : 'New Issue'}</span>
              </div>
              <button className="btn btn-primary btn-sm" onClick={saveIssue}>{editId ? 'Save Changes' : 'Save'}</button>
            </div>

            {/* title + status (2-col) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="fg">
                <label className="fl">Title <span style={{ color: 'var(--red)' }}>*</span></label>
                <input className="fi" placeholder="Short summary of the issue" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="fg">
                <label className="fl">Status</label>
                <select className="fs" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option>Open</option><option>In Progress</option><option>On Hold</option><option>Resolved</option><option>Closed</option>
                </select>
              </div>
            </div>

            {/* description */}
            <div className="fg">
              <label className="fl">Description</label>
              <textarea className="fta" placeholder="Describe the issue, steps, context..." value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} />
            </div>

            {/* priority + store + assignee (3-col) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="fg">
                <label className="fl">Priority <span style={{ color: 'var(--red)' }}>*</span></label>
                <select className="fs" value={form.pri} onChange={e => setForm(f => ({ ...f, pri: e.target.value }))}>
                  <option>Critical</option><option>High</option><option>Medium</option><option>Low</option>
                </select>
              </div>
              <div className="fg">
                <label className="fl">Store <span style={{ color: 'var(--red)' }}>*</span></label>
                <select className="fs" value={form.store} onChange={e => setForm(f => ({ ...f, store: e.target.value }))}>
                  <option value="">Select store</option>
                  {modalStoreOpts.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="fg">
                <label className="fl">Assignee</label>
                <select className="fs" value={form.assignee} onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}>
                  <option>Jitendra</option><option>Lisa</option><option>Raj</option><option>Zed</option>
                </select>
              </div>
            </div>

            {/* created at + due at (2-col) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="fg">
                <label className="fl">Created At <span style={{ color: 'var(--red)' }}>*</span></label>
                <input type="datetime-local" className="fi" value={form.created} onChange={e => setForm(f => ({ ...f, created: e.target.value }))} />
              </div>
              <div className="fg">
                <label className="fl">Due At <span style={{ color: 'var(--red)' }}>*</span></label>
                <input type="datetime-local" className="fi" value={form.due} onChange={e => setForm(f => ({ ...f, due: e.target.value }))} />
              </div>
            </div>

            {/* audit id + tags (2-col) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="fg">
                <label className="fl">Audit ID</label>
                <input className="fi" placeholder="Link to Audit (optional)" value={form.aid} onChange={e => setForm(f => ({ ...f, aid: e.target.value }))} />
              </div>
              <div className="fg">
                <label className="fl">Tags</label>
                <input className="fi" placeholder="Type and press Enter to add tags" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} />
              </div>
            </div>

            {/* file attachments */}
            <div className="fg">
              <label className="fl">Attachments</label>
              <input type="file" multiple style={{ display: 'none' }} id="iss-file-input" onChange={handleAddFiles} />
              <button className="btn btn-outline btn-sm" onClick={() => document.getElementById('iss-file-input').click()}>&#x1F4CE; Add files</button>
              <div style={{ marginTop: 6 }}>
                {files.map((n, idx) => (
                  <div key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f3f4f6', borderRadius: 6, padding: '4px 8px', fontSize: 11.5, margin: '2px 4px 2px 0' }}>
                    &#x1F4CE; {n} <span style={{ cursor: 'pointer', color: 'var(--text3)' }} onClick={() => removeFile(idx)}>&times;</span>
                  </div>
                ))}
              </div>
            </div>

            {/* comments */}
            <div className="fg">
              <label className="fl">Comments</label>
              <textarea className="fta" placeholder="Write a comment..." style={{ minHeight: 52 }} value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
