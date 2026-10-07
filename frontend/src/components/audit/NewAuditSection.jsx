import { useMemo, useState } from 'react';
import { X } from 'lucide-react';

import { auditOptions, storeSummaries } from '@/lib/auditorStats';
import StoreOptionsPanel from './StoreOptionsPanel';
import { StoreFilters, StoreRow } from './StoreList';
import { filterStoreSummaries, regionList } from './auditHelpers';

// "New audit": the auditor's store list with the per-store panel, so an
// unscheduled audit (scored or checklist) can be started. Works offline for
// scored audits (stores and templates come from the device copy).
// rows are the auditor's own merged audit rows.
export default function NewAuditSection({
  stores, templates, checklists, checklistsFailed, online, rows, openingKey, onRun, onClose,
}) {
  const [q, setQ] = useState('');
  const [region, setRegion] = useState('');
  const [view, setView] = useState('');
  const [storeId, setStoreId] = useState('');

  const summaries = useMemo(() => storeSummaries(stores, rows), [stores, rows]);
  const regions = useMemo(() => regionList(summaries), [summaries]);
  const visible = useMemo(
    () => filterStoreSummaries(summaries, { q, region, view }),
    [summaries, q, region, view],
  );
  const selected = summaries.find((s) => s.store_id === storeId) || null;
  const options = useMemo(
    () => (selected ? auditOptions(selected.store_id, rows, templates, checklists) : []),
    [selected, rows, templates, checklists],
  );

  const checklistNote = (checklistsFailed || (!online && checklists.length === 0))
    ? 'Checklist audits could not be loaded, so only scored audits are shown.'
    : null;
  const panel = selected && (
    <StoreOptionsPanel
      store={selected}
      options={options}
      openingKey={openingKey}
      checklistNote={checklistNote}
      onAction={(o) => onRun(o, selected.store_id)}
      onClose={() => setStoreId('')}
    />
  );

  return (
    <section className="mb-5 rounded-lg border bg-muted/20 p-3" aria-label="New audit">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">New audit: choose a store</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close new audit"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
        >
          <X className="size-4" />
        </button>
      </div>
      <StoreFilters
        q={q}
        onQ={setQ}
        region={region}
        onRegion={setRegion}
        regions={regions}
        view={view}
        onView={setView}
      />
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
        {visible.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {stores.length === 0 && !online
              ? 'Connect to the internet once to download your stores.'
              : 'No stores match.'}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
            {visible.map((s, i) => (
              <div key={s.store_id}>
                <StoreRow
                  summary={s}
                  first={i === 0}
                  selected={s.store_id === storeId}
                  onSelect={(id) => setStoreId(id === storeId ? '' : id)}
                />
                {s.store_id === storeId && (
                  <div className="border-t border-border bg-muted/30 p-3 lg:hidden">{panel}</div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="hidden lg:sticky lg:top-4 lg:block">
          {panel || (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Select a store to see its audits.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
