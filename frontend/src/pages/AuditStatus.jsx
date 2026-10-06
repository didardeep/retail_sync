import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';

import { api, loadSession } from '../api/client';
import { fetchAuditRows } from '../api/sopSchedule';
import { avC, prC, stC } from '../utils/helpers';
import { cn, fieldClass } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Modal, ModalActions } from '../components/Modal';
import AuditRowStatus from '@/components/AuditRowStatus';
import {
  distinctOptions, filterRows, formatDate, formatTime, mergeRows, scoreLabel,
} from '@/lib/auditRows';
import { auditsLink, sopAuditReviewLink, sopAuditRunLink } from '@/lib/links';
import { STAGES, isAuditorEditable } from '@/lib/statuses';
import { useUrlFilters } from '@/lib/useUrlFilters';

const FILTER_KEYS = ['stage', 'kind', 'store', 'region', 'auditor', 'q', 'id'];
const KIND_LABEL = { legacy: 'Checklist audit', sop: 'SOP tool' };

// SOP audit ids are UUIDs; show a short form, keep the full id in the link.
function shortId(row) {
  return row.kind === 'sop' ? `SOP-${row.id.slice(0, 8)}` : row.id;
}

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

// What the open audit looks like on the server. Only classic audits have
// per-question responses to load; SOP audits open on their own screens.
function useLegacyDetail(row) {
  const [state, setState] = useState({ loading: false, data: null, error: null });
  const id = row?.kind === 'legacy' ? row.id : null;
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
  if (answer === 'Partial') return 'bg-yellow-50 text-yellow-900';
  return 'bg-muted text-muted-foreground border border-border';
}

export default function AuditStatus() {
  const { filters, setFilter, clearAll } = useUrlFilters(FILTER_KEYS);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const me = loadSession()?.user;

  const [legacy, setLegacy] = useState([]);
  const [sop, setSop] = useState([]);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchAuditRows().catch(() => [[], []]),
      api.issues().catch(() => []),
    ]).then(([[l, s], i]) => {
      setLegacy(l || []);
      setSop(s || []);
      setIssues(i || []);
      setLoading(false);
    });
  }, []);

  const rows = useMemo(() => mergeRows(legacy, sop), [legacy, sop]);
  const regionOptions = useMemo(() => distinctOptions(rows, 'region', 'region'), [rows]);
  const storeOptions = useMemo(() => distinctOptions(rows, 'store_id', 'store'), [rows]);
  const auditorOptions = useMemo(() => distinctOptions(rows, 'auditor_id', 'auditor'), [rows]);

  const filtered = useMemo(() => {
    const from = startDate ? new Date(`${startDate}T00:00:00`) : null;
    const to = endDate ? new Date(`${endDate}T23:59:59`) : null;
    return filterRows(rows, {
      stage: filters.stage, kind: filters.kind, store: filters.store,
      region: filters.region, auditor: filters.auditor, q: filters.q,
    }).filter((r) => {
      if (!from && !to) return true;
      const d = r.date ? new Date(r.date) : null;
      if (!d || Number.isNaN(d.getTime())) return false;
      return !(from && d < from) && !(to && d > to);
    });
  }, [rows, filters.stage, filters.kind, filters.store, filters.region, filters.auditor, filters.q, startDate, endDate]);

  const issueCount = (row) => issues.filter((i) => (row.kind === 'sop' ? i.sop_audit_id : i.audit_id) === row.id).length;

  const detailRow = filters.id ? rows.find((r) => r.id === filters.id) : null;
  const legacyDetail = useLegacyDetail(detailRow);
  const detailIssues = detailRow
    ? issues.filter((i) => (detailRow.kind === 'sop' ? i.sop_audit_id : i.audit_id) === detailRow.id)
    : [];

  function clearFilters() {
    clearAll();
    setStartDate('');
    setEndDate('');
  }

  const anyFilter = FILTER_KEYS.some((k) => k !== 'id' && filters[k]) || startDate || endDate;

  function openLink(row) {
    const mine = row.auditor_id && row.auditor_id === me?.id;
    return mine && isAuditorEditable(row.status) ? sopAuditRunLink(row.id) : sopAuditReviewLink(row.id);
  }

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground">Loading audit data...</div>;
  }

  return (
    <>
      {/* Filter bar */}
      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <div className="relative max-w-[260px] flex-1">
          <Input placeholder="Search by ID, store, tool or auditor..." value={filters.q} onChange={(e) => setFilter('q', e.target.value)} />
        </div>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={filters.stage} onChange={(e) => setFilter('stage', e.target.value)} aria-label="Filter by status">
          <option value="">Status</option>
          {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={filters.kind} onChange={(e) => setFilter('kind', e.target.value)} aria-label="Filter by type">
          <option value="">All types</option>
          <option value="legacy">Checklist audit</option>
          <option value="sop">SOP tool</option>
        </select>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={filters.region} onChange={(e) => setFilter('region', e.target.value)} aria-label="Filter by region">
          <option value="">Region</option>
          {regionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={filters.store} onChange={(e) => setFilter('store', e.target.value)} aria-label="Filter by store">
          <option value="">Store</option>
          {storeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={filters.auditor} onChange={(e) => setFilter('auditor', e.target.value)} aria-label="Filter by auditor">
          <option value="">Auditor</option>
          <option value="unassigned">Unassigned</option>
          {auditorOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input type="date" className={cn(fieldClass, 'w-auto cursor-pointer')} value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-label="From date" />
        <input type="date" className={cn(fieldClass, 'w-auto cursor-pointer')} value={endDate} onChange={(e) => setEndDate(e.target.value)} aria-label="To date" />
        {anyFilter && <Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-[10px] border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Audit ID</TableHead>
              <TableHead>Audit</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Scheduled</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Issues</TableHead>
              <TableHead>Auditor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length > 0 ? filtered.map((a) => (
              <TableRow key={a.key} className="cursor-pointer" onClick={() => setFilter('id', a.id)}>
                <TableCell>
                  <Link className="font-semibold text-primary no-underline hover:underline" to={auditsLink({ id: a.id })} onClick={(e) => e.stopPropagation()}>
                    {shortId(a)}
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="font-medium">
                    {a.tool}{a.version > 1 ? <span className="ml-1 text-[10px] font-normal text-muted-foreground">v{a.version}</span> : null}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{KIND_LABEL[a.kind]}</div>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{a.store}</div>
                  <div className="text-[11px] text-muted-foreground">{a.city}</div>
                </TableCell>
                <TableCell>
                  {a.date ? <>{formatDate(a.date)}, {formatTime(a.date)}</> : <span className="text-muted-foreground">--</span>}
                </TableCell>
                <TableCell><AuditRowStatus row={a} /></TableCell>
                <TableCell><ScoreCircle row={a} /></TableCell>
                <TableCell className="font-medium">
                  {(a.stage === 'completed' || a.stage === 'approved') ? issueCount(a) : '--'}
                </TableCell>
                <TableCell>
                  {a.auditor ? (
                    <div className="flex items-center gap-1.5">
                      <div className={cn('flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white', avC(a.auditor))}>{a.auditor[0]}</div>
                      <span className="text-xs">{a.auditor}</span>
                    </div>
                  ) : <span className="text-xs text-muted-foreground">Unassigned</span>}
                </TableCell>
              </TableRow>
            )) : (
              <TableRow>
                <TableCell colSpan={8} className="p-10 text-center text-muted-foreground">No audits match your filters</TableCell>
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
            <div className="text-[15px] font-bold text-foreground">{shortId(detailRow)} &middot; {detailRow.store}</div>
            <button type="button" className="text-base text-muted-foreground" onClick={() => setFilter('id', '')} aria-label="Close">&times;</button>
          </div>

          <div className="mb-4 grid grid-cols-3 gap-2.5 text-xs">
            <div>
              <div className="mb-0.5 text-muted-foreground">Audit</div>
              <b className="text-foreground/80">{detailRow.tool}{detailRow.version ? ` (v${detailRow.version})` : ''}</b>
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

          {detailRow.kind === 'sop' ? (
            <div className="mb-4 rounded-lg border border-border p-3 text-[12.5px] text-foreground/80">
              Marks per criterion, photos and remarks are on the audit itself.
              {detailRow.score != null && detailRow.percent != null && <> Total score {detailRow.score} ({scoreLabel(detailRow)}).</>}
            </div>
          ) : (
            <div className="mb-4">
              <div className="mb-2 text-[13px] font-semibold text-foreground">Audit Questions Answered</div>
              <div className="overflow-hidden rounded-lg border border-border">
                {legacyDetail.loading && <div className="p-5 text-center text-xs text-muted-foreground">Loading answers...</div>}
                {legacyDetail.error && <div className="p-5 text-center text-xs text-destructive">{legacyDetail.error.message}</div>}
                {legacyDetail.data && (legacyDetail.data.responses || []).length === 0 && (
                  <div className="p-5 text-center text-xs text-muted-foreground">This audit has no questions.</div>
                )}
                {legacyDetail.data && (legacyDetail.data.responses || []).map((r) => (
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
          )}

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

          {detailRow.kind === 'legacy' && legacyDetail.data && (legacyDetail.data.sm_comment || legacyDetail.data.sm_rating) && (
            <div className="mb-2">
              <div className="mb-2 text-[13px] font-semibold text-foreground">Store manager feedback</div>
              <div className="rounded-lg bg-gray-100 px-3 py-2 text-[12.5px] text-foreground/80">
                {legacyDetail.data.sm_rating ? <div className="mb-0.5 font-semibold">Rating {legacyDetail.data.sm_rating}</div> : null}
                {legacyDetail.data.sm_comment}
              </div>
            </div>
          )}

          <ModalActions>
            <Button variant="outline" onClick={() => setFilter('id', '')}>Close</Button>
            {detailRow.kind === 'sop' && (
              <Button asChild><Link to={openLink(detailRow)}>Open audit</Link></Button>
            )}
          </ModalActions>
        </Modal>
      )}
    </>
  );
}
