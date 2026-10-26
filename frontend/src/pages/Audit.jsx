import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  AlarmClock, CalendarDays, CheckCircle2, ClipboardList, Eye, Loader2, Pencil, Plus, UserX, X, XCircle,
} from 'lucide-react';

import { api, loadSession } from '../api/client';
import { scheduleApi } from '../api/scheduleApi';
import { avC, prC, stC } from '../utils/helpers';
import { cn, fieldClass } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Drawer } from '../components/Modal';
import { useToast } from '../components/Toast';
import AuditRowStatus from '@/components/AuditRowStatus';
import Tile from '@/components/Tile';
import NewAuditSection from '@/components/audit/NewAuditSection';
import ScheduledForYou from '@/components/audit/ScheduledForYou';
import ScheduleAuditModal, { scheduleErrorMessage } from '@/components/audit/ScheduleAuditModal';
import useAuditorWorkspace from '@/components/audit/useAuditorWorkspace';
import {
  ACTION_LABELS, filterStatusValue, isMine, rowAction,
  rowMatchesStatusFilter, scheduledForYou, statusChipLabel,
} from '@/components/audit/auditHelpers';
import {
  UNASSIGNED, auditRows, distinctOptions, durationLabel, filterRows, formatDate, formatTime, isOverdue,
  kpiCounts, scoreLabel,
} from '@/lib/auditRows';
import { progressPercent } from '@/lib/auditorStats';
import { STAGES } from '@/lib/statuses';
import { useUrlFilters } from '@/lib/useUrlFilters';

// stage / status / view all filter by status (see components/audit/auditHelpers
// rowMatchesStatusFilter); id opens the detail; new opens the schedule form
// (old /scheduling links land here).
const FILTER_KEYS = ['stage', 'status', 'view', 'store', 'region', 'auditor', 'q', 'id', 'new'];
const STATUS_OPTIONS = [...STAGES, { value: 'overdue', label: 'Overdue' }];
// Statuses a manager or admin may set by hand on a checklist audit (same list as the API).
const EDIT_STATUSES = ['Planned', 'Ongoing', 'Completed', 'Approved', 'Cancelled'];
const MANAGER_ROLES = ['AUDIT_MANAGER', 'ADMIN'];
const PER_PAGE = 10;

// Progress bar and "x% done" for an audit that is in progress (only when known).
function RowProgress({ row }) {
  const pct = row.stage === 'in_progress' ? progressPercent(row) : null;
  if (pct === null) return null;
  return (
    <div className="mt-1 flex items-center gap-1.5">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-semibold text-foreground">{pct}% done</span>
    </div>
  );
}

// Date on one line, time under it; '--' when unknown.
function DateCell({ iso, className }) {
  if (!iso) return <span className="text-muted-foreground">--</span>;
  return (
    <>
      <div className={cn('text-[12.5px] font-semibold', className)}>{formatDate(iso)}</div>
      <div className="text-[11px] text-muted-foreground">{formatTime(iso)}</div>
    </>
  );
}

// What the open audit looks like on the server, with its per-question responses.
function useAuditDetail(row) {
  const [state, setState] = useState({ loading: false, data: null, error: null });
  const id = row?.id || null;
  useEffect(() => {
    if (!id) return undefined;
    let cancelled = false;
    setState({ loading: true, data: null, error: null });
    api.audit(id)
      .then((data) => { if (!cancelled) setState({ loading: false, data, error: null }); })
      .catch((error) => { if (!cancelled) setState({ loading: false, data: null, error }); });
    return () => { cancelled = true; };
  }, [id]);
  return state;
}

function answerBadge(answer) {
  if (answer === 'Yes') return 'bg-emerald-50 text-emerald-700';
  if (answer === 'No') return 'bg-red-50 text-red-800';
  return 'bg-muted text-muted-foreground border border-border';
}

function Section({ label, children }) {
  return (
    <div className="mb-4">
      <div className="mb-1 text-[10.5px] uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

// Audit: every audit in one list, plus scheduling for managers and
// start / resume for auditors.
export default function Audit() {
  const { filters, setFilter, setMany, clearAll } = useUrlFilters(FILTER_KEYS);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const me = loadSession()?.user;
  const toast = useToast();
  const canEdit = MANAGER_ROLES.includes(me?.role);
  const isAuditor = me?.role === 'AUDITOR';
  const ws = useAuditorWorkspace();
  const { prepare } = ws;

  const [audits, setAudits] = useState(null);
  const [remoteError, setRemoteError] = useState(null);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  // Scheduling data (managers only).
  const [auditors, setAuditors] = useState([]);
  const [stores, setStores] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [schedule, setSchedule] = useState(null); // {} new, { row } edit

  const loadRemote = useCallback(async () => {
    try {
      setAudits(await api.audits());
      setRemoteError(null);
    } catch (e) {
      setRemoteError(e);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (navigator.onLine) {
        if (isAuditor) await prepare();
        await Promise.all([
          loadRemote(),
          api.issues().then((i) => { if (!cancelled) setIssues(i || []); }).catch(() => {}),
          canEdit
            ? Promise.all([
              api.users('AUDITOR').catch(() => []),
              api.stores().catch(() => []),
              api.checklists().catch(() => []),
            ]).then(([us, st, cl]) => {
              if (cancelled) return;
              setAuditors((us || []).filter((u) => u.active !== false));
              setStores(st || []);
              setChecklists((cl || []).filter((c) => c.is_active !== false));
            })
            : Promise.resolve(),
        ]);
      }
      if (!cancelled) setLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, [canEdit, isAuditor, prepare, loadRemote]);

  // ?new=1 opens the schedule form once the data is in, then leaves the URL clean.
  useEffect(() => {
    if (loading || !filters.new) return;
    if (canEdit) setSchedule({});
    setFilter('new', '');
  }, [loading, filters.new]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auditors only see their own audits.
  const rows = useMemo(() => {
    const all = auditRows(audits || []);
    return isAuditor ? all.filter((r) => isMine(r, ws.userId)) : all;
  }, [audits, isAuditor, ws.userId]);
  const scheduled = useMemo(() => scheduledForYou(rows), [rows]);
  const regionOptions = useMemo(() => distinctOptions(rows, 'region', 'region'), [rows]);
  const storeOptions = useMemo(() => distinctOptions(rows, 'store_id', 'store'), [rows]);
  const auditorOptions = useMemo(() => distinctOptions(rows, 'auditor_id', 'auditor'), [rows]);

  // Tiles count everything except the status filter, so they stay a way to switch status.
  const forTiles = useMemo(() => {
    const from = startDate ? new Date(`${startDate}T00:00:00`) : null;
    const to = endDate ? new Date(`${endDate}T23:59:59`) : null;
    return filterRows(rows, {
      store: filters.store,
      region: filters.region, auditor: filters.auditor, q: filters.q,
    }).filter((r) => {
      if (!from && !to) return true;
      const d = r.date ? new Date(r.date) : null;
      if (!d || Number.isNaN(d.getTime())) return false;
      return !(from && d < from) && !(to && d > to);
    });
  }, [rows, filters.store, filters.region, filters.auditor, filters.q, startDate, endDate]);
  const counts = kpiCounts(forTiles);
  const overdueCount = forTiles.filter((r) => isOverdue(r)).length;
  const statusKeys = { stage: filters.stage, status: filters.status, view: filters.view };
  const filtered = forTiles.filter((r) => rowMatchesStatusFilter(r, statusKeys));
  const statusValue = filterStatusValue(filters);
  const chipLabel = statusChipLabel(filters);

  const pages = Math.ceil(filtered.length / PER_PAGE);
  const pageNo = Math.min(page, Math.max(pages, 1));
  const paged = filtered.slice((pageNo - 1) * PER_PAGE, pageNo * PER_PAGE);

  const detailRow = filters.id ? rows.find((r) => r.id === filters.id) : null;
  const auditDetail = useAuditDetail(detailRow);
  const detailAction = detailRow ? rowAction(detailRow, ws.userId) : 'view';
  const detailIssues = detailRow ? issues.filter((i) => i.audit_id === detailRow.id) : [];

  function applyFilter(key, value) {
    setPage(1);
    setFilter(key, value);
  }

  function setStatus(value) {
    setPage(1);
    setMany({ stage: value, status: '', view: '' });
  }

  function toggleStatus(value) {
    setStatus(statusValue === value ? '' : value);
  }

  function clearFilters() {
    setPage(1);
    clearAll();
    setStartDate('');
    setEndDate('');
  }

  const anyFilter = FILTER_KEYS.some((k) => k !== 'id' && k !== 'new' && filters[k]) || startDate || endDate;
  const canChange = (r) => canEdit && r.stage === 'scheduled';

  function openEdit(row) {
    setFilter('id', '');
    setSchedule({ row });
  }

  async function cancelRow(r) {
    if (!window.confirm(`Cancel audit ${r.id} at ${r.store}? It stays in the history as Cancelled.`)) return;
    try {
      await scheduleApi.cancel(r.id);
      toast.success('Audit cancelled');
      setFilter('id', '');
      await loadRemote();
    } catch (e) {
      toast.error(scheduleErrorMessage(e));
    }
  }

  // A manager may set the status by hand.
  async function markAs(row, status) {
    try {
      await api.updateAudit(row.id, { status });
      toast('Audit updated');
      await loadRemote();
    } catch (e) {
      toast.error(e.message || 'Could not update the audit');
    }
  }

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground">Loading audit data...</div>;
  }

  const iconBtn = 'flex h-[26px] w-[26px] items-center justify-center rounded-md border border-border bg-card';
  const colCount = 7 + (isAuditor ? 0 : 1);

  return (
    <>
      {remoteError && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {ws.online
            ? `Some audits could not be loaded: ${remoteError.message}`
            : 'You are offline. Connect to see audits.'}
        </div>
      )}
      {!remoteError && !ws.online && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          You are offline. Connect to see audits.
        </div>
      )}

      <div className={cn('mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2', canEdit ? 'lg:grid-cols-6' : 'lg:grid-cols-5')}>
        <Tile icon={ClipboardList} tint="#e8eefa" label="Total Audits" value={counts.total}
          active={!statusValue && filters.auditor !== UNASSIGNED}
          onClick={() => { setPage(1); setMany({ stage: '', status: '', view: '', ...(filters.auditor === UNASSIGNED ? { auditor: '' } : {}) }); }} />
        <Tile icon={CalendarDays} tint="#e8eefa" label="Scheduled" value={counts.scheduled}
          active={statusValue === 'scheduled'} onClick={() => toggleStatus('scheduled')} />
        <Tile icon={Loader2} tint="#fffbeb" label="In progress" value={counts.in_progress}
          active={statusValue === 'in_progress'} onClick={() => toggleStatus('in_progress')} />
        <Tile icon={CheckCircle2} tint="#ecfdf5" label="Completed" value={counts.completed}
          active={statusValue === 'completed'} onClick={() => toggleStatus('completed')} />
        <Tile icon={AlarmClock} tint="#fde8e8" label="Overdue" value={overdueCount}
          active={statusValue === 'overdue'} onClick={() => toggleStatus('overdue')} />
        {canEdit && (
          <Tile icon={UserX} tint="#f3f4f6" label="Unassigned" value={counts.unassigned}
            active={filters.auditor === UNASSIGNED}
            onClick={() => applyFilter('auditor', filters.auditor === UNASSIGNED ? '' : UNASSIGNED)} />
        )}
      </div>

      {isAuditor && <ScheduledForYou rows={scheduled} openingKey={ws.openingKey} onOpen={ws.openRow} />}
      {isAuditor && showNew && (
        <NewAuditSection
          stores={ws.stores}
          checklists={ws.checklists}
          checklistsFailed={ws.checklistsFailed}
          online={ws.online}
          rows={rows}
          openingKey={ws.openingKey}
          onRun={ws.runOption}
          onClose={() => setShowNew(false)}
        />
      )}

      {/* Filter bar */}
      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Input placeholder="Search audit, store or auditor..." value={filters.q} onChange={(e) => applyFilter('q', e.target.value)} />
        </div>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={statusValue} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">Status</option>
          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={filters.region} onChange={(e) => applyFilter('region', e.target.value)} aria-label="Filter by region">
          <option value="">Region</option>
          {regionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={filters.store} onChange={(e) => applyFilter('store', e.target.value)} aria-label="Filter by store">
          <option value="">Store</option>
          {storeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {!isAuditor && (
          <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={filters.auditor} onChange={(e) => applyFilter('auditor', e.target.value)} aria-label="Filter by auditor">
            <option value="">Auditor</option>
            <option value={UNASSIGNED}>Unassigned</option>
            {auditorOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        <input type="date" className={cn(fieldClass, 'w-auto cursor-pointer')} value={startDate} onChange={(e) => { setPage(1); setStartDate(e.target.value); }} aria-label="From date" />
        <input type="date" className={cn(fieldClass, 'w-auto cursor-pointer')} value={endDate} onChange={(e) => { setPage(1); setEndDate(e.target.value); }} aria-label="To date" />
        {anyFilter && <Button size="sm" variant="outline" onClick={clearFilters}>Clear</Button>}
        {canEdit && <Button size="sm" onClick={() => setSchedule({})}>+ Schedule Audit</Button>}
        {isAuditor && (
          <Button size="sm" onClick={() => setShowNew((v) => !v)} aria-expanded={showNew}>
            <Plus className="size-4" />New audit
          </Button>
        )}
      </div>

      {chipLabel && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-medium text-foreground">
            Filter: {chipLabel}
            <button type="button" onClick={() => setStatus('')} className="inline-flex items-center gap-0.5 text-primary hover:underline" aria-label="Clear status filter">
              (clear)
              <X className="size-3" />
            </button>
          </span>
          <span className="text-muted-foreground">{filtered.length} shown</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-[10px] border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Audit</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Scheduled on</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              {!isAuditor && <TableHead>Auditor</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 && (
              <TableRow><TableCell colSpan={colCount} className="p-10 text-center text-muted-foreground">No audits match these filters</TableCell></TableRow>
            )}
            {paged.map((s) => {
              const overdue = isOverdue(s);
              const duration = durationLabel(s.start, s.due_at);
              const action = rowAction(s, ws.userId);
              return (
                <TableRow key={s.key} className={cn(overdue && 'bg-red-50/40')}>
                  <TableCell>
                    <div className="text-[12.5px] font-semibold">{s.id}</div>
                    <div className="text-[11px] text-muted-foreground">{s.tool}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-[12.5px] font-medium">{s.store}</div>
                    <div className="text-[11px] text-muted-foreground">{[s.city, s.region].filter(Boolean).join(', ')}</div>
                  </TableCell>
                  <TableCell><DateCell iso={s.scheduled_on} /></TableCell>
                  <TableCell><DateCell iso={s.start} /></TableCell>
                  <TableCell>
                    <DateCell iso={s.due_at} className={overdue ? 'text-destructive' : undefined} />
                    {duration && <div className="text-[11px] text-muted-foreground">{duration}</div>}
                  </TableCell>
                  {!isAuditor && (
                    <TableCell>
                      {s.auditor ? (
                        <div className="flex items-center gap-1.5">
                          <div className={cn('flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white', avC(s.auditor))}>{s.auditor[0]}</div>
                          <div className="text-[12.5px] font-semibold">{s.auditor}</div>
                        </div>
                      ) : <Badge className="bg-muted text-muted-foreground border border-border">Unassigned</Badge>}
                    </TableCell>
                  )}
                  <TableCell>
                    <AuditRowStatus row={s} />
                    <RowProgress row={s} />
                    {scoreLabel(s) !== '--' && <div className="mt-1 text-[11px] text-muted-foreground">Score {scoreLabel(s)}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {isAuditor && action !== 'view' ? (
                        <Button size="sm" className="h-7 px-2.5 text-[11px]" disabled={ws.openingKey === s.key} onClick={() => ws.openRow(s)}>
                          {ACTION_LABELS[action]}
                        </Button>
                      ) : (
                        <button className={iconBtn} onClick={() => setFilter('id', s.id)} title="View" aria-label="View"><Eye className="size-3.5" /></button>
                      )}
                      {canChange(s) && <button className={iconBtn} onClick={() => openEdit(s)} title="Edit" aria-label="Edit"><Pencil className="size-3.5" /></button>}
                      {canChange(s) && <button className={iconBtn} onClick={() => cancelRow(s)} title="Cancel audit" aria-label="Cancel audit"><XCircle className="size-3.5 text-destructive" /></button>}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-1 text-xs text-muted-foreground">
        <span className="mr-2">{filtered.length} audits</span>
        {Array.from({ length: pages }, (_, i) => (
          <button key={i} className={cn('flex h-[27px] w-[27px] items-center justify-center rounded-md border border-border bg-card text-xs text-foreground/80', pageNo === i + 1 && 'border-primary bg-primary text-primary-foreground')} onClick={() => setPage(i + 1)}>{i + 1}</button>
        ))}
      </div>

      {/* Detail drawer */}
      <Drawer open={!!detailRow} onClose={() => setFilter('id', '')}>
        {detailRow && <>
          <div className="mb-1 flex items-center justify-between">
            <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Audit Reference</div>
            <button type="button" className="text-[15px] text-muted-foreground" onClick={() => setFilter('id', '')} aria-label="Close">&times;</button>
          </div>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="break-all text-base font-bold text-foreground">{detailRow.id}</div>
            <AuditRowStatus row={detailRow} />
          </div>
          <div className="mb-4 text-[13px] font-semibold text-foreground">
            {detailRow.tool}
            <RowProgress row={detailRow} />
          </div>

          <Section label="Store Location">
            <div className="text-[12.5px] font-semibold text-foreground">{detailRow.store}</div>
            <div className="text-[11.5px] text-muted-foreground">{[detailRow.city, detailRow.region].filter(Boolean).join(', ')}</div>
          </Section>
          <Section label="Schedule">
            <div className="grid grid-cols-2 gap-2 text-[12.5px]">
              <div><div className="text-[11px] text-muted-foreground">Scheduled on</div><b>{detailRow.scheduled_on ? `${formatDate(detailRow.scheduled_on)}, ${formatTime(detailRow.scheduled_on)}` : '--'}</b></div>
              <div><div className="text-[11px] text-muted-foreground">Start</div><b>{detailRow.start ? `${formatDate(detailRow.start)}, ${formatTime(detailRow.start)}` : '--'}</b></div>
              <div><div className="text-[11px] text-muted-foreground">End</div><b className={isOverdue(detailRow) ? 'text-destructive' : undefined}>{detailRow.due_at ? `${formatDate(detailRow.due_at)}, ${formatTime(detailRow.due_at)}` : '--'}</b></div>
              <div><div className="text-[11px] text-muted-foreground">Duration</div><b>{durationLabel(detailRow.start, detailRow.due_at) || '--'}</b></div>
              {detailRow.submitted_at && (
                <div><div className="text-[11px] text-muted-foreground">Submitted</div><b>{formatDate(detailRow.submitted_at)}, {formatTime(detailRow.submitted_at)}</b></div>
              )}
            </div>
          </Section>
          <Section label="Assigned Personnel">
            {detailRow.auditor ? (
              <div className="flex items-center gap-2">
                <div className={cn('flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white', avC(detailRow.auditor))}>{detailRow.auditor[0]}</div>
                <div className="text-[12.5px] font-semibold">{detailRow.auditor}</div>
              </div>
            ) : <Badge className="bg-muted text-muted-foreground border border-border">Unassigned</Badge>}
          </Section>
          {scoreLabel(detailRow) !== '--' && (
            <div className="mb-4 text-[12.5px]"><span className="text-muted-foreground">Score: </span><b>{scoreLabel(detailRow)}</b></div>
          )}

          <Section label="Audit Notes & Objectives">
            <div className="min-h-[60px] whitespace-pre-wrap rounded-lg border border-border px-2.5 py-2 text-[12.5px] text-foreground/80">{detailRow.notes || 'No notes.'}</div>
          </Section>

          <Section label="Questions answered">
            <div className="overflow-hidden rounded-lg border border-border">
              {auditDetail.loading && <div className="p-4 text-center text-xs text-muted-foreground">Loading answers...</div>}
              {auditDetail.error && <div className="p-4 text-center text-xs text-destructive">{auditDetail.error.message}</div>}
              {auditDetail.data && (auditDetail.data.responses || []).length === 0 && (
                <div className="p-4 text-center text-xs text-muted-foreground">This audit has no questions.</div>
              )}
              {auditDetail.data && (auditDetail.data.responses || []).map((r) => (
                <div key={r.id} className="grid grid-cols-[1fr_auto] items-start gap-2.5 border-b border-border px-3 py-2 last:border-0">
                  <div>
                    <div className="text-[12px] text-foreground/80">{r.question_text}</div>
                    {r.remarks && <div className="mt-1 text-[11px] text-muted-foreground">{r.remarks}</div>}
                  </div>
                  <Badge className={answerBadge(r.answer)}>{r.answer || 'Not answered'}</Badge>
                </div>
              ))}
            </div>
          </Section>

          <Section label={`Issues raised (${detailIssues.length})`}>
            <div className="overflow-hidden rounded-lg border border-border">
              {detailIssues.length > 0 ? detailIssues.map((i) => (
                <div key={i.id} className="border-b border-border px-3 py-2 last:border-0">
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <span className="min-w-0 flex-1 text-[12px] font-semibold text-foreground">{i.title}</span>
                    <div className="flex shrink-0 gap-1">
                      <Badge className={cn('whitespace-nowrap', prC(i.priority))}>{i.priority}</Badge>
                      <Badge className={cn('whitespace-nowrap', stC(i.status))}>{i.status}</Badge>
                    </div>
                  </div>
                  {i.description && <div className="text-[11px] leading-snug text-muted-foreground">{i.description}</div>}
                </div>
              )) : (
                <div className="p-4 text-center text-xs text-muted-foreground">No issues recorded for this audit.</div>
              )}
            </div>
          </Section>

          {auditDetail.data && (auditDetail.data.sm_comment || auditDetail.data.sm_rating) && (
            <Section label="Store manager feedback">
              <div className="rounded-lg bg-muted px-3 py-2 text-[12.5px] text-foreground/80">
                {auditDetail.data.sm_rating ? <div className="mb-0.5 font-semibold">Rating {auditDetail.data.sm_rating}</div> : null}
                {auditDetail.data.sm_comment}
              </div>
            </Section>
          )}

          {canEdit && (
            <Section label="Mark as">
              <select
                aria-label="Mark as"
                className={fieldClass}
                value=""
                onChange={(e) => e.target.value && markAs(detailRow, e.target.value)}
              >
                <option value="">Change status...</option>
                {EDIT_STATUSES.filter((st) => st !== detailRow.status).map((st) => <option key={st} value={st}>{st}</option>)}
              </select>
            </Section>
          )}

          <div className="mb-3 flex gap-2">
            {canChange(detailRow) && <Button className="flex-1" onClick={() => openEdit(detailRow)}>Edit Audit</Button>}
            {canChange(detailRow) && <Button variant="outline" className="border-red-200 text-destructive" onClick={() => cancelRow(detailRow)}>Cancel audit</Button>}
            {isAuditor && detailAction !== 'view' && (
              <Button className="flex-1" disabled={ws.openingKey === detailRow.key} onClick={() => ws.openRow(detailRow)}>
                {ACTION_LABELS[detailAction]}
              </Button>
            )}
          </div>
        </>}
      </Drawer>

      {canEdit && (
        <ScheduleAuditModal
          open={schedule}
          onClose={() => setSchedule(null)}
          onSaved={loadRemote}
          stores={stores}
          auditors={auditors}
          checklists={checklists}
        />
      )}
    </>
  );
}
