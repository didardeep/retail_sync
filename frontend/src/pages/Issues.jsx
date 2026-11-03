import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { api, loadSession } from '../api/client';
import { issuesApi } from '../api/issuesApi';
import { avC, prC, stC, exportCSV } from '../utils/helpers';
import { cn, fieldClass, labelClass } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal } from '../components/Modal';
import { EvidenceList, EvidencePicker } from '../components/Evidence';
import { useUrlFilters } from '@/lib/useUrlFilters';
import { auditsLink } from '@/lib/links';
import { needsReview } from '@/lib/statuses';

function stBorder(s) {
  return s === 'In Progress' ? '#00338D' : s === 'Resolved' ? '#0e9f6e' : s === 'On Hold' ? '#f59e0b' : s === 'Closed' ? '#6b7280' : '#e02424';
}

const colColor = { Open: '#e02424', 'In Progress': '#00338D', 'On Hold': '#f59e0b', Resolved: '#0e9f6e', Closed: '#6b7280' };

function fmtLocalDate(d) {
  const dt = new Date(d);
  const pad = n => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function fmtDisp(d) {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// What each KPI tile counts; the same test filters the list when the tile is clicked.
const DONE = ['Resolved', 'Closed'];
const KPI_TEST = {
  open_not_due: (i) => !i.ov && !DONE.includes(i.status),
  overdue: (i) => i.ov === true && !DONE.includes(i.status),
  completed: (i) => DONE.includes(i.status),
};

/* Shape a server issue for display. The form reads these fields back. */
function normalizeIssue(iss) {
  return {
    ...iss,
    pri: iss.priority || 'Medium',
    store: iss.store || iss.store_id || '',
    storeId: iss.store_id || '',
    assignee: iss.assignee || 'Unassigned',
    assigneeId: iss.assignee_id || '',
    desc: iss.description || '',
    aid: iss.audit_id || '',
    created: iss.created_at ? fmtDisp(new Date(iss.created_at)) : '',
    due: iss.due_date || '',
    ov: iss.overdue || false,
    actionTaken: iss.action_taken || '',
    evidence: iss.evidence || [],
    responseEvidence: iss.response_evidence || [],
    history: iss.meta?.history || [],
  };
}

// Where an issue came from: the question, the answer given and the audit.
// Shown to everyone who opens an issue raised from an audit question.
function IssueContext({ issue, showAudit }) {
  if (!issue.question && !issue.history.length) return null;
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3 text-[12px]">
      {issue.question && (
        <>
          <div><span className="text-muted-foreground">Question: </span><span className="font-medium text-foreground">{issue.question}</span></div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span><span className="text-muted-foreground">Answer: </span><b>{issue.answer}</b></span>
            {issue.remarks && <span><span className="text-muted-foreground">Auditor note: </span>{issue.remarks}</span>}
            {showAudit && issue.aid && <span><span className="text-muted-foreground">Audit: </span><b>{issue.aid}</b>{issue.audit_date ? `, ${issue.audit_date.substring(0, 10)}` : ''}</span>}
            {issue.raised_by && <span><span className="text-muted-foreground">Raised by: </span>{issue.raised_by}</span>}
          </div>
          {issue.responseEvidence.length > 0 && (
            <div>
              <div className="mb-1 text-muted-foreground">Auditor evidence ({issue.responseEvidence.length} {issue.responseEvidence.length === 1 ? 'item' : 'items'}):</div>
              <EvidenceList items={issue.responseEvidence} />
            </div>
          )}
        </>
      )}
      {issue.history.length > 0 && (
        <div>
          <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Activity</div>
          {issue.history.map((h, idx) => (
            <div key={idx} className="border-t border-border py-1 first:border-0">
              <b>{h.by}</b> set <b>{h.status}</b> <span className="text-muted-foreground">{(h.at || '').substring(0, 16).replace('T', ' ')}</span>
              {h.reply ? <div className="text-foreground/80">{h.reply}</div> : null}
              {h.evidence?.length > 0 && <div className="mt-1"><EvidenceList items={h.evidence} /></div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Issues() {
  const toast = useToast();
  const navigate = useNavigate();
  const { filters, setFilter, setMany, clearAll } = useUrlFilters(['status', 'priority', 'store', 'kpi', 'id']);
  const [issues, setIssues] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('table');
  const [search, setSearch] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');

  /* modal state */
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({
    title: '', status: 'Open', desc: '', pri: 'Critical', storeId: '', assigneeId: '',
    due: '', aid: '', actionTaken: ''
  });
  const [saving, setSaving] = useState(false);
  const editIssue = editId ? issues.find(x => x.id === editId) : null;
  // Store managers may only change status and action taken, so the form shows just those.
  const role = loadSession()?.user?.role;
  const isStoreManager = role === 'STORE_MANAGER';
  // An auditee sees only the issues assigned to them and can reply and set the status,
  // like a store manager, except that closing an issue stays with the audit manager.
  const isAuditee = role === 'AUDITEE';
  const isLimited = isStoreManager || isAuditee;
  // An auditor reviews the answers to issues from their own audits and edits nothing.
  const isAuditor = role === 'AUDITOR';
  // Cluster heads and HO follow issues without changing them.
  const isViewer = role === 'CLUSTER_HEAD' || role === 'HO_OPERATIONS';
  const [reviewNote, setReviewNote] = useState('');
  const isManager = role === 'ADMIN' || role === 'AUDIT_MANAGER';
  // The manager does not edit an existing issue: they read the reply and evidence, then approve or deny.
  const managerReview = isManager && !!editId;
  // An issue with an action recorded and not yet closed is waiting for the manager's decision.
  const decidable = managerReview && !!editIssue && !!editIssue.actionTaken && editIssue.status !== 'Closed';
  // The audit manager approves or denies the action taken.
  const [decision, setDecision] = useState({ reason: '' });
  // Auditees of the issue's store, listed first in the assignee picker.
  const [storeAuditees, setStoreAuditees] = useState([]);
  const canDelete = role === 'ADMIN' || role === 'AUDIT_MANAGER';
  const canCreate = !isLimited && !isAuditor && !isViewer;
  const statusChoices = isAuditee ? ['Open', 'In Progress', 'On Hold', 'Resolved'] : ['Open', 'In Progress', 'On Hold', 'Resolved', 'Closed'];

  useEffect(() => {
    Promise.all([
      api.issues().catch(() => []),
      api.stores().catch(() => []),
    ]).then(([i, s]) => {
      const normalized = (i || []).map(normalizeIssue);
      setIssues(normalized);
      setStores(s || []);
      setLoading(false);
      // open detail from ?id= query param
      const idParam = filters.id;
      if (idParam) {
        const found = normalized.find(x => x.id === idParam);
        if (found) openEditIssueData(found);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isManager || !modalOpen || !form.storeId) { setStoreAuditees([]); return undefined; }
    let cancelled = false;
    api.storeAuditees(form.storeId).then(list => { if (!cancelled) setStoreAuditees(list || []); })
      .catch(() => { if (!cancelled) setStoreAuditees([]); });
    return () => { cancelled = true; };
  }, [isManager, modalOpen, form.storeId]);

  async function reassignIssue(assigneeId) {
    if (!assigneeId || assigneeId === editIssue?.assigneeId) return;
    setSaving(true);
    try {
      const saved = normalizeIssue(await issuesApi.update(editId, { assignee_id: assigneeId }));
      setIssues(prev => prev.map(x => (x.id === saved.id ? saved : x)));
      toast('Issue reassigned');
    } catch (e) {
      toast.error(e.message || 'Could not reassign the issue');
    } finally {
      setSaving(false);
    }
  }

  async function decideIssue(kind) {
    if (kind === 'deny' && !decision.reason.trim()) { toast.error('Say why the action taken is denied'); return; }
    if (kind === 'approve' && !window.confirm('Approve the action taken and close this issue?')) return;
    setSaving(true);
    try {
      const saved = normalizeIssue(await api.decideIssue(editId, kind, decision.reason.trim()));
      setIssues(prev => prev.map(x => (x.id === saved.id ? saved : x)));
      setForm(f => ({ ...f, status: saved.status }));
      setDecision({ reason: '' });
      toast(kind === 'approve' ? 'Approved; the issue is closed' : 'Denied; the issue is open again and the assignee was told');
    } catch (e) {
      toast.error(e.message || 'Could not save the decision');
    } finally {
      setSaving(false);
    }
  }

  /* ── derived data ── */
  const storeOpts = [...new Set(issues.map(i => i.store).filter(Boolean))];
  const assigneeOpts = [...new Set(issues.map(i => i.assignee).filter(Boolean))];

  const filtered = issues.filter(i => {
    if (search) {
      const q = search.toLowerCase();
      if (!(i.title||'').toLowerCase().includes(q) && !(i.desc||'').toLowerCase().includes(q)) return false;
    }
    if (filters.status && i.status !== filters.status) return false;
    if (filters.priority && i.pri !== filters.priority) return false;
    if (filters.store && i.store !== filters.store) return false;
    if (assigneeFilter && i.assignee !== assigneeFilter) return false;
    if (filters.kpi && KPI_TEST[filters.kpi] && !KPI_TEST[filters.kpi](i)) return false;
    return true;
  });

  const tableData = filtered;

  /* KPI counts from full issues array */
  const totalCount = issues.length;
  const openNotDue = issues.filter(KPI_TEST.open_not_due).length;
  const overdueCount = issues.filter(KPI_TEST.overdue).length;
  const completedCount = issues.filter(KPI_TEST.completed).length;

  // A tile shows only the issues it counts (and clears the status / priority
  // dropdowns, which would otherwise hide some of them); clicking it again clears it.
  function pickKpi(kpi) {
    setMany({ kpi: filters.kpi === kpi ? '' : kpi, status: '', priority: '' });
  }
  const tileClass = (kpi) => cn(
    'flex cursor-pointer items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4 hover:bg-accent/40',
    filters.kpi === kpi && 'border-primary ring-1 ring-primary',
  );

  /* ── handlers ── */
  function setIssueView(v) {
    setView(v);
  }

  function clearFilters() {
    setSearch('');
    setAssigneeFilter('');
    clearAll();
  }

  function openEditIssueData(i) {
    setEditId(i.id);
    setForm({
      title: i.title,
      status: i.status,
      desc: i.desc || '',
      pri: i.pri,
      storeId: i.storeId,
      assigneeId: i.assigneeId,
      due: i.due || '',
      aid: i.aid || '',
      actionTaken: i.actionTaken || '',
      evidence: i.evidence
    });
    setDecision({ reason: '' });
    setModalOpen(true);
  }

  function openNewIssue() {
    setEditId(null);
    const due = new Date(Date.now() + 48 * 3600 * 1000);
    setForm({
      title: '', status: 'Open', desc: '', pri: 'Critical', storeId: '', assigneeId: '',
      due: fmtLocalDate(due), aid: '', actionTaken: ''
    });
    setModalOpen(true);
  }

  function openEditIssue(id) {
    const i = issues.find(x => x.id === id);
    if (i) openEditIssueData(i);
  }

  async function reviewIssue(decision) {
    if (decision === 'send_back' && !reviewNote.trim()) { toast.error('Say why it is sent back'); return; }
    setSaving(true);
    try {
      const saved = normalizeIssue(await issuesApi.review(editId, { decision, note: reviewNote }));
      setIssues(prev => prev.map(i => (i.id === editId ? saved : i)));
      toast(decision === 'accept' ? 'Answer accepted' : 'Sent back to the assignee');
      setModalOpen(false);
      setEditId(null);
      setReviewNote('');
    } catch (e) {
      toast.error(e.message || 'Could not save the review');
    } finally {
      setSaving(false);
    }
  }

  async function saveIssue() {
    if (saving) return;
    const body = isLimited
      ? { status: form.status, action_taken: form.actionTaken, evidence: form.evidence }
      : {
          title: form.title.trim(),
          description: form.desc,
          priority: form.pri,
          status: form.status,
          store_id: form.storeId || null,
          assignee_id: form.assigneeId || null,
          due_date: form.due || null,
        };
    if (!isLimited) {
      if (!body.title) { toast.error('Please enter a title'); return; }
      if (!body.store_id) { toast.error('Please select a store'); return; }
    }
    setSaving(true);
    try {
      if (editId) {
        const saved = normalizeIssue(await issuesApi.update(editId, body));
        setIssues(prev => prev.map(i => (i.id === editId ? saved : i)));
        toast('Issue updated');
      } else {
        const aid = form.aid.trim();
        const saved = normalizeIssue(await issuesApi.create(aid ? { ...body, audit_id: aid } : body));
        setIssues(prev => [saved, ...prev]);
        toast('Issue created');
      }
      setModalOpen(false);
      setEditId(null);
    } catch (e) {
      toast.error(`Could not save the issue: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteIssue(id) {
    if (!window.confirm('Delete this issue?')) return;
    try {
      await issuesApi.remove(id);
      setIssues(prev => prev.filter(i => i.id !== id));
      toast('Issue deleted');
    } catch (e) {
      toast.error(`Could not delete the issue: ${e.message}`);
    }
  }

  function handleExport() {
    const headers = ['ID', 'Audit ID', 'Title', 'Priority', 'Status', 'Store', 'Assignee', 'Due', 'Overdue'];
    const rows = issues.map(i => [i.id, i.aid, i.title, i.pri, i.status, i.store, i.assignee, i.due, i.ov ? 'Yes' : 'No']);
    exportCSV(rows, headers, 'issues.csv');
    toast('CSV exported');
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
          <h2 className="text-xl font-bold text-foreground">{isAuditee ? 'My Issues' : 'Action Taken Tracking'}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{isAuditee ? 'Issues assigned to you: reply with what you did and update the status' : 'Monitor, prioritise and resolve issues across stores'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant={view === 'table' ? 'default' : 'outline'} onClick={() => setIssueView('table')}>&#x1F4CB; Table</Button>
          <Button size="sm" variant={view === 'board' ? 'default' : 'outline'} onClick={() => setIssueView('board')}>&#x1F4CC; Board</Button>
          <Button size="sm" variant="outline" onClick={handleExport}>&#x2B07; Export</Button>
          {canCreate && <Button size="sm" onClick={openNewIssue}>+ New Issue</Button>}
        </div>
      </div>

      {/* KPI Row */}
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <div className={tileClass('')} onClick={() => setMany({ kpi: '', status: '', priority: '' })}>
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{ background: '#f3f4f6' }}>&#x1F4CA;</div>
          <div><div className="mb-0.5 text-[11px] text-muted-foreground">Total Issues</div><div className="text-2xl font-bold leading-none text-foreground">{totalCount}</div></div>
        </div>
        <div className={tileClass('open_not_due')} onClick={() => pickKpi('open_not_due')}>
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{ background: '#fffbeb' }}>&#x1F7E1;</div>
          <div><div className="mb-0.5 text-[11px] text-muted-foreground">Open (Not Due)</div><div className="text-2xl font-bold leading-none text-foreground">{openNotDue}</div></div>
        </div>
        <div className={tileClass('overdue')} onClick={() => pickKpi('overdue')}>
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{ background: '#fde8e8' }}>&#x1F534;</div>
          <div><div className="mb-0.5 text-[11px] text-muted-foreground">Open (Overdue)</div><div className="text-2xl font-bold leading-none text-foreground">{overdueCount}</div></div>
        </div>
        <div className={tileClass('completed')} onClick={() => pickKpi('completed')}>
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{ background: '#ecfdf5' }}>&#x2705;</div>
          <div><div className="mb-0.5 text-[11px] text-muted-foreground">Completed</div><div className="text-2xl font-bold leading-none text-foreground">{completedCount}</div></div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <div className="relative max-w-[250px] flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">&#x1F50D;</span>
          <Input className="pl-8" placeholder="Search title, description..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={filters.status} onChange={e => setFilter('status', e.target.value)}>
          <option value="">Status</option>
          <option>Open</option>
          <option>In Progress</option>
          <option>On Hold</option>
          <option>Resolved</option>
          <option>Closed</option>
        </select>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={filters.priority} onChange={e => setFilter('priority', e.target.value)}>
          <option value="">Priority</option>
          <option>Critical</option>
          <option>High</option>
          <option>Medium</option>
          <option>Low</option>
        </select>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={filters.store} onChange={e => setFilter('store', e.target.value)}>
          <option value="">Store</option>
          {storeOpts.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}>
          <option value="">Assignee</option>
          {assigneeOpts.map(a => <option key={a}>{a}</option>)}
        </select>
        <button className="flex h-[30px] w-[30px] items-center justify-center rounded-md border border-border bg-card text-[13px]" onClick={clearFilters} title="Clear filters">&#x1F504;</button>
      </div>

      {/* Table View */}
      {view === 'table' && (
        <div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
            {tableData.length ? tableData.map(i => (
              <div key={i.id} className="cursor-pointer rounded-[10px] border border-border bg-card p-3.5 hover:bg-accent/30" style={{ borderLeft: `4px solid ${stBorder(i.status)}` }} onClick={() => openEditIssue(i.id)}>
                {/* top row: audit id + overdue + actions */}
                <div className="mb-1.5 flex items-center justify-between">
                  {i.aid && isAuditee ? (
                    <span className="text-[11.5px] font-semibold text-muted-foreground">{i.aid}</span>
                  ) : i.aid ? (
                    <button className="text-[11.5px] font-semibold text-primary hover:underline" onClick={e => { e.stopPropagation(); navigate(auditsLink({ id: i.aid })); }}>{i.aid}</button>
                  ) : <span />}
                  <div className="flex items-center gap-1.5">
                    {i.ov && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-800">Overdue</span>}
                    <button className="flex h-[22px] w-[22px] items-center justify-center rounded-md border border-border bg-card text-[10px]" onClick={e => { e.stopPropagation(); openEditIssue(i.id); }}>&#x270F;&#xFE0F;</button>
                    {canDelete && <button className="flex h-[22px] w-[22px] items-center justify-center rounded-md border border-border bg-card text-[10px] text-destructive" onClick={e => { e.stopPropagation(); deleteIssue(i.id); }}>&#x1F5D1;</button>}
                  </div>
                </div>
                {/* title */}
                <div className="mb-1.5 text-[13.5px] font-semibold text-foreground">{i.title}</div>
                {/* badges */}
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <Badge className={stC(i.status)}>{i.status}</Badge>
                  <Badge className={prC(i.pri)}>{i.pri}</Badge>
                  {needsReview(i) && <Badge className="bg-amber-50 text-amber-800">To review</Badge>}
                  {i.meta?.review && <Badge className="bg-emerald-50 text-emerald-700">Accepted by {i.meta.review.by}</Badge>}
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
                      <div key={i.id} className="cursor-pointer rounded-lg border border-border bg-card p-2.5 hover:bg-accent/30" style={{ borderLeft: `3px solid ${colColor[col]}` }} onClick={() => openEditIssue(i.id)}>
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
            <span className="text-[15px] font-bold text-foreground">{isAuditor || managerReview ? 'Review Issue' : isViewer ? 'Issue' : editId ? 'Edit Issue' : 'New Issue'}</span>
          </div>
          {!isAuditor && !isViewer && !managerReview && <Button size="sm" onClick={saveIssue} disabled={saving}>{editId ? 'Save Changes' : 'Save'}</Button>}
        </div>

        {isAuditor || isViewer || managerReview ? (
          <div className="grid gap-3">
            <div className="text-[13px] font-semibold text-foreground">{form.title}</div>
            <div className="text-[11.5px] text-muted-foreground">{form.desc}</div>
            {editIssue && <IssueContext issue={editIssue} showAudit />}
            <div>
              <div className={labelClass}>Reply from {editIssue?.assignee}</div>
              <div className="text-[13px] text-foreground">{editIssue?.actionTaken || 'No reply yet.'}</div>
            </div>
            {!decidable && (
              <div>
                <div className={labelClass}>
                  Follow-up evidence
                  <span className="ml-1 font-normal normal-case text-muted-foreground">
                    ({editIssue?.evidence.length ? `${editIssue.evidence.length} ${editIssue.evidence.length === 1 ? 'item' : 'items'} attached` : 'none attached'})
                  </span>
                </div>
                <EvidenceList items={editIssue?.evidence} />
              </div>
            )}
            {isViewer ? null : managerReview ? (
              <>
            {managerReview && editIssue && editIssue.status !== 'Closed' && storeAuditees.length > 0 && (
              <div>
                <label className={labelClass} htmlFor="reassign-issue">Assigned to</label>
                <select id="reassign-issue" className={fieldClass} value={editIssue.assigneeId || ''} disabled={saving}
                  onChange={e => reassignIssue(e.target.value)}>
                  {!editIssue.assigneeId && <option value="">Unassigned</option>}
                  {storeAuditees.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Only auditees of this store can take it. The change is added to the history.</p>
              </div>
            )}
            {decidable && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="mb-1 text-[12.5px] font-semibold text-foreground">Action taken by {editIssue.assignee}</div>
                <div className="mb-2 whitespace-pre-wrap text-[12.5px] text-foreground/80">{editIssue.actionTaken}</div>
                <div className="mb-2">
                  <div className={labelClass}>
                    Evidence provided
                    <span className="ml-1 font-normal normal-case text-muted-foreground">
                      ({editIssue.evidence.length ? `${editIssue.evidence.length} ${editIssue.evidence.length === 1 ? 'item' : 'items'} attached` : 'none attached'})
                    </span>
                  </div>
                  <EvidenceList items={editIssue.evidence} />
                </div>
                <label className={labelClass} htmlFor="decision-reason">Reason (needed to deny)</label>
                <textarea id="decision-reason" className={cn(fieldClass, 'min-h-[56px] resize-y')} placeholder="What is still not right" value={decision.reason} onChange={e => setDecision(d => ({ ...d, reason: e.target.value }))} />
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="outline" className="border-red-200 text-destructive" disabled={saving} onClick={() => decideIssue('deny')}>Deny</Button>
                  <Button disabled={saving} onClick={() => decideIssue('approve')}>Approve &amp; close</Button>
                </div>
              </div>
            )}
            {editIssue?.meta?.decisions?.length > 0 && (
              <div className="rounded-lg border border-border p-3 text-[12px]">
                <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Decisions</div>
                {editIssue.meta.decisions.map((d, idx) => (
                  <div key={idx} className="border-t border-border py-1.5 first:border-0">
                    <Badge className={d.decision === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}>{d.decision === 'approved' ? 'Approved' : 'Denied'}</Badge>
                    <span className="ml-1.5"><b>{d.by}</b> <span className="text-muted-foreground">{(d.at || '').substring(0, 16).replace('T', ' ')}</span></span>
                    {d.reason && <div className="mt-0.5 text-foreground/80">{d.reason}</div>}
                    {d.evidence?.length > 0 && <div className="mt-1"><EvidenceList items={d.evidence} /></div>}
                  </div>
                ))}
              </div>
            )}
                {editIssue && editIssue.status !== 'Closed' && !editIssue.actionTaken && (
                  <p className="text-xs text-muted-foreground">Nothing to decide yet: the assignee has not recorded an action.</p>
                )}
              </>
            ) : editIssue && needsReview(editIssue) ? (
              <>
                <div>
                  <label className={labelClass} htmlFor="review-note">Your note</label>
                  <textarea id="review-note" className={cn(fieldClass, 'min-h-[60px] resize-y')} placeholder="Needed if you send it back" value={reviewNote} onChange={e => setReviewNote(e.target.value)} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" disabled={saving} onClick={() => reviewIssue('send_back')}>Send back</Button>
                  <Button disabled={saving} onClick={() => reviewIssue('accept')}>Accept</Button>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {editIssue?.meta?.review ? 'You can review an issue once. The audit manager closes it next.' : 'This can be reviewed once the assignee marks it Resolved.'}
              </p>
            )}
          </div>
        ) : isLimited ? (
          <div className="grid gap-3">
            <div className="text-[13px] font-semibold text-foreground">{form.title}</div>
            <div className="text-[11.5px] text-muted-foreground">{form.desc}</div>
            {editIssue && <IssueContext issue={editIssue} showAudit />}
            <div>
              <label className={labelClass}>Status</label>
              <select className={fieldClass} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {statusChoices.map(s => <option key={s}>{s}</option>)}
                {!statusChoices.includes(form.status) && <option disabled>{form.status}</option>}
              </select>
            </div>
            <div>
              <label className={labelClass}>{isAuditee ? 'Your reply' : 'Action taken'}</label>
              <textarea className={cn(fieldClass, 'min-h-[72px] resize-y')} placeholder={isAuditee ? 'What you did about this issue' : 'What was done about this issue'} value={form.actionTaken} onChange={e => setForm(f => ({ ...f, actionTaken: e.target.value }))} />
            </div>
            <div>
              <div className={labelClass}>Evidence</div>
              <EvidencePicker value={form.evidence} onChange={next => setForm(f => ({ ...f, evidence: next }))} />
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            {editIssue && <IssueContext issue={editIssue} showAudit />}
            {editIssue?.evidence.length > 0 && (
              <div>
                <div className={labelClass}>Follow-up evidence</div>
                <EvidenceList items={editIssue.evidence} />
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

            <div>
              <label className={labelClass}>Description</label>
              <textarea className={cn(fieldClass, 'min-h-[72px] resize-y')} placeholder="Describe the issue, steps, context..." value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={labelClass}>Priority <span className="text-destructive">*</span></label>
                <select className={fieldClass} value={form.pri} onChange={e => setForm(f => ({ ...f, pri: e.target.value }))}>
                  <option>Critical</option><option>High</option><option>Medium</option><option>Low</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Store <span className="text-destructive">*</span></label>
                <select className={fieldClass} value={form.storeId} onChange={e => setForm(f => ({ ...f, storeId: e.target.value, assigneeId: '' }))}>
                  <option value="">Select store</option>
                  {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Assignee</label>
                <select className={fieldClass} value={form.assigneeId} disabled={!form.storeId}
                  onChange={e => setForm(f => ({ ...f, assigneeId: e.target.value }))}>
                  <option value="">Unassigned</option>
                  {storeAuditees.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {!form.storeId ? 'Pick a store first.' : storeAuditees.length ? 'Only auditees linked to this store can be assigned.' : 'This store has no auditee yet: add one in Store Management.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Due Date</label>
                <Input type="date" value={form.due} onChange={e => setForm(f => ({ ...f, due: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>Audit ID</label>
                <Input placeholder="Link to Audit (optional)" value={form.aid} disabled={!!editId} onChange={e => setForm(f => ({ ...f, aid: e.target.value }))} />
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
