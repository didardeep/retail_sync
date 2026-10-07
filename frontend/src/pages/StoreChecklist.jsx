import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import { wColor } from '../utils/helpers';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import Disclosure from '@/components/checklist/Disclosure';
import SopToolCard from '@/components/checklist/SopToolCard';
import {
  classicKeys, filterSopTools, groupQuestions, normQuery, sopKeys, visibleQuestions,
} from '@/components/checklist/checklistLogic';

const TABS = [
  { id: 'sop', label: 'SOP audit tools' },
  { id: 'classic', label: 'Checklist questions' },
];

export default function StoreChecklist() {
  const [questions, setQuestions] = useState([]);
  const [tools, setTools] = useState([]);
  const [toolsError, setToolsError] = useState(false);
  const [tab, setTab] = useState('sop');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({}); // key -> bool, all closed by default

  useEffect(() => {
    const loadTools = api.sopTemplates()
      .then(list => Promise.all((list || []).map(t => api.sopTemplate(t.id))))
      .catch(() => { setToolsError(true); return []; });
    Promise.all([api.questions().catch(() => []), loadTools]).then(([q, t]) => {
      setQuestions(visibleQuestions(q));
      setTools(t);
      setLoading(false);
    });
  }, []);

  const searching = normQuery(search) !== '';
  const shownTools = useMemo(() => filterSopTools(tools, search), [tools, search]);
  const groups = useMemo(() => groupQuestions(questions, search), [questions, search]);

  // While searching, everything that matched is shown open.
  const isOpen = key => searching || !!expanded[key];
  const toggle = key => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  function setAll(open) {
    const keys = tab === 'sop' ? sopKeys(shownTools) : classicKeys(groups);
    setExpanded(prev => {
      const next = { ...prev };
      for (const k of keys) next[k] = open;
      return next;
    });
  }

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground">Loading checklist...</div>;
  }

  return (
    <>
      <div className="mb-3 text-[13px] text-muted-foreground">
        This is what your store is audited on. Open a section to see what the auditor looks for.
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors',
                tab === t.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-1 items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setAll(true)}
            className="rounded-md border border-border px-2.5 py-1.5 text-[12px] hover:bg-muted/40"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={() => setAll(false)}
            disabled={searching}
            className="rounded-md border border-border px-2.5 py-1.5 text-[12px] hover:bg-muted/40 disabled:opacity-50"
          >
            Collapse all
          </button>
          <div className="relative max-w-[280px] flex-1">
            <Input
              placeholder={tab === 'sop' ? 'Search tools, sections, questions...' : 'Search questions, process...'}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {tab === 'sop' ? (
        shownTools.length === 0 ? (
          <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
            {searching
              ? 'No SOP questions match your search.'
              : toolsError ? 'Could not load the SOP audit tools.' : 'No SOP audit tools are published yet.'}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {shownTools.map(t => <SopToolCard key={t.id} tool={t} isOpen={isOpen} toggle={toggle} />)}
          </div>
        )
      ) : groups.length === 0 ? (
        <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
          No questions match your search.
        </div>
      ) : (
        <>
          <div className="mb-3 text-[13px] text-muted-foreground">
            {questions.length} active audit questions across {groups.length} process areas
          </div>
          <div className="flex flex-col gap-3">
            {groups.map(({ proc, total, subs }) => (
              <Disclosure
                key={proc}
                open={isOpen('p:' + proc)}
                onToggle={() => toggle('p:' + proc)}
                className="overflow-hidden rounded-[10px] border border-border bg-card"
                headerClassName="px-4 py-3"
                header={
                  <div className="flex items-center gap-2.5">
                    <span className="text-[13.5px] font-semibold text-foreground">{proc}</span>
                    <Badge className="bg-sky-50 text-sky-700">{total} questions</Badge>
                  </div>
                }
              >
                <div className="border-t border-border">
                  {subs.map(({ sp, items }) => (
                    <div key={sp}>
                      <div className="border-b border-border bg-muted/20 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {sp}
                      </div>
                      {items.map((qu, idx) => (
                        <div
                          key={qu.id || idx}
                          className={cn(
                            'grid grid-cols-[1fr_auto] gap-3 border-b border-border px-4 py-3 last:border-0',
                            idx % 2 === 0 ? '' : 'bg-muted/10'
                          )}
                        >
                          <div className="min-w-0">
                            <div className="flex items-start gap-2">
                              <span className="mt-0.5 h-[7px] w-[7px] shrink-0 rounded-full bg-primary/40" />
                              <span className="text-[12.5px] leading-snug text-foreground">{qu.text}</span>
                            </div>
                            {qu.guidance && (
                              <div className="mt-1 pl-[15px] text-[11px] leading-snug text-muted-foreground">
                                {qu.guidance}
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            {qu.is_critical && <Badge className="bg-red-50 text-red-800">Critical</Badge>}
                            {qu.weight != null && (
                              <span
                                className="rounded border px-1.5 py-0.5 text-[10.5px] font-semibold"
                                style={{
                                  color: wColor(qu.weight),
                                  borderColor: wColor(qu.weight) + '55',
                                  background: wColor(qu.weight) + '11',
                                }}
                              >
                                W{qu.weight}
                              </span>
                            )}
                            {qu.answer_type && (
                              <span className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-500">
                                {qu.answer_type}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </Disclosure>
            ))}
          </div>
        </>
      )}
    </>
  );
}
