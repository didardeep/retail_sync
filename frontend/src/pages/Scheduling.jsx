import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, CheckCircle2, ClipboardList, Eye, Loader2, Pencil, UserX, XCircle } from 'lucide-react';

import { useToast } from '../components/Toast';
import { api } from '../api/client';
import { fetchAuditRows, scheduleApiFor, sopScheduleApi } from '../api/sopSchedule';
import { avC } from '../utils/helpers';
import { cn, fieldClass, labelClass } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Modal, ModalActions, Drawer } from '../components/Modal';
import AuditRowStatus from '@/components/AuditRowStatus';
import Tile from '@/components/Tile';
import {
  UNASSIGNED, distinctOptions, filterRows, formatDate, formatTime, kpiCounts,
  mergeRows, scoreLabel,
} from '@/lib/auditRows';
import { auditsLink, sopAuditReviewLink } from '@/lib/links';
import { STAGES } from '@/lib/statuses';
import { useUrlFilters } from '@/lib/useUrlFilters';

const PER_PAGE = 8;
const FILTER_KEYS = ['stage', 'kind', 'auditor', 'store', 'region', 'q', 'id', 'new'];
const AUDIT_TYPES = ['Checklist based Audit', 'Store Visit', 'Structured data analysis', 'Unstructured data analysis'];
const KIND_LABEL = { legacy: 'Checklist audit', sop: 'SOP tool' };

const EMPTY_FORM = {
  kind: 'sop', tool: '', checklist_id: '', audit_type: AUDIT_TYPES[0],
  store_id: '', auditor_id: '', date: '', time: '10:00', notes: '',
};

function errorMessage(e) {
  const d = e.detail || {};
  if (e.status === 409 && d.error === 'auditor unavailable') {
    return `Auditor is unavailable on that day${d.reason ? ` (${d.reason})` : ''}`;
  }
  if (e.status === 409 && d.audit_id) {
    return clashText(d);
  }
  return e.message || 'Something went wrong';
}

// "Auditor is already booked that day at Select Citywalk (11:00)"
function clashText(c) {
  const where = c.store ? ` at ${c.store}` : ' at another store';
  const at = c.scheduled_at ? ` (${formatTime(c.scheduled_at)})` : '';
  return `Auditor is already booked that day${where}${at}`;
}

function conflictText(c) {
  if (!c) return '';
  if (c.error === 'auditor unavailable') return `Auditor is unavailable on that day${c.reason ? ` (${c.reason})` : ''}.`;
  return `${clashText(c)}.`;
}

export default function Scheduling() {
  const toast = useToast();
  const { filters, setFilter, toggle, clearAll } = useUrlFilters(FILTER_KEYS);
  const [legacy, setLegacy] = useState([]);
  const [sop, setSop] = useState([]);
  const [stores, setStores] = useState([]);
  const [auditors, setAuditors] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  // modal
  const [modal, setModal] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(null);

  async function reload() {
    const [l, s] = await fetchAuditRows();
    setLegacy(l || []);
    setSop(s || []);
  }

  useEffect(() => {
    Promise.all([
      fetchAuditRows().catch(() => [[], []]),
      api.stores().catch(() => []),
      api.users('AUDITOR').catch(() => []),
      api.sopTemplates().catch(() => []),
      api.checklists().catch(() => []),
    ]).then(([[l, s], st, us, tp, cl]) => {
      setLegacy(l || []);
      setSop(s || []);
      setStores(st || []);
      setAuditors((us || []).filter((u) => u.active !== false));
      setTemplates(tp || []);
      setChecklists((cl || []).filter((c) => c.is_active !== false));
      setLoading(false);
    });
  }, []);

  // ?new=sop (or legacy) opens the form once the data is in, then leaves the URL clean.
  useEffect(() => {
    if (loading || !filters.new) return;
    openAdd(filters.new === 'sop' ? 'sop' : 'legacy');
    setFilter('new', '');
  }, [loading, filters.new]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => mergeRows(legacy, sop), [legacy, sop]);
  const openId = filters.id;
  // Tiles count everything except the stage filter, so they stay a way to switch stage.
  const forTiles = useMemo(
    () => filterRows(rows, {
      kind: filters.kind, auditor: filters.auditor, store: filters.store,
      region: filters.region, q: filters.q,
    }),
    [rows, filters.kind, filters.auditor, filters.store, filters.region, filters.q],
  );
  const counts = kpiCounts(forTiles);
  const filtered = useMemo(() => filterRows(forTiles, { stage: filters.stage }), [forTiles, filters.stage]);

  const regionOptions = useMemo(() => distinctOptions(rows, 'region', 'region'), [rows]);
  const storeOptions = useMemo(() => distinctOptions(rows, 'store_id', 'store'), [rows]);

  const pages = Math.ceil(filtered.length / PER_PAGE);
  const pageNo = Math.min(page, Math.max(pages, 1));
  const paged = filtered.slice((pageNo - 1) * PER_PAGE, pageNo * PER_PAGE);
  const drawerItem = openId ? rows.find((r) => r.id === openId) : null;

  function applyFilter(key, value) {
    setPage(1);
    setFilter(key, value);
  }

  function toggleTile(key, value) {
    setPage(1);
    toggle(key, value);
  }

  // Live clash hint while the form is open.
  const canCheck = modal && form.auditor_id && form.date && (form.store_id || editRow);
  useEffect(() => {
    if (!canCheck) { setConflict(null); return undefined; }
    let cancelled = false;
    const timer = setTimeout(() => {
      sopScheduleApi.conflicts({
        auditorId: form.auditor_id,
        date: form.date,
        storeId: editRow ? editRow.store_id : form.store_id,
        excludeId: editRow?.id,
        kind: editRow?.kind || form.kind,
      }).then((res) => { if (!cancelled) setConflict(res.conflict); })
        .catch(() => { if (!cancelled) setConflict(null); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [canCheck, form.auditor_id, form.date, form.store_id, form.kind, editRow]);

  function openAdd(kind = 'sop') {
    setEditRow(null);
    setConflict(null);
    setForm({ ...EMPTY_FORM, kind });
    setModal(true);
  }

  function openEdit(r) {
    setEditRow(r);
    setConflict(null);
    setForm({
      ...EMPTY_FORM, kind: r.kind, tool: r.tool_code || '', store_id: r.store_id || '',
      auditor_id: r.auditor_id || '', date: (r.date || '').slice(0, 10),
      time: (r.date || '').slice(11, 16) || '10:00', notes: r.notes || '',
    });
    setModal(true);
    setFilter('id', '');
  }

  async function save() {
    const isSop = form.kind === 'sop';
    if (!form.store_id && !editRow) { toast.error('Select a store'); return; }
    if (!form.date) { toast.error('Select a date'); return; }
    if (!editRow && isSop && (!form.tool || !form.auditor_id)) {
      toast.error('Select the audit tool and the auditor');
      return;
    }
    const scheduled_at = `${form.date}T${form.time || '10:00'}:00`;
    setSaving(true);
    try {
      if (editRow) {
        const body = { scheduled_at, notes: form.notes };
        if (form.auditor_id) body.auditor_id = form.auditor_id;
        await scheduleApiFor(editRow.kind).patch(editRow.id, body);
        toast.success('Schedule updated');
      } else if (isSop) {
        await sopScheduleApi.create({
          template_code: form.tool, store_id: form.store_id,
          auditor_id: form.auditor_id, scheduled_at, notes: form.notes || null,
        });
        toast.success('SOP audit scheduled');
      } else {
        await api.scheduleAudit({
          store_id: form.store_id, scheduled_at, auditor_id: form.auditor_id || null,
          audit_type: form.audit_type, notes: form.notes || null,
          checklist_id: form.checklist_id || null,
        });
        toast.success('Audit scheduled');
      }
      setModal(false);
      await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function cancelRow(r) {
    if (!window.confirm(`Cancel the ${r.tool} audit at ${r.store}? It stays in the history as Cancelled.`)) return;
    try {
      await scheduleApiFor(r.kind).cancel(r.id);
      toast.success('Audit cancelled');
      setFilter('id', '');
      await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const hasFilters = FILTER_KEYS.some((k) => k !== 'id' && k !== 'new' && filters[k]);
  const canChange = (r) => r.stage === 'scheduled';

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground">Loading schedules...</div>;
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile icon={ClipboardList} tint="#e8eefa" label="Total Audits" value={counts.total}
          active={!filters.stage && filters.auditor !== UNASSIGNED}
          onClick={() => { setPage(1); setFilter('stage', ''); if (filters.auditor === UNASSIGNED) setFilter('auditor', ''); }} />
        <Tile icon={CalendarDays} tint="#e8eefa" label="Scheduled" value={counts.scheduled}
          active={filters.stage === 'scheduled'} onClick={() => toggleTile('stage', 'scheduled')} />
        <Tile icon={Loader2} tint="#fffbeb" label="In progress" value={counts.in_progress}
          active={filters.stage === 'in_progress'} onClick={() => toggleTile('stage', 'in_progress')} />
        <Tile icon={CheckCircle2} tint="#ecfdf5" label="Completed" value={counts.completed}
          active={filters.stage === 'completed'} onClick={() => toggleTile('stage', 'completed')} />
        <Tile icon={UserX} tint="#fde8e8" label="Unassigned" value={counts.unassigned}
          active={filters.auditor === UNASSIGNED} onClick={() => toggleTile('auditor', UNASSIGNED)} />
      </div>

      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Input placeholder="Search audit, tool, store or auditor..." value={filters.q} onChange={(e) => applyFilter('q', e.target.value)} />
        </div>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={filters.kind} onChange={(e) => applyFilter('kind', e.target.value)} aria-label="Filter by type">
          <option value="">All types</option>
          <option value="legacy">Checklist audit</option>
          <option value="sop">SOP tool</option>
        </select>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={filters.stage} onChange={(e) => applyFilter('stage', e.target.value)} aria-label="Filter by status">
          <option value="">Status</option>
          {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={filters.region} onChange={(e) => applyFilter('region', e.target.value)} aria-label="Filter by region">
          <option value="">Region</option>
          {regionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={filters.store} onChange={(e) => applyFilter('store', e.target.value)} aria-label="Filter by store">
          <option value="">Store</option>
          {storeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={filters.auditor} onChange={(e) => applyFilter('auditor', e.target.value)} aria-label="Filter by auditor">
          <option value="">Auditor</option>
          <option value={UNASSIGNED}>Unassigned</option>
          {auditors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {hasFilters && <Button size="sm" variant="outline" onClick={() => { setPage(1); clearAll(); }}>Clear</Button>}
        <Button size="sm" onClick={() => openAdd('sop')}>+ Schedule Audit</Button>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Audit</TableHead><TableHead>Store</TableHead><TableHead>Schedule</TableHead><TableHead>Auditor</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 && (
              <TableRow><TableCell colSpan={6} className="p-10 text-center text-muted-foreground">No audits match these filters</TableCell></TableRow>
            )}
            {paged.map((s) => (
              <TableRow key={s.key}>
                <TableCell>
                  <div className="text-[12.5px] font-semibold">
                    {s.tool}{s.version > 1 ? <span className="ml-1 text-[10px] font-normal text-muted-foreground">v{s.version}</span> : null}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{KIND_LABEL[s.kind]}</div>
                </TableCell>
                <TableCell>
                  <div className="text-[12.5px] font-medium">{s.store}</div>
                  <div className="text-[11px] text-muted-foreground">{[s.city, s.region].filter(Boolean).join(', ')}</div>
                </TableCell>
                <TableCell>
                  <div className="text-[12.5px] font-semibold">{formatDate(s.date)}</div>
                  <div className="text-[11px] text-muted-foreground">{formatTime(s.date)}</div>
                </TableCell>
                <TableCell>
                  {s.auditor ? (
                    <div className="flex items-center gap-1.5">
                      <div className={cn('flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white', avC(s.auditor))}>{s.auditor[0]}</div>
                      <div className="text-[12.5px] font-semibold">{s.auditor}</div>
                    </div>
                  ) : <Badge className="bg-muted text-muted-foreground border border-border">Unassigned</Badge>}
                </TableCell>
                <TableCell>
                  <AuditRowStatus row={s} />
                  {scoreLabel(s) !== '--' && <div className="mt-1 text-[11px] text-muted-foreground">Score {scoreLabel(s)}</div>}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <button className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-border bg-card" onClick={() => setFilter('id', s.id)} title="View" aria-label="View"><Eye className="size-3.5" /></button>
                    {canChange(s) && <button className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-border bg-card" onClick={() => openEdit(s)} title="Edit" aria-label="Edit"><Pencil className="size-3.5" /></button>}
                    {canChange(s) && <button className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-border bg-card" onClick={() => cancelRow(s)} title="Cancel audit" aria-label="Cancel audit"><XCircle className="size-3.5 text-destructive" /></button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-3 flex items-center justify-end gap-1 text-xs text-muted-foreground">
        <span className="mr-2">{filtered.length} audits</span>
        {Array.from({ length: pages }, (_, i) => (
          <button key={i} className={cn('flex h-[27px] w-[27px] items-center justify-center rounded-md border border-border bg-card text-xs text-foreground/80', pageNo === i + 1 && 'border-primary bg-primary text-primary-foreground')} onClick={() => setPage(i + 1)}>{i + 1}</button>
        ))}
      </div>

      {/* Drawer */}
      <Drawer open={!!drawerItem} onClose={() => setFilter('id', '')}>
        {drawerItem && <>
          <div className="mb-1 flex items-center justify-between">
            <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Audit Reference</div>
            <button type="button" className="text-[15px] text-muted-foreground" onClick={() => setFilter('id', '')} aria-label="Close">&times;</button>
          </div>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="break-all text-base font-bold text-foreground">{drawerItem.kind === 'legacy' ? drawerItem.id : drawerItem.tool}</div>
            <AuditRowStatus row={drawerItem} />
          </div>
          <div className="mb-4 text-[13px] font-semibold text-foreground">
            {drawerItem.tool}{drawerItem.version ? ` (v${drawerItem.version})` : ''} - {KIND_LABEL[drawerItem.kind]}
          </div>

          <div className="mb-4">
            <div className="mb-0.5 text-[10.5px] uppercase tracking-wide text-muted-foreground">Store Location</div>
            <div className="text-[12.5px] font-semibold text-foreground">{drawerItem.store}</div>
            <div className="text-[11.5px] text-muted-foreground">{[drawerItem.city, drawerItem.region].filter(Boolean).join(', ')}</div>
          </div>
          <div className="mb-4">
            <div className="mb-0.5 text-[10.5px] uppercase tracking-wide text-muted-foreground">Scheduled Execution</div>
            <div className="text-[12.5px] font-semibold text-foreground">{formatDate(drawerItem.date)}</div>
            <div className="text-[11.5px] text-muted-foreground">{formatTime(drawerItem.date)}</div>
          </div>
          <div className="mb-4">
            <div className="mb-1 text-[10.5px] uppercase tracking-wide text-muted-foreground">Assigned Personnel</div>
            {drawerItem.auditor ? (
              <div className="flex items-center gap-2">
                <div className={cn('flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white', avC(drawerItem.auditor))}>{drawerItem.auditor[0]}</div>
                <div className="text-[12.5px] font-semibold">{drawerItem.auditor}</div>
              </div>
            ) : <Badge className="bg-muted text-muted-foreground border border-border">Unassigned</Badge>}
          </div>
          {scoreLabel(drawerItem) !== '--' && (
            <div className="mb-4 text-[12.5px]"><span className="text-muted-foreground">Score: </span><b>{scoreLabel(drawerItem)}</b></div>
          )}

          <div className="mb-1.5 text-[10.5px] uppercase tracking-wide text-muted-foreground">Audit Notes &amp; Objectives</div>
          <div className="mb-5 min-h-[60px] whitespace-pre-wrap rounded-lg border border-border px-2.5 py-2 text-[12.5px] text-foreground/80">{drawerItem.notes || 'No notes.'}</div>

          <div className="mb-3 flex gap-2">
            {canChange(drawerItem) && <Button className="flex-1" onClick={() => openEdit(drawerItem)}>Edit Audit</Button>}
            {canChange(drawerItem) && <Button variant="outline" className="border-red-200 text-destructive" onClick={() => cancelRow(drawerItem)}>Cancel audit</Button>}
          </div>
          <Link
            className="text-[12.5px] font-medium text-primary"
            to={drawerItem.kind === 'sop' ? sopAuditReviewLink(drawerItem.id) : auditsLink({ id: drawerItem.id })}
          >
            {drawerItem.kind === 'sop' ? 'Open audit' : 'View in Audit'}
          </Link>
        </>}
      </Drawer>

      {/* Modal */}
      <Modal open={modal} onClose={() => setModal(false)} className="w-[620px]">
        <div className="mb-4 text-[15px] font-bold text-foreground">{editRow ? 'Edit Scheduled Audit' : 'Schedule New Audit'}</div>
        <div className="grid gap-3">
          {!editRow && (
            <div className="flex gap-1 rounded-lg border border-border p-1" role="group" aria-label="Audit kind">
              {['sop', 'legacy'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setForm({ ...form, kind: k })}
                  className={cn('flex-1 rounded-md px-3 py-1.5 text-[12.5px] font-medium', form.kind === k ? 'bg-primary text-primary-foreground' : 'text-foreground/80 hover:bg-accent')}
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          )}

          {editRow ? (
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[12.5px]">
              <div className="font-semibold">{editRow.tool}{editRow.version ? ` (v${editRow.version})` : ''}</div>
              <div className="text-muted-foreground">{editRow.store} - {KIND_LABEL[editRow.kind]}</div>
            </div>
          ) : form.kind === 'sop' ? (
            <div>
              <label className={labelClass}>Audit tool <span className="text-destructive">*</span></label>
              <select className={fieldClass} value={form.tool} onChange={(e) => setForm({ ...form, tool: e.target.value })}>
                <option value="">Select an audit tool</option>
                {templates.map((t) => <option key={t.code} value={t.code}>{t.name} - {t.total_marks} marks (v{t.version})</option>)}
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Audit type</label>
                <select className={fieldClass} value={form.audit_type} onChange={(e) => setForm({ ...form, audit_type: e.target.value })}>
                  {AUDIT_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Checklist</label>
                <select className={fieldClass} value={form.checklist_id} onChange={(e) => setForm({ ...form, checklist_id: e.target.value })}>
                  <option value="">No checklist</option>
                  {checklists.map((c) => <option key={c.id} value={c.id}>{c.name} (v{c.version})</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {!editRow && (
              <div>
                <label className={labelClass}>Store <span className="text-destructive">*</span></label>
                <select className={fieldClass} value={form.store_id} onChange={(e) => setForm({ ...form, store_id: e.target.value })}>
                  <option value="">Select store</option>
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.name}{s.city ? ` - ${s.city}` : ''}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className={labelClass}>Auditor{form.kind === 'sop' && !editRow ? <span className="text-destructive"> *</span> : null}</label>
              <select className={fieldClass} value={form.auditor_id} onChange={(e) => setForm({ ...form, auditor_id: e.target.value })}>
                <option value="">{form.kind === 'sop' ? 'Select auditor' : 'Unassigned'}</option>
                {auditors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelClass}>Date <span className="text-destructive">*</span></label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div><label className={labelClass}>Time</label><Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></div>
          </div>

          {conflict && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[12.5px] text-amber-900" role="alert">
              {conflictText(conflict)} Saving will be refused.
            </div>
          )}

          <div><label className={labelClass}>Notes</label><textarea className={cn(fieldClass, 'min-h-[90px] resize-y')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Add any relevant notes..." /></div>
        </div>
        <ModalActions>
          <Button variant="outline" onClick={() => setModal(false)}>Close</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : editRow ? 'Save Changes' : 'Schedule'}</Button>
        </ModalActions>
      </Modal>
    </>
  );
}
