import { useState, useMemo, useEffect } from 'react';
import { api } from '../api/client';
import { avC, sBadge, sColor, prC, stC, seedRand } from '../utils/helpers';
import { cn, fieldClass } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Modal, ModalActions } from '../components/Modal';

const OBS_POOL = [
  { title: 'GSTIN certificate not displayed at store', desc: 'Mandatory regulatory compliance issue.', pri: 'Critical' },
  { title: 'Manual bills issued from store not regularized', desc: 'Financial discrepancy identified.', pri: 'High' },
  { title: 'Defined Merchandise layout not followed across the store', desc: 'Visual merchandising standards not met.', pri: 'Medium' },
  { title: 'Delay in deposit of cash collected through sales', desc: 'Cash management protocol violation.', pri: 'High' },
  { title: 'Fake note detector not available in stores', desc: 'Security equipment missing.', pri: 'Critical' },
  { title: 'Freezer temperature fluctuation', desc: 'Cold chain compliance issue detected.', pri: 'High' },
  { title: 'Generator oil leakage detected', desc: 'EHS risk identified during inspection.', pri: 'Medium' },
  { title: 'AC unit not cooling in customer area', desc: 'Customer experience impacted.', pri: 'Low' },
];

const COMMENT_POOL = [
  ['Audit completed successfully. Key areas of improvement identified in cash handling and store hygiene.', 'Thank you for the audit. We will address the issues within the timeline.'],
  ['Several compliance gaps found. Immediate action needed on critical items.', 'Acknowledged. Team has been briefed on corrective actions.'],
  ['Store performing well overall. Minor observations noted.', 'Appreciate the feedback. Will work on the minor items.'],
];

export default function AuditStatus() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [auditorFilter, setAuditorFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [detailAudit, setDetailAudit] = useState(null);

  // API data
  const [audits, setAudits] = useState([]);
  const [issues, setIssues] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.audits().catch(() => []),
      api.issues().catch(() => []),
      api.questions().catch(() => []),
    ]).then(([a, i, q]) => {
      setAudits(a || []);
      setIssues(i || []);
      setQuestions(q || []);
      setLoading(false);
    });
  }, []);

  /* auditor dropdown values from data */
  const auditorOptions = useMemo(
    () => [...new Set(audits.map(a => a.auditor).filter(Boolean))],
    [audits]
  );

  /* ── filtering + scoring + sorting ── */
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const sdDate = startDate ? new Date(startDate + 'T00:00:00') : null;
    const edDate = endDate ? new Date(endDate + 'T23:59:59') : null;

    let data = audits.filter(a => {
      if (q && !(a.id||'').toLowerCase().includes(q) && !(a.store||'').toLowerCase().includes(q) && !(a.auditor||'').toLowerCase().includes(q)) return false;
      if (statusFilter && a.status !== statusFilter) return false;
      if (regionFilter && a.region !== regionFilter) return false;
      if (auditorFilter && a.auditor !== auditorFilter) return false;
      if (sdDate || edDate) {
        const schedDate = new Date(a.scheduled_at || a.sched);
        if (!isNaN(schedDate.getTime())) {
          if (sdDate && schedDate < sdDate) return false;
          if (edDate && schedDate > edDate) return false;
        }
      }
      return true;
    });

    /* compute score for completed audits if not already set */
    data = data.map(a => {
      if ((a.status === 'Completed' || a.status === 'Approved') && a.score == null) {
        const relatedIssues = issues.filter(i => i.audit_id === a.id);
        return { ...a, score: Math.max(40, 98 - relatedIssues.length * 4) };
      }
      return { ...a };
    });

    /* sort: scored first (desc), then by status order */
    const statusOrder = { Completed: 0, Approved: 0, 'In Progress': 1, Ongoing: 1, Planned: 2, Overdue: 3 };
    data.sort((a, b) => {
      if (a.score != null && b.score != null) return b.score - a.score;
      if (a.score != null) return -1;
      if (b.score != null) return 1;
      return (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4);
    });

    return data;
  }, [search, statusFilter, regionFilter, auditorFilter, startDate, endDate, audits, issues]);

  /* ── clear all filters ── */
  function clearFilters() {
    setSearch('');
    setStatusFilter('');
    setRegionFilter('');
    setAuditorFilter('');
    setStartDate('');
    setEndDate('');
  }

  /* ── audit detail modal data (deterministic) ── */
  const detailData = useMemo(() => {
    if (!detailAudit) return null;
    const a = detailAudit;
    const rnd = seedRand(a.id);

    /* questions answered */
    const activeQ = questions.filter(q => q.active !== false);
    const qCount = Math.min(6, activeQ.length);
    const shuffledQ = [...activeQ].sort(() => rnd() - 0.5);
    const answered = shuffledQ.slice(0, qCount).map(q => ({
      text: q.text,
      sp: q.sub_process || q.sp || q.process || '',
      ans: rnd() > (q.is_critical ? 0.35 : 0.15) ? 'Yes' : 'No',
    }));

    /* observations: linked issues + pool samples */
    const linkedIssues = issues
      .filter(i => i.audit_id === a.id)
      .map(i => ({ title: i.title, desc: i.description || '', pri: i.priority, status: i.status }));

    const targetCount = 4 + Math.floor(rnd() * 2);
    const statusOptions = ['Open', 'In Progress', 'Resolved'];
    const poolShuffled = [...OBS_POOL].sort(() => rnd() - 0.5);
    const sampled = [];
    for (const o of poolShuffled) {
      if (linkedIssues.length + sampled.length >= targetCount) break;
      if (linkedIssues.some(li => li.title === o.title)) continue;
      sampled.push({
        title: o.title,
        desc: o.desc,
        pri: o.pri,
        status: statusOptions[Math.floor(rnd() * statusOptions.length)],
      });
    }
    const findings = [...linkedIssues, ...sampled];

    /* comments */
    const cSet = COMMENT_POOL[Math.floor(rnd() * COMMENT_POOL.length)];

    return { answered, findings, cSet };
  }, [detailAudit, issues, questions]);

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground">Loading audit data...</div>;
  }

  /* ── render ── */
  return (
    <>
      {/* ── Filter bar ── */}
      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <div className="relative max-w-[260px] flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">&#x1F50D;</span>
          <Input className="pl-8" placeholder="Search by ID, store or auditor..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Status</option>
          <option>In Progress</option>
          <option>Planned</option>
          <option>Overdue</option>
          <option>Completed</option>
        </select>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={regionFilter} onChange={e => setRegionFilter(e.target.value)}>
          <option value="">Region</option>
          <option>North India</option>
          <option>South India</option>
          <option>East India</option>
          <option>West India</option>
        </select>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={auditorFilter} onChange={e => setAuditorFilter(e.target.value)}>
          <option value="">Auditor</option>
          {auditorOptions.map(n => <option key={n}>{n}</option>)}
        </select>
        <input type="date" className={cn(fieldClass, 'w-auto cursor-pointer')} value={startDate} onChange={e => setStartDate(e.target.value)} />
        <input type="date" className={cn(fieldClass, 'w-auto cursor-pointer')} value={endDate} onChange={e => setEndDate(e.target.value)} />
        <button className="flex h-[30px] w-[30px] items-center justify-center rounded-md border border-border bg-card text-[13px]" onClick={clearFilters} title="Clear filters">&#x1F504;</button>
      </div>

      {/* ── Table ── */}
      <div className="overflow-hidden rounded-[10px] border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><input type="checkbox" readOnly /></TableHead>
              <TableHead>Audit ID</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Scheduled &#x21C5;</TableHead>
              <TableHead>Status &#x25BC;</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Issues</TableHead>
              <TableHead>Auditor</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length > 0 ? filtered.map(a => {
              const issCount = issues.filter(i => i.audit_id === a.id).length;
              const schedDisplay = a.scheduled_at ? new Date(a.scheduled_at).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'}) + ', ' + new Date(a.scheduled_at).toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'}) : (a.sched || '—');
              return (
              <TableRow key={a.id} className="cursor-pointer" onClick={() => setDetailAudit(a)}>
                <TableCell onClick={e => e.stopPropagation()}><input type="checkbox" /></TableCell>
                <TableCell><a className="font-semibold text-primary no-underline">{a.id}</a></TableCell>
                <TableCell>
                  <div className="font-medium">{a.store}</div>
                  <div className="text-[11px] text-muted-foreground">{a.city}</div>
                </TableCell>
                <TableCell>
                  <span className="text-[11px] text-muted-foreground">&#x1F550;</span> {schedDisplay}
                </TableCell>
                <TableCell><Badge className={sBadge(a.status)}>{a.status}</Badge></TableCell>
                <TableCell>
                  {a.score != null ? (
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full text-[10.5px] font-bold" style={{ border: `2px solid ${sColor(a.score)}`, color: sColor(a.score) }}>{a.score}%</span>
                      <span className="text-[11px] text-muted-foreground">{a.score}/100</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">&mdash;</span>
                  )}
                </TableCell>
                <TableCell className="font-medium">
                  {(a.status === 'Completed' || a.status === 'Approved') ? issCount : '—'}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <div className={cn('flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white', avC(a.auditor || 'U'))}>{(a.auditor||'U')[0]}</div>
                    <span className="text-xs">{a.auditor || 'Unassigned'}</span>
                  </div>
                </TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  <div className="flex gap-1">
                    <button className="flex h-[25px] w-[25px] items-center justify-center rounded-md border border-border bg-card text-[11px]" onClick={() => setDetailAudit(a)}>&#x1F441;</button>
                    <button className="flex h-[25px] w-[25px] items-center justify-center rounded-md border border-border bg-card text-[11px]">&#x270F;&#xFE0F;</button>
                    <button className="flex h-[25px] w-[25px] items-center justify-center rounded-md border border-border bg-card text-[11px]">&hellip;</button>
                  </div>
                </TableCell>
              </TableRow>
            )}) : (
              <TableRow>
                <TableCell colSpan={9} className="p-10 text-center text-muted-foreground">No audits match your filters</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="mt-3 flex justify-end text-xs text-muted-foreground"><span>{filtered.length} items</span></div>

      {/* ── Audit Detail Modal ── */}
      {detailAudit && detailData && (
        <Modal open={!!detailAudit} onClose={() => setDetailAudit(null)} className="w-[700px] max-w-[95vw]">
          {/* header */}
          <div className="mb-3.5 flex items-center justify-between">
            <div className="text-[15px] font-bold text-foreground">{detailAudit.id} &middot; {detailAudit.store}</div>
            <span className="cursor-pointer text-base text-muted-foreground" onClick={() => setDetailAudit(null)}>&times;</span>
          </div>

          {/* 3-col header grid */}
          <div className="mb-4 grid grid-cols-3 gap-2.5 text-xs">
            <div>
              <div className="mb-0.5 text-muted-foreground">Store</div>
              <b className="text-foreground/80">{detailAudit.store}, {detailAudit.city}</b>
            </div>
            <div>
              <div className="mb-0.5 text-muted-foreground">Scheduled</div>
              <b className="text-foreground/80">{detailAudit.scheduled_at?.substring(0,10) || detailAudit.sched}</b>
            </div>
            <div>
              <div className="mb-0.5 text-muted-foreground">Status</div>
              <Badge className={sBadge(detailAudit.status)}>{detailAudit.status}</Badge>
            </div>
            <div>
              <div className="mb-0.5 text-muted-foreground">Auditor</div>
              <b className="text-foreground/80">{detailAudit.auditor || 'Unassigned'}</b>
            </div>
            <div>
              <div className="mb-0.5 text-muted-foreground">Issues Raised</div>
              <b className="text-foreground/80">{issues.filter(i => i.audit_id === detailAudit.id).length}</b>
            </div>
            <div>
              <div className="mb-0.5 text-muted-foreground">Score</div>
              <div>
                {detailAudit.score != null ? (
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-bold" style={{ border: `2px solid ${sColor(detailAudit.score)}`, color: sColor(detailAudit.score) }}>{detailAudit.score}%</span>
                ) : (
                  <span className="text-muted-foreground">Pending</span>
                )}
              </div>
            </div>
          </div>

          {/* Audit Questions Answered */}
          <div className="mb-4">
            <div className="mb-2 text-[13px] font-semibold text-foreground">Audit Questions Answered</div>
            <div className="overflow-hidden rounded-lg border border-border">
              {detailData.answered.length > 0 ? (
                <>
                  {detailData.answered.map((q, idx) => (
                    <div key={idx} className="grid grid-cols-[14px_1fr_150px_60px] items-center gap-2.5 border-b border-border px-3 py-2.5 last:border-0">
                      <span className="h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: q.ans === 'Yes' ? '#0e9f6e' : '#e02424' }} />
                      <span className="text-[12.5px] text-foreground/80">{q.text}</span>
                      <span className="justify-self-start rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[10.5px] font-medium text-gray-700">{q.sp}</span>
                      <Badge className={cn('justify-self-end', q.ans === 'Yes' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-800')}>{q.ans}</Badge>
                    </div>
                  ))}
                  <div className="px-3 py-2.5 text-xs text-muted-foreground">(Showing a sample of questions)</div>
                </>
              ) : (
                <div className="p-5 text-center text-xs text-muted-foreground">No questions answered yet.</div>
              )}
            </div>
          </div>

          {/* Observations */}
          <div className="mb-4">
            <div className="mb-2 text-[13px] font-semibold text-foreground">Observations</div>
            <div className="overflow-hidden rounded-lg border border-border">
              {detailData.findings.length > 0 ? detailData.findings.map((i, idx) => (
                <div key={idx} className="border-b border-border px-3 py-2.5 last:border-0">
                  <div className="mb-1 flex items-start justify-between gap-4">
                    <span className="min-w-0 flex-1 pr-2 text-left text-[12.5px] font-semibold text-foreground">{i.title}</span>
                    <div className="flex shrink-0 justify-end gap-1.5">
                      <Badge className={cn('whitespace-nowrap', prC(i.pri))}>{i.pri}</Badge>
                      <Badge className={cn('whitespace-nowrap', stC(i.status))}>{i.status}</Badge>
                    </div>
                  </div>
                  <div className="text-[11.5px] leading-snug text-muted-foreground">{i.desc}</div>
                </div>
              )) : (
                <div className="p-5 text-center text-xs text-muted-foreground">No observations recorded for this audit.</div>
              )}
            </div>
          </div>

          {/* Auditor & Store Comments */}
          <div>
            <div className="mb-2 text-[13px] font-semibold text-foreground">Auditor &amp; Store Comments</div>
            <div className="flex flex-col gap-2">
              <div className="max-w-[75%] self-end rounded-[12px_12px_2px_12px] bg-primary px-3 py-2 text-[12.5px] text-primary-foreground">
                {detailData.cSet[0]}
                <div className="mt-0.5 text-[10px] opacity-75">{detailAudit.auditor || 'Auditor'}</div>
              </div>
              <div className="max-w-[75%] self-start rounded-[12px_12px_12px_2px] bg-gray-100 px-3 py-2 text-[12.5px] text-foreground/80">
                {detailData.cSet[1]}
                <div className="mt-0.5 text-[10px] text-muted-foreground">Store Manager</div>
              </div>
            </div>
          </div>

          <ModalActions>
            <Button variant="outline" onClick={() => setDetailAudit(null)}>Close</Button>
          </ModalActions>
        </Modal>
      )}
    </>
  );
}
