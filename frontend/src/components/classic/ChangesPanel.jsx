import { Check, CircleDot, Undo2 } from 'lucide-react';

import { categoryLabel, fixProgress } from '@/lib/changesRequested';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// Shown at the top of the wizard when the audit manager sent the audit back: who
// asked, why, and every flagged question with the reason. Click one to jump to it.
export default function ChangesPanel({ audit, flagged, changed, currentIndex, onJump, onSubmit, submitting }) {
  const progress = fixProgress(flagged, changed);
  const manager = flagged[0]?.by || 'The audit manager';

  return (
    <section className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950" aria-label="Changes requested">
      <div className="flex items-start gap-2">
        <Undo2 className="mt-0.5 size-4 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">
            {manager} sent this audit back: {flagged.length} {flagged.length === 1 ? 'question needs' : 'questions need'} another look
          </div>
          {audit.decision_note && <div className="mt-0.5 text-[12.5px]">{audit.decision_note}</div>}
          <div className="mt-1 text-[11.5px] text-amber-900">
            {progress.done} of {progress.total} changed. The other answers are locked. When you are done, submit the changes.
          </div>
        </div>
      </div>

      <ul className="mt-2 grid gap-1.5">
        {flagged.map((f) => {
          const done = changed.includes(f.id);
          return (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => onJump(f.index)}
                className={cn(
                  'flex w-full items-start gap-2 rounded-md border bg-white px-2.5 py-2 text-left text-[12px] hover:border-amber-500',
                  f.index === currentIndex ? 'border-amber-600 ring-1 ring-amber-500' : 'border-amber-200',
                )}
              >
                {done
                  ? <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-label="Changed" />
                  : <CircleDot className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-label="Still to fix" />}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11px] font-semibold text-foreground">{f.code}</span>
                    {categoryLabel(f.category) && <Badge className="bg-amber-100 text-amber-900">{categoryLabel(f.category)}</Badge>}
                    {done && <span className="text-[11px] font-medium text-emerald-700">Changed</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-foreground">{f.text}</span>
                  <span className="mt-0.5 block text-amber-900">{f.note}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11.5px] text-amber-900">
          {progress.allDone ? 'Everything flagged was changed.' : `${progress.left} still unchanged.`}
        </span>
        <Button type="button" size="sm" disabled={submitting} onClick={onSubmit}>
          {submitting ? 'Submitting...' : 'Submit changes'}
        </Button>
      </div>
    </section>
  );
}
