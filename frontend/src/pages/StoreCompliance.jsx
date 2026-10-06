import { useState, useEffect, useMemo } from 'react';
import { api, loadSession } from '../api/client';
import { storeDataApi } from '../api/storeData';
import { useUrlFilters } from '@/lib/useUrlFilters';
import StorePicker from '@/components/StorePicker';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'cash', label: 'Cash Reconciliation' },
  { id: 'deposits', label: 'Deposit Pickups' },
  { id: 'inventory', label: 'Expired Inventory' },
];

const EMPTY = '-';

const num = (v) => (v == null || v === '' ? null : Number(v));
const inr = (v) => (num(v) == null ? EMPTY : `₹${num(v).toLocaleString('en-IN')}`);
const isZero = (v) => Math.abs(num(v) || 0) < 0.005;
const diffClass = (v) => (isZero(v) ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600');

export default function StoreCompliance() {
  const role = loadSession()?.user?.role;
  const canPick = role === 'ADMIN' || role === 'AUDIT_MANAGER';
  const { filters, setFilter } = useUrlFilters(['store']);
  const storeId = canPick ? filters.store : '';

  const [tab, setTab] = useState('cash');
  const [stores, setStores] = useState([]);
  const [cash, setCash] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.stores().then(s => setStores(s || [])).catch(() => setStores([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      storeDataApi.cashReconciliations(storeId).catch(() => []),
      storeDataApi.cashDepositPickups(storeId).catch(() => []),
      storeDataApi.expiredInventory(storeId).catch(() => []),
    ]).then(([c, d, i]) => {
      setCash(c || []);
      setDeposits(d || []);
      setInventory(i || []);
      setLoading(false);
    });
  }, [storeId]);

  const storeName = useMemo(() => {
    const m = new Map(stores.map(s => [s.id, s.name]));
    return (id) => m.get(id) || id || EMPTY;
  }, [stores]);

  const kpis = useMemo(() => {
    const totalDeposits = deposits.reduce((s, d) => s + (num(d.cash_deposited) || 0), 0);
    const delayed = deposits.filter(d => !d.cms_pickup_date || (d.handover_delay_days || 0) > 0).length;
    const mismatches = cash.filter(c => !isZero(c.difference)).length;
    return { totalDeposits, delayed, mismatches, expired: inventory.length };
  }, [cash, deposits, inventory]);

  const q = search.trim().toLowerCase();

  const filteredCash = useMemo(() => cash.filter(r =>
    !q || [storeName(r.store_id), r.store_id, r.remarks].some(v => String(v ?? '').toLowerCase().includes(q))
  ), [cash, q, storeName]);

  const filteredDeposits = useMemo(() => deposits.filter(r =>
    !q || [storeName(r.store_id), r.store_id, r.remarks, r.sales_date].some(v => String(v ?? '').toLowerCase().includes(q))
  ), [deposits, q, storeName]);

  const filteredInventory = useMemo(() => inventory.filter(r =>
    !q || [storeName(r.store_id), r.store_id, r.article_code, r.article_description].some(v => String(v ?? '').toLowerCase().includes(q))
  ), [inventory, q, storeName]);

  const kpiTiles = [
    { label: 'Cash Records', value: cash.length, bg: '#e8eefa', icon: 'CR' },
    { label: 'Total Deposits', value: inr(kpis.totalDeposits), bg: '#def7ec', icon: 'DP' },
    { label: 'Delayed Pickups', value: kpis.delayed, bg: '#feecdc', icon: 'DL' },
    { label: 'Cash Mismatches', value: kpis.mismatches, bg: '#fde8e8', icon: 'MM' },
    { label: 'Expired Items', value: kpis.expired, bg: '#fde8e8', icon: 'EX' },
  ];

  return (
    <>
      {canPick && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground">Store</span>
          <StorePicker stores={stores} value={storeId} onChange={v => setFilter('store', v)} allowAll />
        </div>
      )}

      {/* KPI row */}
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {kpiTiles.map(t => (
          <div key={t.label} className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4">
            <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-foreground/70" style={{ background: t.bg }}>{t.icon}</div>
            <div>
              <div className="mb-0.5 text-[11px] text-muted-foreground">{t.label}</div>
              <div className="text-xl font-bold leading-none text-foreground">{t.value}</div>
            </div>
          </div>
        ))}
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
        <div className="relative max-w-[260px] flex-1">
          <Input
            placeholder="Search store, article, remarks..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex h-[40vh] items-center justify-center text-muted-foreground">Loading compliance data...</div>
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-border bg-card">
          {tab === 'cash' && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store</TableHead>
                  <TableHead>Physical cash</TableHead>
                  <TableHead>Book cash</TableHead>
                  <TableHead>Difference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCash.length > 0 ? filteredCash.map((r, i) => (
                  <TableRow key={r.id || i}>
                    <TableCell>{storeName(r.store_id)}</TableCell>
                    <TableCell className="font-medium">{inr(r.physical_cash_total)}</TableCell>
                    <TableCell className="font-medium">{inr(r.book_cash_total)}</TableCell>
                    <TableCell className={diffClass(r.difference)}>{inr(r.difference)}</TableCell>
                    <TableCell>
                      <Badge className={isZero(r.difference) ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-800'}>
                        {isZero(r.difference) ? 'Matched' : 'Mismatch'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.remarks || EMPTY}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={6} className="p-10 text-center text-muted-foreground">No cash reconciliation records found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}

          {tab === 'deposits' && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store</TableHead>
                  <TableHead>Sales date</TableHead>
                  <TableHead>Cash sales</TableHead>
                  <TableHead>Deposited</TableHead>
                  <TableHead>Difference</TableHead>
                  <TableHead>CMS pickup date</TableHead>
                  <TableHead>Delay (days)</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDeposits.length > 0 ? filteredDeposits.map((r, i) => (
                  <TableRow key={r.id || i}>
                    <TableCell>{storeName(r.store_id)}</TableCell>
                    <TableCell className="text-xs">{r.sales_date || EMPTY}</TableCell>
                    <TableCell className="font-medium">{inr(r.cash_sales)}</TableCell>
                    <TableCell className="font-medium">{inr(r.cash_deposited)}</TableCell>
                    <TableCell className={diffClass(r.difference)}>{inr(r.difference)}</TableCell>
                    <TableCell className="text-xs">{r.cms_pickup_date || EMPTY}</TableCell>
                    <TableCell className={(r.handover_delay_days || 0) > 0 ? 'font-semibold text-red-600' : ''}>
                      {r.handover_delay_days ?? EMPTY}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.remarks || EMPTY}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={8} className="p-10 text-center text-muted-foreground">No deposit pickup records found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}

          {tab === 'inventory' && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store</TableHead>
                  <TableHead>Article code</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Expiry date</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>MRP</TableHead>
                  <TableHead>Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInventory.length > 0 ? filteredInventory.map((r, i) => (
                  <TableRow key={r.id || i}>
                    <TableCell>{storeName(r.store_id)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.article_code || EMPTY}</TableCell>
                    <TableCell className="font-medium">{r.article_description || EMPTY}</TableCell>
                    <TableCell className="text-xs">{r.expiry_date || EMPTY}</TableCell>
                    <TableCell>{r.quantity ?? EMPTY}</TableCell>
                    <TableCell>{inr(r.mrp)}</TableCell>
                    <TableCell className="font-medium">
                      {num(r.quantity) != null && num(r.mrp) != null ? inr(num(r.quantity) * num(r.mrp)) : EMPTY}
                    </TableCell>
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
      )}

      <div className="mt-3 flex justify-end text-xs text-muted-foreground">
        {tab === 'cash' && <span>{filteredCash.length} records</span>}
        {tab === 'deposits' && <span>{filteredDeposits.length} records</span>}
        {tab === 'inventory' && <span>{filteredInventory.length} records</span>}
      </div>
    </>
  );
}
