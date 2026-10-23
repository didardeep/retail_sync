import { useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';

import { api } from '@/api/client';
import { cn } from '@/lib/utils';
import { BENCHMARK, QUARTERS } from '@/lib/storeStats';
import { brandStyles, trendQuery } from '@/lib/dashboardScope';

const GRID = 'rgba(0,0,0,.06)';

// Multi-line trend: one line per brand, the brand's average store score for
// Q1 to Q4. The brand chips are the legend and also show or hide a line; the
// store list narrows which stores are counted. Both only change this chart.
// Scores are the imported quarterly store scores, the same figures the store
// bars, format chart and rankings use (the tiles above count audits instead).
export default function BrandTrendCard({ title, allBrands, brands, stores }) {
  // brands: brands in the current scope; stores: stores in the current scope.
  const [hidden, setHidden] = useState(() => new Set());
  const [picked, setPicked] = useState(null);        // null = every store in scope
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);
  const styles = useMemo(() => brandStyles(allBrands), [allBrands]);

  const scopeKey = `${brands.map((b) => b.id).join(',')}|${stores.map((s) => s.id).join(',')}`;
  // A new scope starts with everything shown.
  useEffect(() => { setHidden(new Set()); setPicked(null); }, [scopeKey]);

  const storeIds = picked ? stores.filter((s) => picked.has(s.id)).map((s) => s.id) : null;
  const query = trendQuery({
    brandIds: brands.length === allBrands.length ? [] : brands.map((b) => b.id),
    storeIds: storeIds ?? (stores.length === 0 ? [] : null),
  });
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    api.brandTrend(query)
      .then((r) => { if (!cancelled) setRows(r.brands || []); })
      .catch(() => { if (!cancelled) { setRows([]); setFailed(true); } });
    return () => { cancelled = true; };
  }, [query]);

  const lines = (rows || []).filter((r) => !hidden.has(r.brand_id));
  const values = lines.flatMap((r) => QUARTERS.map((q) => r.scores[q])).filter((v) => v != null);
  const min = values.length ? Math.max(0, Math.floor((Math.min(...values, BENCHMARK) - 5) / 10) * 10) : 50;

  const data = {
    labels: QUARTERS.map((q) => q.toUpperCase()),
    datasets: [
      ...lines.map((r) => {
        const st = styles[r.brand_id] || { color: '#6b7280', point: 'circle' };
        return {
          label: r.brand, data: QUARTERS.map((q) => r.scores[q]),
          borderColor: st.color, backgroundColor: st.color, borderWidth: 2, tension: 0.3,
          pointStyle: st.point, pointRadius: 5, pointHoverRadius: 7, pointBorderColor: '#fff', pointBorderWidth: 1.5,
          spanGaps: true,
        };
      }),
      { label: `Benchmark ${BENCHMARK}%`, data: QUARTERS.map(() => BENCHMARK), borderColor: '#9ca3af', borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0, fill: false },
    ],
  };
  const options = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y == null ? 'not scored' : `${c.parsed.y}%`}` } },
    },
    scales: {
      y: { min, max: 100, ticks: { font: { size: 10 }, callback: (v) => `${v}%` }, grid: { color: GRID } },
      x: { ticks: { font: { size: 10 } }, grid: { display: false } },
    },
  };

  function toggleBrand(id) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleStore(id) {
    setPicked((prev) => {
      const next = new Set(prev || stores.map((s) => s.id));
      if (next.has(id)) next.delete(id); else next.add(id);
      return next.size === stores.length ? null : next;
    });
  }

  return (
    <div className="rounded-[10px] border border-border bg-card p-4">
      <div className="mb-1 flex items-center justify-between gap-2 text-[13px] font-semibold text-foreground">
        {title}
        <span className="text-[11px] font-normal text-muted-foreground">Benchmark: {BENCHMARK}%</span>
      </div>
      <p className="mb-2 text-[11px] text-muted-foreground">
        From the quarterly store scores. The chips and the store list change this chart only.
      </p>

      <div className="mb-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Brands shown in the chart">
        {brands.map((b) => {
          const on = !hidden.has(b.id);
          const st = styles[b.id];
          return (
            <button
              key={b.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggleBrand(b.id)}
              className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', on ? 'border-border bg-card text-foreground' : 'border-dashed border-border bg-muted/40 text-muted-foreground line-through')}
            >
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: on ? st?.color : '#9ca3af' }} />
              {b.name}
            </button>
          );
        })}
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground">
            Stores: {picked ? `${picked.size} of ${stores.length}` : `all ${stores.length}`}
          </summary>
          <div className="absolute left-0 top-full z-20 mt-1 max-h-60 w-60 overflow-y-auto rounded-lg border border-border bg-card p-2 shadow-lg">
            <div className="mb-1 flex gap-3 text-[11px]">
              <button type="button" className="text-primary hover:underline" onClick={() => setPicked(null)}>All</button>
              <button type="button" className="text-primary hover:underline" onClick={() => setPicked(new Set())}>None</button>
            </div>
            {stores.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-2 py-0.5 text-xs text-foreground">
                <input type="checkbox" checked={!picked || picked.has(s.id)} onChange={() => toggleStore(s.id)} />
                {s.name}
              </label>
            ))}
          </div>
        </details>
      </div>

      {rows === null ? (
        <div className="flex h-[190px] items-center justify-center text-xs text-muted-foreground">Loading...</div>
      ) : failed ? (
        <div className="flex h-[190px] items-center justify-center text-xs text-muted-foreground">Could not load the trend</div>
      ) : lines.length === 0 ? (
        <div className="flex h-[190px] items-center justify-center px-4 text-center text-xs text-muted-foreground">
          No brand to show: switch a brand back on or pick at least one store
        </div>
      ) : (
        <div className="relative h-[190px] w-full" role="img" aria-label={`${title}: ${lines.map((r) => r.brand).join(', ')}`}>
          <Line data={data} options={options} />
        </div>
      )}

      {lines.length > 0 && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">View as table</summary>
          <table className="mt-1 w-full text-left">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-0.5 font-semibold">Brand</th>
                {QUARTERS.map((q) => <th key={q} className="py-0.5 font-semibold">{q.toUpperCase()}</th>)}
                <th className="py-0.5 font-semibold">Stores scored</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((r) => (
                <tr key={r.brand_id} className="border-t border-border">
                  <td className="py-0.5">{r.brand}</td>
                  {QUARTERS.map((q) => <td key={q} className="py-0.5">{r.scores[q] == null ? '--' : `${r.scores[q]}%`}</td>)}
                  <td className="py-0.5">{r.scored_store_count} of {r.store_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
