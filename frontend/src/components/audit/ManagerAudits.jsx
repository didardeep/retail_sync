import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import { api, loadSession } from '@/api/client';
import { cn, fieldClass } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/Loader';
import SopStatusBadge from '@/components/SopStatusBadge';
import { schedulingLink, sopAuditReviewLink, sopDashboardLink } from '@/lib/links';
import { useUrlFilters } from '@/lib/useUrlFilters';
import { useOnline } from '@/lib/offline';

const FILTER_KEYS = ['store', 'tool', 'status', 'view'];

const fmt = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

function when(iso) {
  if (!iso) return '';
  return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function toRow(r) {
  return {
    id: r.id, store_id: r.store_id, store_name: r.store, template_name: r.template,
    template_code: r.template_code, scheduled_at: r.scheduled_at, notes: r.notes,
    status: r.status, updated_at: r.updated_at, auditor: r.auditor,
    auditor_id: r.auditor_id, template_version: r.template_version,
    summary: r.status === 'Submitted'
      ? { score: r.score, max_score: r.max_score, percent: r.percent } : null,
  };
}

// The manager / store manager view: submitted SOP audits with filters, a link
// to the scores and (for managers) a shortcut to schedule an audit.
export default function ManagerAudits() {
  const navigate = useNavigate();
  const online = useOnline();
  const { filters, setFilter } = useUrlFilters(FILTER_KEYS);
  const role = loadSession()?.user?.role;
  const isManager = role === 'AUDIT_MANAGER' || role === 'ADMIN';

  const [loading, setLoading] = useState(true);
  const [remote, setRemote] = useState(null);
  const [remoteError, setRemoteError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (navigator.onLine) {
        try {
          const data = await api.sopAudits();
          if (!cancelled) { setRemote(data); setRemoteError(null); }
        } catch (e) {
          if (!cancelled) setRemoteError(e);
        }
      }
      if (!cancelled) setLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, []);

  const rows = (remote || []).map(toRow)
    .sort((x, y) => (y.updated_at || '').localeCompare(x.updated_at || ''));
  const matches = (r) =>
    (!filters.store || r.store_id === filters.store) &&
    (!filters.tool || r.template_code === filters.tool) &&
    (!filters.status || r.status === filters.status);
  // Managers see Planned and Cancelled audits on the Scheduling page instead.
  const shown = rows.filter((r) => matches(r) && !['Planned', 'Cancelled'].includes(r.status));

  if (loading) return <Loading what="audits" />;

  const filterStores = [...new Map(rows.map((r) => [r.store_id, { id: r.store_id, name: r.store_name }])).values()];
  const filterTools = [...new Map(
    rows.filter((r) => r.template_code).map((r) => [r.template_code, r.template_name]),
  ).entries()];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="text-[15px] font-bold text-foreground">Audit</div>
        {isManager && (
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline"><Link to={sopDashboardLink({})}>View scores</Link></Button>
            <Button asChild size="sm"><Link to={schedulingLink({ newKind: 'sop' })}>Schedule an audit</Link></Button>
          </div>
        )}
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="mr-auto text-sm font-semibold text-foreground">Submitted audits</div>
        <select className={cn(fieldClass, 'h-10 w-auto min-w-[130px]')} value={filters.store} onChange={(e) => setFilter('store', e.target.value)} aria-label="Filter by store">
          <option value="">All stores</option>
          {filterStores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className={cn(fieldClass, 'h-10 w-auto')} value={filters.tool} onChange={(e) => setFilter('tool', e.target.value)} aria-label="Filter by audit tool">
          <option value="">All tools</option>
          {filterTools.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
        <select className={cn(fieldClass, 'h-10 w-auto')} value={filters.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Filter by status">
          <option value="">All status</option>
          <option value="Planned">Assigned</option>
          <option value="Draft">Draft</option>
          <option value="Submitted">Submitted</option>
          <option value="Approved">Approved</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>

      {remoteError && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {online ? remoteError.message : 'You are offline. Connect to see audits.'}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No audits yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
          {shown.map((r, i) => (
            <button
              key={r.id}
              type="button"
              onClick={() => navigate(sopAuditReviewLink(r.id))}
              className={cn('flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent', i > 0 && 'border-t border-border')}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground">{r.store_name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {r.template_name}{r.auditor ? ` - ${r.auditor}` : ''} - {when(r.updated_at)}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <SopStatusBadge status={r.status} version={r.template_version} />
                {r.summary && r.summary.max_score != null && (
                  <div className="text-xs font-semibold text-foreground">
                    {fmt(r.summary.score)} / {fmt(r.summary.max_score)} ({fmt(r.summary.percent)}%)
                  </div>
                )}
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
