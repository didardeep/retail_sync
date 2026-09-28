import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'cash', label: '💰 Cash Reconciliation' },
  { id: 'deposits', label: '🏦 Deposit Pickups' },
  { id: 'inventory', label: '📦 Expired Inventory' },
];

function statusBadge(s) {
  if (!s) return 'bg-muted text-muted-foreground';
  const sl = s.toLowerCase();
  if (sl.includes('match') || sl.includes('reconciled') || sl.includes('collected') || sl.includes('clear') || sl.includes('ok')) return 'bg-emerald-50 text-emerald-700';
  if (sl.includes('pending') || sl.includes('partial')) return 'bg-yellow-50 text-yellow-900';
  if (sl.includes('mismatch') || sl.includes('miss') || sl.includes('overdue') || sl.includes('discard') || sl.includes('expired')) return 'bg-red-50 text-red-800';
  return 'bg-muted text-muted-foreground';
}

export default function StoreCompliance() {
  const [tab, setTab] = useState('cash');
  const [cash, setCash] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.cashReconciliations().catch(() => []),
      api.cashDepositPickups().catch(() => []),
      api.expiredInventory().catch(() => []),
    ]).then(([c, d, i]) => {
      setCash(c || []);
      setDeposits(d || []);
      setInventory(i || []);
      setLoading(false);
    });
  }, []);

  const kpis = useMemo(() => {
    const totalDeposits = deposits.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
    const pending = deposits.filter(d => {
      const st = (d.status || '').toLowerCase();
      return st.includes('pending') || st.includes('scheduled');
    }).length;
    const mismatches = cash.filter(c => {
      const st = (c.status || '').toLowerCase();
      return st.includes('mismatch') || st.includes('miss');
    }).length;
    const expired = inventory.length;
    return { totalDeposits, pending, mismatches, expired };
  }, [cash, deposits, inventory]);

  const q = search.toLowerCase();

  const filteredCash = useMemo(() => cash.filter(r =>
    !q ||
    (r.date || '').toLowerCase().includes(q) ||
    (r.store || '').toLowerCase().includes(q) ||
    (r.status || '').toLowerCase().includes(q)
  ), [cash, q]);

  const filteredDeposits = useMemo(() => deposits.filter(r =>
    !q ||
    (r.date || '').toLowerCase().includes(q) ||
    (r.store || '').toLowerCase().includes(q) ||
    (r.status || '').toLowerCase().includes(q)
  ), [deposits, q]);

  const filteredInventory = useMemo(() => inventory.filter(r =>
    !q ||
    (r.product || '').toLowerCase().includes(q) ||
    (r.sku || '').toLowerCase().includes(q) ||
    (r.category || '').toLowerCase().includes(q) ||
    (r.store || '').toLowerCase().includes(q)
  ), [inventory, q]);

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground">Loading compliance data...</div>;
  }

  return (
    <>
      {/* KPI row */}
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4">
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{ background: '#e8eefa' }}>💰</div>
          <div>
            <div className="mb-0.5 text-[11px] text-muted-foreground">Cash Records</div>
            <div className="text-2xl font-bold leading-none text-foreground">{cash.length}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4">
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{ background: '#def7ec' }}>🏦</div>
          <div>
            <div className="mb-0.5 text-[11px] text-muted-foreground">Total Deposits</div>
            <div className="text-2xl font-bold leading-none text-foreground">₹{(kpis.totalDeposits / 1000).toFixed(0)}K</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4">
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{ background: '#feecdc' }}>⏳</div>
          <div>
            <div className="mb-0.5 text-[11px] text-muted-foreground">Pending Pickups</div>
            <div className="text-2xl font-bold leading-none text-foreground">{kpis.pending}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4">
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{ background: '#fde8e8' }}>📦</div>
          <div>
            <div className="mb-0.5 text-[11px] text-muted-foreground">Expired Items</div>
            <div className="text-2xl font-bold leading-none text-foreground">{kpis.expired}</div>
          </div>
        </div>
      </div>

      {/* Tabs + search */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSearch(''); }}
              className={cn(
                'rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors',
                tab === t.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative max-w-[240px] flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">🔍</span>
          <Input
            className="pl-8"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-[10px] border border-border bg-card">
        {tab === 'cash' && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Expected (₹)</TableHead>
                <TableHead>Actual (₹)</TableHead>
                <TableHead>Variance (₹)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Remarks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCash.length > 0 ? filteredCash.map((r, i) => (
                <TableRow key={r.id || i}>
                  <TableCell className="text-xs">{r.date || r.reconciliation_date || '—'}</TableCell>
                  <TableCell>{r.store || r.store_name || '—'}</TableCell>
                  <TableCell className="font-medium">{r.expected_amount != null ? `₹${Number(r.expected_amount).toLocaleString()}` : '—'}</TableCell>
                  <TableCell className="font-medium">{r.actual_amount != null ? `₹${Number(r.actual_amount).toLocaleString()}` : '—'}</TableCell>
                  <TableCell>
                    {r.variance != null ? (
                      <span className={r.variance < 0 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>
                        {r.variance < 0 ? '' : '+'}{Number(r.variance).toLocaleString()}
                      </span>
                    ) : '—'}
                  </TableCell>
                  <TableCell><Badge className={statusBadge(r.status)}>{r.status || '—'}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.remarks || r.notes || '—'}</TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={7} className="p-10 text-center text-muted-foreground">No cash reconciliation records found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}

        {tab === 'deposits' && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Amount (₹)</TableHead>
                <TableHead>Pickup By</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Remarks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDeposits.length > 0 ? filteredDeposits.map((r, i) => (
                <TableRow key={r.id || i}>
                  <TableCell className="text-xs">{r.date || r.pickup_date || '—'}</TableCell>
                  <TableCell>{r.store || r.store_name || '—'}</TableCell>
                  <TableCell className="font-medium">{r.amount != null ? `₹${Number(r.amount).toLocaleString()}` : '—'}</TableCell>
                  <TableCell className="text-xs">{r.pickup_by || r.agent || '—'}</TableCell>
                  <TableCell><Badge className={statusBadge(r.status)}>{r.status || '—'}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.remarks || r.notes || '—'}</TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={6} className="p-10 text-center text-muted-foreground">No deposit pickup records found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}

        {tab === 'inventory' && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Expiry Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInventory.length > 0 ? filteredInventory.map((r, i) => (
                <TableRow key={r.id || i}>
                  <TableCell className="font-medium">{r.product || r.product_name || '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{r.sku || '—'}</TableCell>
                  <TableCell>{r.category || '—'}</TableCell>
                  <TableCell>{r.quantity != null ? r.quantity : (r.qty != null ? r.qty : '—')}</TableCell>
                  <TableCell className="text-xs">{r.expiry_date || r.expiry || '—'}</TableCell>
                  <TableCell><Badge className={statusBadge(r.status || 'Expired')}>{r.status || 'Expired'}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.action || r.recommended_action || 'Discard / Return'}</TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={7} className="p-10 text-center text-muted-foreground">No expired inventory records found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="mt-3 flex justify-end text-xs text-muted-foreground">
        {tab === 'cash' && <span>{filteredCash.length} records</span>}
        {tab === 'deposits' && <span>{filteredDeposits.length} records</span>}
        {tab === 'inventory' && <span>{filteredInventory.length} records</span>}
      </div>
    </>
  );
}
