import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api, loadSession } from '../api/client';
import { storeDataApi } from '../api/storeData';
import { useUrlFilters } from '@/lib/useUrlFilters';
import { auditsLink, storeScorecardLink } from '@/lib/links';
import StorePicker from '@/components/StorePicker';
import { Drawer } from '@/components/Modal';
import ClickableRow from '@/components/store/ClickableRow';
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
const inr = (v) => (num(v) == null ? EMPTY : `\u20B9${num(v).toLocaleString('en-IN')}`);
const isZero = (v) => Math.abs(num(v) || 0) < 0.005;
const diffClass = (v) => (isZero(v) ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600');
const isDelayed = (r) => !r.cms_pickup_date || (r.handover_delay_days || 0) > 0;
const itemValue = (r) => (num(r.quantity) != null && num(r.mrp) != null ? num(r.quantity) * num(r.mrp) : null);

// Row filters set by the KPI tiles; each belongs to one tab.
const FILTERS = {
  mismatch: { tab: 'cash', label: 'Cash mismatches only', test: (r) => !isZero(r.difference) },
  delayed: { tab: 'deposits', label: 'Delayed pickups only', test: isDelayed },
};

// Label/value lines shown in the detail drawer for each record type.
const DETAIL_FIELDS = {
  cash: (r) => [
    ['Cash at tills', inr(r.cash_at_tills)],
    ['Cash in safe', inr(r.cash_in_safe)],
    ['Other locations', inr(r.cash_other_locations)],
    ['Physical cash total', inr(r.physical_cash_total)],
    ['Cash sales per report', inr(r.cash_sales_as_per_report)],
    ['Float / imprest', inr(r.float_or_imprest_amount)],
    ['Book cash total', inr(r.book_cash_total)],
    ['Difference', inr(r.difference)],
    ['Status', isZero(r.difference) ? 'Matched' : 'Mismatch'],
    ['Remarks', r.remarks || EMPTY],
  ],
  deposits: (r) => [
    ['Sales date', r.sales_date || EMPTY],
    ['Cash sales', inr(r.cash_sales)],
    ['Cash deposited', inr(r.cash_deposited)],
    ['Difference', inr(r.difference)],
    ['CMS pickup date', r.cms_pickup_date || 'Not picked up'],
    ['Handover delay (days)', r.handover_delay_days ?? EMPTY],
    ['Remarks', r.remarks || EMPTY],
  ],
  inventory: (r) => [
    ['Article code', r.article_code || EMPTY],
    ['Description', r.article_description || EMPTY],
    ['Expiry date', r.expiry_date || EMPTY],
    ['Review date', r.review_date || EMPTY],
    ['Quantity', r.quantity ?? EMPTY],
    ['MRP', inr(r.mrp)],
    ['Value', inr(itemValue(r))],
  ],
};

const DETAIL_TITLES = { cash: 'Cash reconciliation', deposits: 'Deposit pickup', inventory: 'Expired item' };

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
  const [rowFilter, setRowFilter] = useState(null);
  const [detail, setDetail] = useState(null);

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
    const delayed = deposits.filter(isDelayed).length;
    const mismatches = cash.filter(FILTERS.mismatch.test).length;
    return { totalDeposits, delayed, mismatches, expired: inventory.length };
  }, [cash, deposits, inventory]);

  const q = search.trim().toLowerCase();
  const activeTest = rowFilter && FILTERS[rowFilter].tab === tab ? FILTERS[rowFilter].test : null;

  const filteredCash = useMemo(() => cash.filter(r =>
    (tab !== 'cash' || !activeTest || activeTest(r)) &&
    (!q || [storeName(r.store_id), r.store_id, r.remarks].some(v => String(v ?? '').toLowerCase().includes(q)))
  ), [cash, q, storeName, tab, activeTest]);

  const filteredDeposits = useMemo(() => deposits.filter(r =>
    (tab !== 'deposits' || !activeTest || activeTest(r)) &&
    (!q || [storeName(r.store_id), r.store_id, r.remarks, r.sales_date].some(v => String(v ?? '').toLowerCase().includes(q)))
  ), [deposits, q, storeName, tab, activeTest]);

  const filteredInventory = useMemo(() => inventory.filter(r =>
    !q || [storeName(r.store_id), r.store_id, r.article_code, r.article_description].some(v => String(v ?? '').toLowerCase().includes(q))
  ), [inventory, q, storeName]);

  // Each tile jumps to the tab it counts, with a row filter where it counts a subset.
  const kpiTiles = [
    { label: 'Cash Records', value: cash.length, bg: '#e8eefa', icon: 'CR', tab: 'cash', filter: null },
    { label: 'Total Deposits', value: inr(kpis.totalDeposits), bg: '#def7ec', icon: 'DP', tab: 'deposits', filter: null },
    { label: 'Delayed Pickups', value: kpis.delayed, bg: '#feecdc', icon: 'DL', tab: 'deposits', filter: 'delayed' },
    { label: 'Cash Mismatches', value: kpis.mismatches, bg: '#fde8e8', icon: 'MM', tab: 'cash', filter: 'mismatch' },
    { label: 'Expired Items', value: kpis.expired, bg: '#fde8e8', icon: 'EX', tab: 'inventory', filter: null },
  ];

  const openTile = (t) => { setTab(t.tab); setRowFilter(t.filter); setSearch(''); };

  const detailRow = detail ? detail.row : null;
  const detailLines = detailRow ? DETAIL_FIELDS[detail.tab](detailRow) : [];

  const rowProps = (tabId, r) => ({
    onActivate: () => setDetail({ tab: tabId, row: r }),
    label: `Show details for ${storeName(r.store_id)}`,
    role: 'button',
  });

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
          <button
            key={t.label}
            type="button"
            onClick={() => openTile(t)}
            className={cn(
              'flex items-center gap-3 rounded-[10px] border bg-card p-3.5 py-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              t.filter && rowFilter === t.filter ? 'border-primary' : 'border-border'
            )}
          >
            <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-foreground/70" style={{ background: t.bg }}>{t.icon}</div>
            <div>
              <div className="mb-0.5 text-[11px] text-muted-foreground">{t.label}</div>
              <div className="text-xl font-bold leading-none text-foreground">{t.value}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Tabs + search */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSearch(''); setRowFilter(null); }}
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

      {activeTest && (
        <div className="mb-3 flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
            Filter active: {FILTERS[rowFilter].label}
            <button
              type="button"
              onClick={() => setRowFilter(null)}
              className="rounded underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              clear
            </button>
          </span>
        </div>
      )}

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
                  <ClickableRow key={r.id || i} {...rowProps('cash', r)}>
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
                  </ClickableRow>
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
                  <ClickableRow key={r.id || i} {...rowProps('deposits', r)}>
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
                  </ClickableRow>
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
                  <ClickableRow key={r.id || i} {...rowProps('inventory', r)}>
                    <TableCell>{storeName(r.store_id)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.article_code || EMPTY}</TableCell>
                    <TableCell className="font-medium">{r.article_description || EMPTY}</TableCell>
                    <TableCell className="text-xs">{r.expiry_date || EMPTY}</TableCell>
                    <TableCell>{r.quantity ?? EMPTY}</TableCell>
                    <TableCell>{inr(r.mrp)}</TableCell>
                    <TableCell className="font-medium">{inr(itemValue(r))}</TableCell>
                  </ClickableRow>
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

      <Drawer open={!!detail} onClose={() => setDetail(null)}>
        {detailRow && (
          <div>
            <div className="mb-1 flex items-start justify-between gap-2">
              <div className="text-[15px] font-bold text-foreground">{DETAIL_TITLES[detail.tab]}</div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                aria-label="Close details"
                className="rounded px-2 text-lg leading-none text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                x
              </button>
            </div>
            <div className="mb-3 text-[13px]">
              <Link to={canPick ? storeScorecardLink(detailRow.store_id, role) : '/my-store'} className="font-semibold text-primary hover:underline">
                {storeName(detailRow.store_id)}
              </Link>
            </div>
            <dl className="mb-4 divide-y divide-border rounded-lg border border-border">
              {detailLines.map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3 px-3 py-2 text-[12.5px]">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-medium text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
            <Link to={auditsLink({ store: detailRow.store_id })} className="text-[12.5px] font-medium text-primary hover:underline">
              Audits for this store
            </Link>
          </div>
        )}
      </Drawer>
    </>
  );
}
