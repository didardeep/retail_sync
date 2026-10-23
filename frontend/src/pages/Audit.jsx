import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, X } from 'lucide-react';

import { api, loadSession } from '../api/client';
import { avC, prC, stC } from '../utils/helpers';
import { cn, fieldClass } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Modal, ModalActions } from '../components/Modal';
import { useToast } from '../components/Toast';
import AuditRowStatus from '@/components/AuditRowStatus';
import NewAuditSection from '@/components/audit/NewAuditSection';
import ScheduledForYou from '@/components/audit/ScheduledForYou';
import useAuditorWorkspace from '@/components/audit/useAuditorWorkspace';
import {
  ACTION_LABELS, filterStatusValue, isMine, rowAction,
  rowMatchesStatusFilter, scheduledForYou, statusChipLabel,
} from '@/components/audit/auditHelpers';
import {
  auditRows, distinctOptions, filterRows, formatDate, formatTime, scoreLabel,
} from '@/lib/auditRows';
import { progressPercent } from '@/lib/auditorStats';
import { auditsLink, schedulingLink } from '@/lib/links';
import { STAGES } from '@/lib/statuses';
import { useUrlFilters } from '@/lib/useUrlFilters';

// stage / status / view all filter by status (see components/audit/auditHelpers
// rowMatchesStatusFilter); id opens the detail.
const FILTER_KEYS = ['stage', 'status', 'view', 'store', 'region', 'auditor', 'q', 'id'];
const STATUS_OPTIONS = [...STAGES, { value: 'overdue', label: 'Overdue' }];
// Statuses a manager or admin may set by hand on a checklist audit (same list as the API).
const EDIT_STATUSES = ['Planned', 'Ongoing', 'Completed', 'Approved', 'Cancelled'];
const MANAGER_ROLES = ['AUDIT_MANAGER', 'ADMIN'];

function scoreColor(v) {
  return v >= 80 ? '#0e9f6e' : v >= 60 ? '#f59e0b' : '#e02424';
}

function ScoreCircle({ row, size = 34 }) {
  if (typeof row.percent !== 'number') return <span className="text-muted-foreground">--</span>;
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-[10.5px] font-bold"
      style={{ width: size, height: size, border: `2px solid ${scoreColor(row.percent)}`, color: scoreColor(row.percent) }}
    >
      {scoreLabel(row)}
    </span>
  );
}

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

export default function Audit() {
  const { filters, setFilter, setMany, clearAll } = useUrlFilters(FILTER_KEYS);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const me = loadSession()?.user;
  const toast = useToast();
  const canEdit = MANAGER_ROLES.includes(me?.role);
  const isAuditor = me?.role === 'AUDITOR';
  const ws = useAuditorWorkspace();
  const { prepare } = ws;

  const [editRow, setEditRow] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [auditors, setAuditors] = useState([]);
  const [audits, setAudits] = useState(null);
  const [remoteError, setRemoteError] = useState(null);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

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
            ? api.users('AUDITOR').then((u) => { if (!cancelled) setAuditors(u || []); }).catch(() => {})
            : Promise.resolve(),
        ]);
      }
      if (!cancelled) setLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, [canEdit, isAuditor, prepare, loadRemote]);

  const reloadAudits = loadRemote;

  function openEdit(row) {
    setEditRow(row);
    setEditForm({
      status: row.status || 'Planned',
      scheduled_at: row.date ? row.date.substring(0, 16) : '',
      auditor_id: row.auditor_id || '',
    });
  }

  // Only the fields that changed are sent, so editing the status of a started
  // audit does not trip the "date and auditor can only change while planned" rule.
  async function patchAudit(row, changes) {
    try {
      await api.updateAudit(row.id, changes);
      await reloadAudits();
      return true;
    } catch (e) {
      toast.error(e.message || 'Could not update the audit');
      return false;
    }
  }

  async function saveEdit() {
    const changes = {};
    if (editForm.status !== editRow.status) changes.status = editForm.status;
    const was = editRow.date ? editRow.date.substring(0, 16) : '';
    if (editForm.scheduled_at !== was) changes.scheduled_at = editForm.scheduled_at;
    if ((editForm.auditor_id || '') !== (editRow.auditor_id || '')) changes.auditor_id = editForm.auditor_id;
    if (!Object.keys(changes).length) {
      setEditRow(null);
      return;
    }
    setEditSaving(true);
    const ok = await patchAudit(editRow, changes);
    setEditSaving(false);
    if (ok) {
      toast('Audit updated');
      setEditRow(null);
    }
  }

  // Auditors only see their own audits.
  const rows = useMemo(() => {
    const all = auditRows(audits || []);
    return isAuditor ? all.filter((r) => isMine(r, ws.userId)) : all;
  }, [audits, isAuditor, ws.userId]);
  const scheduled = useMemo(() => scheduledForYou(rows), [rows]);
  const regionOptions = useMemo(() => distinctOptions(rows, 'region', 'region'), [rows]);
  const storeOptions = useMemo(() => distinctOptions(rows, 'store_id', 'store'), [rows]);
  const auditorOptions = useMemo(() => distinctOptions(rows, 'auditor_id', 'auditor'), [rows]);

  const filtered = useMemo(() => {
    const from = startDate ? new Date(`${startDate}T00:00:00`) : null;
    const to = endDate ? new Date(`${endDate}T23:59:59`) : null;
    const statusKeys = { stage: filters.stage, status: filters.status, view: filters.view };
    return filterRows(rows, {
      store: filters.store,
      region: filters.region, auditor: filters.auditor, q: filters.q,
    }).filter((r) => {
      if (!rowMatchesStatusFilter(r, statusKeys)) return false;
      if (!from && !to) return true;
      const d = r.date ? new Date(r.date) : null;
      if (!d || Number.isNaN(d.getTime())) return false;
      return !(from && d < from) && !(to && d > to);
    });
  }, [rows, filters.stage, filters.status, filters.view, filters.store, filters.region, filters.auditor, filters.q, startDate, endDate]);
  const statusValue = filterStatusValue(filters);
  const chipLabel = statusChipLabel(filters);

  const issueCount = (row) => issues.filter((i) => i.audit_id === row.id).length;

  const detailRow = filters.id ? rows.find((r) => r.id === filters.id) : null;
  const auditDetail = useAuditDetail(detailRow);
  const detailAction = detailRow ? rowAction(detailRow, ws.userId) : 'view';
  const detailIssues = detailRow ? issues.filter((i) => i.audit_id === detailRow.id) : [];

  function clearFilters() {
    clearAll();
    setStartDate('');
    setEndDate('');
  }

  const anyFilter = FILTER_KEYS.some((k) => k !== 'id' && filters[k]) || startDate || endDate;

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground">Loading audit data...</div>;
  }

  return (
    <>
      {/* Header: New audit for auditors, shortcuts for managers */}
      <div className="mb-3.5 flex flex-wrap items-center justify-end gap-2">
        <div className="flex gap-2">
          {isAuditor && (
            <Button size="sm" onClick={() => setShowNew((v) => !v)} aria-expanded={showNew}>
              <Plus className="size-4" />New audit
            </Button>
          )}
          {canEdit && (
            <>
              <Button asChild size="sm"><Link to={schedulingLink({})}>Schedule an audit</Link></Button>
            </>
          )}
        </div>
      </div>

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
        <div className="relative max-w-[260px] flex-1">
          <Input placeholder="Search by ID, store or auditor..." value={filters.q} onChange={(e) => setFilter('q', e.target.value)} />
        </div>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={statusValue} onChange={(e) => setMany({ stage: e.target.value, status: '', view: '' })} aria-label="Filter by status">
          <option value="">Status</option>
          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={filters.region} onChange={(e) => setFilter('region', e.target.value)} aria-label="Filter by region">
          <option value="">Region</option>
          {regionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={filters.store} onChange={(e) => setFilter('store', e.target.value)} aria-label="Filter by store">
          <option value="">Store</option>
          {storeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {!isAuditor && (
          <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={filters.auditor} onChange={(e) => setFilter('auditor', e.target.value)} aria-label="Filter by auditor">
            <option value="">Auditor</option>
            <option value="unassigned">Unassigned</option>
            {auditorOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        <input type="date" className={cn(fieldClass, 'w-auto cursor-pointer')} value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-label="From date" />
        <input type="date" className={cn(fieldClass, 'w-auto cursor-pointer')} value={endDate} onChange={(e) => setEndDate(e.target.value)} aria-label="To date" />
        {anyFilter && <Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>}
      </div>

      {chipLabel && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-medium text-foreground">
            Filter: {chipLabel}
            <button
              type="button"
              onClick={() => setMany({ stage: '', status: '', view: '' })}
              className="inline-flex items-center gap-0.5 text-primary hover:underline"
              aria-label="Clear status filter"
            >
              (clear)
              <X className="size-3" />
            </button>
          </span>
          <span className="text-muted-foreground">{filtered.length} shown</span>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-[10px] border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Audit ID</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Scheduled</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Issues</TableHead>
              {!isAuditor && <TableHead>Auditor</TableHead>}
              {(canEdit || isAuditor) && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length > 0 ? filtered.map((a) => (
              <TableRow key={a.key} className="cursor-pointer" onClick={() => setFilter('id', a.id)}>
                <TableCell>
                  <Link className="font-semibold text-primary no-underline hover:underline" to={auditsLink({ id: a.id })} onClick={(e) => e.stopPropagation()}>
                    {a.id}
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{a.store}</div>
                  <div className="text-[11px] text-muted-foreground">{a.city}</div>
                </TableCell>
                <TableCell>
                  {a.date ? <>{formatDate(a.date)}, {formatTime(a.date)}</> : <span className="text-muted-foreground">--</span>}
                </TableCell>
                <TableCell>
                  <AuditRowStatus row={a} />
                  <RowProgress row={a} />
                </TableCell>
                <TableCell><ScoreCircle row={a} /></TableCell>
                <TableCell className="font-medium">
                  {(a.stage === 'completed' || a.stage === 'approved') ? issueCount(a) : '--'}
                </TableCell>
                {!isAuditor && <TableCell>
                  {a.auditor ? (
                    <div className="flex items-center gap-1.5">
                      <div className={cn('flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white', avC(a.auditor))}>{a.auditor[0]}</div>
                      <span className="text-xs">{a.auditor}</span>
                    </div>
                  ) : <span className="text-xs text-muted-foreground">Unassigned</span>}
                </TableCell>}
                {isAuditor && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant={rowAction(a, ws.userId) === 'view' ? 'outline' : 'default'}
                      className="h-7 px-2.5 text-[11px]"
                      disabled={ws.openingKey === a.key}
                      onClick={() => ws.openRow(a)}
                    >
                      {ACTION_LABELS[rowAction(a, ws.userId)]}
                    </Button>
                  </TableCell>
                )}
                {canEdit && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => openEdit(a)}>Edit</Button>
                      <select
                        aria-label="Mark as"
                        className="h-7 rounded-md border border-border bg-card px-1 text-[11px]"
                        value=""
                        onChange={(e) => e.target.value && patchAudit(a, { status: e.target.value })}
                      >
                        <option value="">Mark as...</option>
                        {EDIT_STATUSES.filter((st) => st !== a.status).map((st) => <option key={st} value={st}>{st}</option>)}
                      </select>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            )) : (
              <TableRow>
                <TableCell colSpan={6 + (isAuditor ? 0 : 1) + (canEdit || isAuditor ? 1 : 0)} className="p-10 text-center text-muted-foreground">No audits match your filters</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="mt-3 flex justify-end text-xs text-muted-foreground"><span>{filtered.length} items</span></div>

      {/* Audit detail */}
      {detailRow && (
        <Modal open onClose={() => setFilter('id', '')} className="w-[700px] max-w-[95vw]">
          <div className="mb-3.5 flex items-center justify-between">
            <div className="text-[15px] font-bold text-foreground">{detailRow.id} &middot; {detailRow.store}</div>
            <button type="button" className="text-base text-muted-foreground" onClick={() => setFilter('id', '')} aria-label="Close">&times;</button>
          </div>

          <div className="mb-4 grid grid-cols-3 gap-2.5 text-xs">
            <div>
              <div className="mb-0.5 text-muted-foreground">Audit</div>
              <b className="text-foreground/80">{detailRow.tool}</b>
            </div>
            <div>
              <div className="mb-0.5 text-muted-foreground">Store</div>
              <b className="text-foreground/80">{[detailRow.store, detailRow.city].filter(Boolean).join(', ')}</b>
            </div>
            <div>
              <div className="mb-0.5 text-muted-foreground">Scheduled</div>
              <b className="text-foreground/80">{detailRow.date ? `${formatDate(detailRow.date)}, ${formatTime(detailRow.date)}` : '--'}</b>
            </div>
            <div>
              <div className="mb-0.5 text-muted-foreground">Status</div>
              <AuditRowStatus row={detailRow} />
              <RowProgress row={detailRow} />
            </div>
            <div>
              <div className="mb-0.5 text-muted-foreground">Auditor</div>
              <b className="text-foreground/80">{detailRow.auditor || 'Unassigned'}</b>
            </div>
            <div>
              <div className="mb-0.5 text-muted-foreground">Score</div>
              <ScoreCircle row={detailRow} size={36} />
            </div>
          </div>

          {detailRow.notes && (
            <div className="mb-4 text-xs"><span className="text-muted-foreground">Notes: </span>{detailRow.notes}</div>
          )}

          <div className="mb-4">
              <div className="mb-2 text-[13px] font-semibold text-foreground">Audit Questions Answered</div>
              <div className="overflow-hidden rounded-lg border border-border">
                {auditDetail.loading && <div className="p-5 text-center text-xs text-muted-foreground">Loading answers...</div>}
                {auditDetail.error && <div className="p-5 text-center text-xs text-destructive">{auditDetail.error.message}</div>}
                {auditDetail.data && (auditDetail.data.responses || []).length === 0 && (
                  <div className="p-5 text-center text-xs text-muted-foreground">This audit has no questions.</div>
                )}
                {auditDetail.data && (auditDetail.data.responses || []).map((r) => (
                  <div key={r.id} className="grid grid-cols-[1fr_auto] items-start gap-2.5 border-b border-border px-3 py-2.5 last:border-0">
                    <div>
                      <div className="text-[12.5px] text-foreground/80">{r.question_text}</div>
                      {r.process && <span className="mt-1 inline-block rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[10.5px] font-medium text-gray-700">{r.process}</span>}
                      {r.remarks && <div className="mt-1 text-[11.5px] text-muted-foreground">{r.remarks}</div>}
                    </div>
                    <Badge className={answerBadge(r.answer)}>{r.answer || 'Not answered'}</Badge>
                  </div>
                ))}
              </div>
          </div>

          <div className="mb-4">
            <div className="mb-2 text-[13px] font-semibold text-foreground">Issues raised ({detailIssues.length})</div>
            <div className="overflow-hidden rounded-lg border border-border">
              {detailIssues.length > 0 ? detailIssues.map((i) => (
                <div key={i.id} className="border-b border-border px-3 py-2.5 last:border-0">
                  <div className="mb-1 flex items-start justify-between gap-4">
                    <span className="min-w-0 flex-1 pr-2 text-left text-[12.5px] font-semibold text-foreground">{i.title}</span>
                    <div className="flex shrink-0 justify-end gap-1.5">
                      <Badge className={cn('whitespace-nowrap', prC(i.priority))}>{i.priority}</Badge>
                      <Badge className={cn('whitespace-nowrap', stC(i.status))}>{i.status}</Badge>
                    </div>
                  </div>
                  {i.description && <div className="text-[11.5px] leading-snug text-muted-foreground">{i.description}</div>}
                </div>
              )) : (
                <div className="p-5 text-center text-xs text-muted-foreground">No issues recorded for this audit.</div>
              )}
            </div>
          </div>

          {auditDetail.data && (auditDetail.data.sm_comment || auditDetail.data.sm_rating) && (
            <div className="mb-2">
              <div className="mb-2 text-[13px] font-semibold text-foreground">Store manager feedback</div>
              <div className="rounded-lg bg-gray-100 px-3 py-2 text-[12.5px] text-foreground/80">
                {auditDetail.data.sm_rating ? <div className="mb-0.5 font-semibold">Rating {auditDetail.data.sm_rating}</div> : null}
                {auditDetail.data.sm_comment}
              </div>
            </div>
          )}

          <ModalActions>
            <Button variant="outline" onClick={() => setFilter('id', '')}>Close</Button>
            {isAuditor && detailAction !== 'view' && (
              <Button disabled={ws.openingKey === detailRow.key} onClick={() => ws.openRow(detailRow)}>
                {ACTION_LABELS[detailAction]}
              </Button>
            )}
          </ModalActions>
        </Modal>
      )}
      {editRow && (
        <Modal open onClose={() => setEditRow(null)} className="w-[440px]">
          <div className="mb-4 text-[15px] font-bold text-foreground">Edit audit {editRow.id}</div>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Status</label>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                className={fieldClass}
              >
                {EDIT_STATUSES.map((st) => <option key={st}>{st}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Scheduled date and time</label>
              <input
                type="datetime-local"
                value={editForm.scheduled_at}
                disabled={editRow.status !== 'Planned'}
                onChange={(e) => setEditForm((f) => ({ ...f, scheduled_at: e.target.value }))}
                className={fieldClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Auditor</label>
              <select
                value={editForm.auditor_id}
                disabled={editRow.status !== 'Planned'}
                onChange={(e) => setEditForm((f) => ({ ...f, auditor_id: e.target.value }))}
                className={fieldClass}
              >
                <option value="">-- Unassigned --</option>
                {auditors.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            {editRow.status !== 'Planned' && (
              <p className="text-[11px] text-muted-foreground">
                The date and auditor can only be changed while the audit is planned.
              </p>
            )}
          </div>
          <ModalActions>
            <Button variant="outline" onClick={() => setEditRow(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={editSaving}>{editSaving ? 'Saving...' : 'Save changes'}</Button>
          </ModalActions>
        </Modal>
      )}
    </>
  );
}
