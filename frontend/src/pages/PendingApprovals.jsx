import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '@/api/client';
import { pendingApprovals, waitingDays } from '@/lib/pendingApprovals';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ErrorNote, Loading } from '@/components/Loader';

const when = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '--');

// Every audit the auditors have submitted that is waiting for the audit manager,
// oldest first, and the ones already sent back for fixing.
export default function PendingApprovals() {
  const navigate = useNavigate();
  const [audits, setAudits] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('waiting');

  useEffect(() => { api.audits().then(setAudits).catch(setError); }, []);
  const groups = useMemo(() => pendingApprovals(audits || []), [audits]);

  if (error) return <ErrorNote error={error} />;
  if (!audits) return <Loading what="audits" />;

  const rows = groups[tab];
  const tabs = [
    { key: 'waiting', label: 'Waiting for review', count: groups.waiting.length },
    { key: 'returned', label: 'Returned to auditor', count: groups.returned.length },
  ];

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-bold text-foreground">Pending Approval</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Submitted audits that need your decision. Open one to review it question by question.</p>
      </div>

      <div className="mb-3 flex gap-1.5" role="group" aria-label="Pending audits">
        {tabs.map((t) => (
          <Button key={t.key} size="sm" variant={tab === t.key ? 'default' : 'outline'} onClick={() => setTab(t.key)}>
            {t.label} ({t.count})
          </Button>
        ))}
      </div>

      <div className="overflow-hidden rounded-[10px] border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Audit</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Auditor</TableHead>
              <TableHead>{tab === 'waiting' ? 'Submitted' : 'Returned'}</TableHead>
              <TableHead>{tab === 'waiting' ? 'Waiting' : 'Reason'}</TableHead>
              <TableHead>Score</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={7} className="p-10 text-center text-muted-foreground">
                {tab === 'waiting' ? 'Nothing is waiting for review.' : 'No audit is out with an auditor for fixing.'}
              </TableCell></TableRow>
            )}
            {rows.map((a) => {
              const days = waitingDays(a);
              return (
                <TableRow key={a.id} className="cursor-pointer" onClick={() => navigate(`/audits/${a.id}/approve`)}>
                  <TableCell className="font-semibold text-primary">{a.id}</TableCell>
                  <TableCell>
                    <div className="font-medium">{a.store}</div>
                    <div className="text-[11px] text-muted-foreground">{[a.brand, a.city].filter(Boolean).join(' - ')}</div>
                  </TableCell>
                  <TableCell>{a.auditor || 'Unassigned'}</TableCell>
                  <TableCell>{when(tab === 'waiting' ? a.submitted_at : a.decision_at)}</TableCell>
                  <TableCell className={cn('max-w-[260px] text-[12.5px]', tab === 'waiting' && days >= 3 && 'font-semibold text-destructive')}>
                    {tab === 'waiting' ? (days === 0 ? 'Today' : `${days} ${days === 1 ? 'day' : 'days'}`) : a.decision_note}
                  </TableCell>
                  <TableCell>{a.score != null ? `${a.score}%` : '--'}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" onClick={() => navigate(`/audits/${a.id}/approve`)}>{tab === 'waiting' ? 'Review' : 'View'}</Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
