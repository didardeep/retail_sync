import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import { wColor } from '../utils/helpers';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export default function StoreChecklist() {
  const [questions, setQuestions] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    api.questions().catch(() => []).then(q => {
      setQuestions((q || []).filter(x => x.active !== false));
      setLoading(false);
    });
  }, []);

  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = questions.filter(qu =>
      !q ||
      (qu.text || '').toLowerCase().includes(q) ||
      (qu.process || '').toLowerCase().includes(q) ||
      (qu.sub_process || '').toLowerCase().includes(q)
    );
    const map = {};
    for (const qu of filtered) {
      const proc = qu.process || 'General';
      if (!map[proc]) map[proc] = {};
      const sp = qu.sub_process || qu.sp || 'General';
      if (!map[proc][sp]) map[proc][sp] = [];
      map[proc][sp].push(qu);
    }
    return map;
  }, [questions, search]);

  function toggle(key) {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground">Loading checklist...</div>;
  }

  const processKeys = Object.keys(grouped);

  return (
    <>
      {/* Header bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-[13px] text-muted-foreground">
          {questions.length} active audit questions across {processKeys.length} process areas
        </div>
        <div className="relative max-w-[280px] flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">🔍</span>
          <Input
            className="pl-8"
            placeholder="Search questions, process..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {processKeys.length === 0 ? (
        <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
          No questions match your search.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {processKeys.map(proc => {
            const subProcs = grouped[proc];
            const totalQ = Object.values(subProcs).flat().length;
            const isOpen = expanded[proc] !== false; // open by default

            return (
              <div key={proc} className="overflow-hidden rounded-[10px] border border-border bg-card">
                {/* Process header */}
                <button
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/30"
                  onClick={() => toggle(proc)}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">📂</span>
                    <span className="text-[13.5px] font-semibold text-foreground">{proc}</span>
                    <Badge className="bg-sky-50 text-sky-700">{totalQ} questions</Badge>
                  </div>
                  <span className="text-muted-foreground">{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && (
                  <div className="border-t border-border">
                    {Object.entries(subProcs).map(([sp, qList]) => (
                      <div key={sp}>
                        {/* Sub-process label */}
                        <div className="border-b border-border bg-muted/20 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {sp}
                        </div>
                        {qList.map((qu, idx) => (
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
                              {qu.is_critical && (
                                <Badge className="bg-red-50 text-red-800">Critical</Badge>
                              )}
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
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
