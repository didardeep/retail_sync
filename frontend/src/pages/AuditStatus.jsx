import { useState, useMemo } from 'react';
import { mockAudits, mockQuestions, mockIssues, OBS_POOL, COMMENT_POOL } from '../data/mockData';
import { avC, sBadge, sColor, prC, stC, seedRand } from '../utils/helpers';

export default function AuditStatus() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [auditorFilter, setAuditorFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [detailAudit, setDetailAudit] = useState(null);

  /* auditor dropdown values from data */
  const auditorOptions = useMemo(
    () => [...new Set(mockAudits.map(a => a.auditor).filter(Boolean))],
    []
  );

  /* ── filtering + scoring + sorting ── */
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const sdDate = startDate ? new Date(startDate + 'T00:00:00') : null;
    const edDate = endDate ? new Date(endDate + 'T23:59:59') : null;

    let data = mockAudits.filter(a => {
      if (q && !a.id.toLowerCase().includes(q) && !a.store.toLowerCase().includes(q) && !a.auditor.toLowerCase().includes(q)) return false;
      if (statusFilter && a.status !== statusFilter) return false;
      if (regionFilter && a.region !== regionFilter) return false;
      if (auditorFilter && a.auditor !== auditorFilter) return false;
      if (sdDate || edDate) {
        const schedDate = new Date(a.sched);
        if (!isNaN(schedDate.getTime())) {
          if (sdDate && schedDate < sdDate) return false;
          if (edDate && schedDate > edDate) return false;
        }
      }
      return true;
    });

    /* compute score for completed audits */
    data = data.map(a => {
      if (a.status === 'Completed') {
        const issCount = parseInt((a.issues || '0/0').split('/')[0]) || 0;
        return { ...a, score: Math.max(40, 98 - issCount * 4) };
      }
      return { ...a };
    });

    /* sort: scored first (desc), then by status order */
    const statusOrder = { Completed: 0, 'In Progress': 1, Planned: 2, Overdue: 3 };
    data.sort((a, b) => {
      if (a.score != null && b.score != null) return b.score - a.score;
      if (a.score != null) return -1;
      if (b.score != null) return 1;
      return (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4);
    });

    return data;
  }, [search, statusFilter, regionFilter, auditorFilter, startDate, endDate]);

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
    const activeQ = mockQuestions.filter(q => q.on === true);
    const qCount = Math.min(6, activeQ.length);
    const shuffledQ = [...activeQ].sort(() => rnd() - 0.5);
    const answered = shuffledQ.slice(0, qCount).map(q => ({
      text: q.text,
      sp: q.sp,
      ans: rnd() > (q.crit ? 0.35 : 0.15) ? 'Yes' : 'No',
    }));

    /* observations: linked issues + pool samples */
    const linkedIssues = mockIssues
      .filter(i => i.aid === a.id)
      .map(i => ({ title: i.title, desc: i.desc, pri: i.pri, status: i.status }));

    const targetCount = 4 + Math.floor(rnd() * 2); // 4 or 5
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
  }, [detailAudit]);

  /* ── render ── */
  return (
    <>
      {/* ── Filter bar ── */}
      <div className="filter-bar">
        <div className="srch" style={{ maxWidth: 260 }}>
          <span className="srch-ic">&#x1F50D;</span>
          <input
            placeholder="Search by ID, store or auditor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="sel" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Status</option>
          <option>In Progress</option>
          <option>Planned</option>
          <option>Overdue</option>
          <option>Completed</option>
        </select>
        <select className="sel" value={regionFilter} onChange={e => setRegionFilter(e.target.value)}>
          <option value="">Region</option>
          <option>North India</option>
          <option>South India</option>
          <option>East India</option>
          <option>West India</option>
        </select>
        <select className="sel" value={auditorFilter} onChange={e => setAuditorFilter(e.target.value)}>
          <option value="">Auditor</option>
          {auditorOptions.map(n => <option key={n}>{n}</option>)}
        </select>
        <input type="date" className="sel" value={startDate} onChange={e => setStartDate(e.target.value)} />
        <input type="date" className="sel" value={endDate} onChange={e => setEndDate(e.target.value)} />
        <button className="icon-btn" onClick={clearFilters} title="Clear filters">&#x1F504;</button>
      </div>

      {/* ── Table ── */}
      <div className="tbl-card">
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" readOnly /></th>
              <th>Audit ID</th>
              <th>Store</th>
              <th>Scheduled &#x21C5;</th>
              <th>Status &#x25BC;</th>
              <th>Score</th>
              <th>Issues</th>
              <th>Auditor</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? filtered.map(a => (
              <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => setDetailAudit(a)}>
                <td onClick={e => e.stopPropagation()}><input type="checkbox" /></td>
                <td>
                  <a style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>{a.id}</a>
                </td>
                <td>
                  <div style={{ fontWeight: 500 }}>{a.store}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{a.city}</div>
                </td>
                <td>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>&#x1F550;</span> {a.sched}
                </td>
                <td><span className={`badge ${sBadge(a.status)}`}>{a.status}</span></td>
                <td>
                  {a.score != null ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 34, height: 34, borderRadius: '50%',
                        border: `2px solid ${sColor(a.score)}`,
                        fontSize: '10.5px', fontWeight: 700, color: sColor(a.score),
                      }}>{a.score}%</span>
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>{a.score}/100</span>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--text3)' }}>&mdash;</span>
                  )}
                </td>
                <td style={{ fontWeight: 500 }}>
                  {a.status === 'Completed' ? (a.issues || '').split('/')[0] : '\u2014'}
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div className={`av ${avC(a.auditor)}`}>{a.ai}</div>
                    <span style={{ fontSize: 12 }}>{a.auditor}</span>
                  </div>
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', gap: 3 }}>
                    <button className="icon-btn" style={{ width: 25, height: 25, fontSize: 11 }} onClick={() => setDetailAudit(a)}>&#x1F441;</button>
                    <button className="icon-btn" style={{ width: 25, height: 25, fontSize: 11 }}>&#x270F;&#xFE0F;</button>
                    <button className="icon-btn" style={{ width: 25, height: 25, fontSize: 11 }}>&hellip;</button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>No audits match your filters</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="pagination"><span>{filtered.length} items</span></div>

      {/* ── Audit Detail Modal ── */}
      {detailAudit && detailData && (
        <div className="modal-ov open" onClick={e => { if (e.target === e.currentTarget) setDetailAudit(null); }}>
          <div className="modal" style={{ width: 700, maxWidth: '95vw' }}>
            {/* header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div className="modal-title" style={{ marginBottom: 0 }}>{detailAudit.id} &middot; {detailAudit.store}</div>
              <span style={{ cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }} onClick={() => setDetailAudit(null)}>&times;</span>
            </div>

            {/* 3-col header grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, fontSize: 12, marginBottom: 16 }}>
              <div>
                <div style={{ color: 'var(--text3)', marginBottom: 2 }}>Store</div>
                <b style={{ color: 'var(--text2)' }}>{detailAudit.store}, {detailAudit.city}</b>
              </div>
              <div>
                <div style={{ color: 'var(--text3)', marginBottom: 2 }}>Scheduled</div>
                <b style={{ color: 'var(--text2)' }}>{detailAudit.sched}</b>
              </div>
              <div>
                <div style={{ color: 'var(--text3)', marginBottom: 2 }}>Status</div>
                <span className={`badge ${sBadge(detailAudit.status)}`}>{detailAudit.status}</span>
              </div>
              <div>
                <div style={{ color: 'var(--text3)', marginBottom: 2 }}>Auditor</div>
                <b style={{ color: 'var(--text2)' }}>{detailAudit.auditor || 'Unassigned'}</b>
              </div>
              <div>
                <div style={{ color: 'var(--text3)', marginBottom: 2 }}>Issues Raised</div>
                <b style={{ color: 'var(--text2)' }}>{(detailAudit.issues || '').split('/')[0]}</b>
              </div>
              <div>
                <div style={{ color: 'var(--text3)', marginBottom: 2 }}>Score</div>
                <div>
                  {detailAudit.score != null ? (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 36, height: 36, borderRadius: '50%',
                      border: `2px solid ${sColor(detailAudit.score)}`,
                      fontSize: 11, fontWeight: 700, color: sColor(detailAudit.score),
                    }}>{detailAudit.score}%</span>
                  ) : (
                    <span style={{ color: 'var(--text3)' }}>Pending</span>
                  )}
                </div>
              </div>
            </div>

            {/* Audit Questions Answered */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Audit Questions Answered</div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                {detailData.answered.length > 0 ? (
                  <>
                    {detailData.answered.map((q, idx) => (
                      <div key={idx} style={{
                        display: 'grid', gridTemplateColumns: '14px 1fr 150px 60px',
                        alignItems: 'center', gap: 10, padding: '9px 12px',
                        borderBottom: '1px solid var(--border)',
                      }}>
                        <span style={{
                          width: 9, height: 9, borderRadius: '50%',
                          background: q.ans === 'Yes' ? '#0e9f6e' : '#e02424', flexShrink: 0,
                        }} />
                        <span style={{ fontSize: '12.5px', color: 'var(--text2)' }}>{q.text}</span>
                        <span className="chip" style={{ justifySelf: 'start' }}>{q.sp}</span>
                        <span className={`badge ${q.ans === 'Yes' ? 'bg' : 'br'}`} style={{ justifySelf: 'end' }}>{q.ans}</span>
                      </div>
                    ))}
                    <div style={{ padding: '9px 12px', fontSize: 12, color: 'var(--text3)' }}>(Showing a sample of questions)</div>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: 20, color: 'var(--text3)', fontSize: 12 }}>No questions answered yet.</div>
                )}
              </div>
            </div>

            {/* Observations */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Observations</div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                {detailData.findings.length > 0 ? detailData.findings.map((i, idx) => (
                  <div key={idx} style={{
                    padding: '10px 12px',
                    borderBottom: idx < detailData.findings.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                      gap: 16, marginBottom: 4,
                    }}>
                      <span style={{
                        fontSize: '12.5px', fontWeight: 600, color: 'var(--text)',
                        flex: 1, minWidth: 0, textAlign: 'left', paddingRight: 8,
                      }}>{i.title}</span>
                      <div style={{ display: 'flex', gap: 5, flexShrink: 0, justifyContent: 'flex-end' }}>
                        <span className={`badge ${prC(i.pri)}`} style={{ whiteSpace: 'nowrap' }}>{i.pri}</span>
                        <span className={`badge ${stC(i.status)}`} style={{ whiteSpace: 'nowrap' }}>{i.status}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text3)', lineHeight: 1.4 }}>{i.desc}</div>
                  </div>
                )) : (
                  <div style={{ textAlign: 'center', padding: 20, color: 'var(--text3)', fontSize: 12 }}>No observations recorded for this audit.</div>
                )}
              </div>
            </div>

            {/* Auditor & Store Comments */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Auditor &amp; Store Comments</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{
                  alignSelf: 'flex-end', maxWidth: '75%',
                  background: 'var(--accent)', color: '#fff',
                  padding: '8px 12px', borderRadius: '12px 12px 2px 12px', fontSize: '12.5px',
                }}>
                  {detailData.cSet[0]}
                  <div style={{ fontSize: 10, opacity: 0.75, marginTop: 3 }}>{detailAudit.auditor || 'Auditor'}</div>
                </div>
                <div style={{
                  alignSelf: 'flex-start', maxWidth: '75%',
                  background: '#f3f4f6', color: 'var(--text2)',
                  padding: '8px 12px', borderRadius: '12px 12px 12px 2px', fontSize: '12.5px',
                }}>
                  {detailData.cSet[1]}
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>Store Manager</div>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setDetailAudit(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
