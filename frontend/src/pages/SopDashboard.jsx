import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';

import { sopDashboardApi } from '@/api/sopDashboard';
import { Button } from '@/components/ui/button';
import AuditsTable from '@/components/sop-dashboard/AuditsTable';
import CoveragePanel from '@/components/sop-dashboard/CoveragePanel';
import FilterBar from '@/components/sop-dashboard/FilterBar';
import KpiTiles from '@/components/sop-dashboard/KpiTiles';
import ParetoChart from '@/components/sop-dashboard/ParetoChart';
import SectionGap from '@/components/sop-dashboard/SectionGap';
import StoreRanking from '@/components/sop-dashboard/StoreRanking';
import TrendCard from '@/components/sop-dashboard/TrendCard';
import { truncate } from '@/components/sop-dashboard/chartKit';
import {
  buildIndex, coverage, filterAudits, kpis, pareto, sectionStats, storeRanking,
  storesInScope, tableRows, toCsv, trendByMonth,
} from '@/components/sop-dashboard/logic';

// Filters live in the URL, so a filtered view can be shared, refreshed, and
// the back button works. `tab` belongs to the parent Dashboard page.
const FILTER_KEYS = ['tool', 'region', 'store', 'section', 'criterion', 'q'];

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SopDashboard() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState({ data: null, error: null, loading: true });

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    sopDashboardApi.load()
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => setState({ data: null, error, loading: false }));
  }, []);
  useEffect(() => { load(); }, [load]);

  const filters = useMemo(
    () => Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || ''])),
    [params],
  );

  function setFilter(key, value) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      // A section or question belongs to one tool, so drop them when the tool changes.
      if (key === 'tool') { next.delete('section'); next.delete('criterion'); }
      return next;
    }, { replace: true });
  }
  const toggle = (key, value) => setFilter(key, filters[key] === value ? '' : value);
  function clearAll() {
    setParams((prev) => {
      const next = new URLSearchParams();
      if (prev.get('tab')) next.set('tab', prev.get('tab'));
      return next;
    }, { replace: true });
  }

  const view = useMemo(() => {
    const { data } = state;
    if (!data) return null;
    const index = buildIndex(data);
    // Ranking and coverage keep showing every store so a selected store stays
    // visible among the others; everything else narrows to the store as well.
    const withoutStore = { ...filters, store: '' };
    const scopeAudits = filterAudits(data, withoutStore, index);
    const audits = filterAudits(data, filters, index);
    const scopeStores = storesInScope(data, withoutStore);
    const sections = sectionStats(audits);
    const ranking = storeRanking(scopeAudits, index);
    const rows = tableRows(data, audits, index, filters);
    return {
      index,
      audits,
      ranking,
      sections,
      kpi: kpis(audits, storeRanking(audits, index), storesInScope(data, filters)),
      pareto: pareto(data, new Set(audits.map((a) => a.id)), filters.section, index),
      trend: trendByMonth(audits),
      coverage: coverage(scopeStores, data.coverage_days),
      rows,
      regions: [...new Set(data.stores.map((s) => s.region).filter(Boolean))].sort(),
    };
  }, [state, filters]);

  if (state.loading && !state.data) {
    return <div className="flex h-[50vh] items-center justify-center text-muted-foreground">Loading SOP scores...</div>;
  }
  if (state.error) {
    return (
      <div className="flex h-[40vh] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <div>Could not load the SOP dashboard: {state.error.message}</div>
        <Button size="sm" onClick={load}>Try again</Button>
      </div>
    );
  }

  const { data } = state;
  if (data.audits.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        No submitted SOP audits yet. Scores appear here as soon as auditors submit their first audit.
      </div>
    );
  }

  const { index } = view;
  const sectionRow = view.sections.find((s) => s.key === filters.section);
  const sectionText = sectionRow
    ? `${filters.tool ? '' : `${sectionRow.tool} `}${sectionRow.code}. ${sectionRow.name}` : '';
  const criterionText = filters.criterion
    ? (index.criterionById[filters.criterion]?.title ?? '').split('\n')[0] : '';
  const chips = [];
  if (filters.store) chips.push({ key: 'store', label: `Store: ${index.storeById[filters.store]?.name ?? filters.store}` });
  if (filters.section) chips.push({ key: 'section', label: `Section: ${truncate(sectionText || filters.section, 36)}` });
  if (filters.criterion) chips.push({ key: 'criterion', label: `Question: ${truncate(criterionText, 36)}` });

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2 className="text-xl font-bold text-foreground">SOP Audit Scores</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {data.audits.length} submitted audits across {data.stores.filter((s) => s.audit_count > 0).length} stores
            {' '}&bull; click any chart to focus the rest of the page
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={state.loading}>
          <RefreshCw className={state.loading ? 'animate-spin' : ''} /> Refresh
        </Button>
      </div>

      <FilterBar
        tools={data.tools}
        regions={view.regions}
        filters={filters}
        onChange={setFilter}
        onClearAll={clearAll}
        chips={chips}
        shown={view.audits.length}
        total={data.audits.length}
        onExport={() => download('sop-audits.csv', toCsv(view.rows))}
      />

      <KpiTiles kpi={view.kpi} />

      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[3fr_2fr]">
        <StoreRanking
          ranking={view.ranking}
          selectedStore={filters.store}
          onSelectStore={(id) => toggle('store', id)}
        />
        <SectionGap
          sections={view.sections}
          showTool={!filters.tool}
          selectedSection={filters.section}
          onSelectSection={(key) => toggle('section', key)}
        />
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[3fr_2fr]">
        <ParetoChart
          pareto={view.pareto}
          selectedCriterion={filters.criterion}
          sectionLabel={sectionText}
          onSelectCriterion={(id) => toggle('criterion', id)}
        />
        <CoveragePanel
          coverage={view.coverage}
          coverageDays={data.coverage_days}
          selectedStore={filters.store}
          onSelectStore={(id) => toggle('store', id)}
        />
      </div>

      <div className="mb-3">
        <TrendCard trend={view.trend} />
      </div>

      <AuditsTable
        rows={view.rows}
        sectionLabel={filters.section ? filters.section.split(':')[1] : ''}
        criterionLabel={criterionText ? truncate(criterionText, 60) : ''}
        onOpen={(id) => navigate(`/sop-audits/${id}/review`)}
        onSelectStore={(id) => toggle('store', id)}
      />
    </>
  );
}
