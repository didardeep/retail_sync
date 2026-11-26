import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// A narrow strip beside the question to jump straight to one, or to the end.
// items: [{ index, label, state }] where state is 'done' | 'todo' | 'flag' | 'flag-done'.
export default function QuestionRail({ title, items, currentIndex, onJump, endLabel, onEnd }) {
  const tone = {
    done: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    todo: 'border-border bg-card text-muted-foreground',
    flag: 'border-amber-400 bg-amber-50 text-amber-900',
    'flag-done': 'border-emerald-400 bg-emerald-50 text-emerald-800',
  };

  return (
    <nav aria-label={title} className="sticky top-4 hidden max-h-[calc(100vh-6rem)] w-[150px] shrink-0 flex-col gap-2 self-start overflow-y-auto rounded-lg border border-border bg-card p-2.5 lg:flex">
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <button
            key={it.index}
            type="button"
            onClick={() => onJump(it.index)}
            aria-label={`Go to question ${it.label}`}
            aria-current={it.index === currentIndex ? 'true' : undefined}
            className={cn(
              'flex h-7 min-w-7 items-center justify-center rounded-md border px-1 text-[11px] font-semibold',
              tone[it.state] || tone.todo,
              it.index === currentIndex && 'ring-2 ring-primary',
            )}
          >
            {it.label}
          </button>
        ))}
      </div>
      <Button type="button" size="sm" className="mt-1 whitespace-nowrap px-2 text-xs" onClick={onEnd}>{endLabel}</Button>
    </nav>
  );
}
