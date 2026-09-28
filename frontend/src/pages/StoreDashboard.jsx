import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import { sColor, sBadge, prC, stC, pbClass } from '../utils/helpers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

const QUARTERS = ['q1', 'q2', 'q3', 'q4'];

export default function StoreDashboard() {
  const [store, setStore] = useState(null);
  const [audits, setAudits] = useState([]);
  const [issues, setIssues] = useState([]);
  const [scores, setScores] = useState([]);
  const [selectedQ, setSelectedQ] = useState('q4');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.stores().catch(() => []),
      api.audits().catch(() => []),
      api.issues().catch(() => []),
      api.storeScores().catch(() => []),
    ]).then(([st, au, is, sc]) => {
      setStore((st || [])[0] || null);
      setAudits(au || []);
      setIssues(is || []);
      setScores(sc || []);
      setLoading(false);
    });
  }, []);

  const storeScore = useMemo(() => {
    if (!store) return null;
    const sc = scores.find(s => s.store_id === store.id || s.store === store.name);
    return sc ? (sc[selectedQ] ?? sc.q4 ?? null) : null;
  }, [store, scores, selectedQ]);

  const completedAudits = useMemo(
    () => audits.filter(a => a.status === 'Completed' || a.status === 'Approved'),
    [audits]
  );
  const openIssues = useMemo(
    () => issues.filter(i => i.status !== 'Resolved' && i.status !== 'Closed'),
    [issues]
  );
  const recentAudits = useMemo(
    () => [...audits].sort((a, b) => new Date(b.scheduled_at || 0) - new Date(a.scheduled_at || 0)).slice(0, 6),
    [audits]
  );
  const topIssues = useMemo(() => openIssues.slice(0, 5), [openIssues]);

  const scoreHistory = useMemo(() => {
    if (!store) return [];
    const sc = scores.find(s => s.store_id === store.id || s.store === store.name);
    if (!sc) return [];
    return QUARTERS.map(q => ({ q: q.toUpperCase(), val: sc[q] ?? 0 }));
  }, [store, scores]);

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground">Loading store data...</div>;
  }

  if (!store) {
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground">No store assigned to your account.</div>;
  }

  const scoreVal = storeScore ?? 0;

  return (
    <>
      {/* Store header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg text-base" style={{ background: '#e8eefa' }}>
              🏪
            </div>
            <div>
              <div className="text-[15px] font-bold text-foreground">{store.name}</div>
              <div className="text-[12px] text-muted-foreground">{store.city}{store.region ? ` · ${store.region}` : ''}</div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {QUARTERS.map(q => (
            <Button
              key={q}
              size="sm"
              variant={selectedQ === q ? 'default' : 'outline'}
              onClick={() => setSelectedQ(q)}
            >
              {q.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Score */}
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4">
          <div
            className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
            style={{ border: `2.5px solid ${sColor(scoreVal)}`, color: sColor(scoreVal) }}
          >
            {scoreVal}%
          </div>
          <div>
            <div className="mb-0.5 text-[11px] text-muted-foreground">{selectedQ.toUpperCase()} Score</div>
            <div className="text-2xl font-bold leading-none text-foreground">{scoreVal}</div>
          </div>
        </div>
        {/* Audits */}
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4">
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{ background: '#e8eefa' }}>
            ✅
          </div>
          <div>
            <div className="mb-0.5 text-[11px] text-muted-foreground">Audits Done</div>
            <div className="text-2xl font-bold leading-none text-foreground">{completedAudits.length}</div>
          </div>
        </div>
        {/* Open Issues */}
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4">
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{ background: '#feecdc' }}>
            ⚠️
          </div>
          <div>
            <div className="mb-0.5 text-[11px] text-muted-foreground">Open Issues</div>
            <div className="text-2xl font-bold leading-none text-foreground">{openIssues.length}</div>
          </div>
        </div>
        {/* Total Audits */}
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4">
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{ background: '#def7ec' }}>
            📋
          </div>
          <div>
            <div className="mb-0.5 text-[11px] text-muted-foreground">Total Audits</div>
            <div className="text-2xl font-bold leading-none text-foreground">{audits.length}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Recent Audits */}
        <div className="lg:col-span-2">
          <div className="mb-3 rounded-lg border border-border bg-card p-4">
            <div className="mb-3 text-sm font-semibold text-foreground">Recent Audits</div>
            {recentAudits.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">No audits found for your store.</div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Audit ID</TableHead>
                      <TableHead>Scheduled</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Auditor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentAudits.map(a => {
                      const dateStr = a.scheduled_at
                        ? new Date(a.scheduled_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                        : (a.sched || '—');
                      return (
                        <TableRow key={a.id}>
                          <TableCell className="font-semibold text-primary">{a.id}</TableCell>
                          <TableCell className="text-xs">{dateStr}</TableCell>
                          <TableCell><Badge className={sBadge(a.status)}>{a.status}</Badge></TableCell>
                          <TableCell>
                            {a.score != null ? (
                              <span className="font-semibold" style={{ color: sColor(a.score) }}>{a.score}%</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">{a.auditor || 'Unassigned'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-3">
          {/* Score trend */}
          {scoreHistory.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 text-sm font-semibold text-foreground">Score Trend</div>
              <div className="flex items-end gap-2">
                {scoreHistory.map(({ q, val }) => (
                  <div key={q} className="flex flex-1 flex-col items-center gap-1">
                    <div className="text-[10px] font-semibold" style={{ color: sColor(val) }}>{val}%</div>
                    <div
                      className="w-full rounded-t-sm"
                      style={{
                        height: `${Math.max(4, val)}px`,
                        background: sColor(val),
                        opacity: q === selectedQ.toUpperCase() ? 1 : 0.45,
                        minHeight: '4px',
                        maxHeight: '60px',
                      }}
                    />
                    <div className="text-[10px] text-muted-foreground">{q}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Open Issues */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-foreground">Open Issues</div>
              {openIssues.length > 0 && (
                <Badge className="bg-orange-50 text-orange-800">{openIssues.length}</Badge>
              )}
            </div>
            {topIssues.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">No open issues 🎉</div>
            ) : (
              <div className="flex flex-col gap-2">
                {topIssues.map((iss, idx) => (
                  <div key={iss.id || idx} className="rounded-lg border border-border p-2.5">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <div className="text-[12px] font-medium leading-snug text-foreground">{iss.title}</div>
                      <Badge className={cn('shrink-0', prC(iss.priority))}>{iss.priority}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] text-muted-foreground">{iss.description?.substring(0, 60) || ''}</div>
                      <Badge className={cn('shrink-0', stC(iss.status))}>{iss.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
