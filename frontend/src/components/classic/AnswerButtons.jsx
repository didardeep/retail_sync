import { cn } from '@/lib/utils';
import { ANSWERS } from '@/lib/classicAudit';

const LABEL = { Yes: 'Yes', Partial: 'Partial', No: 'No', NA: 'N/A' };

const ACTIVE = {
  Yes: 'border-emerald-600 bg-emerald-600 text-white',
  Partial: 'border-amber-500 bg-amber-500 text-white',
  No: 'border-red-600 bg-red-600 text-white',
  NA: 'border-slate-500 bg-slate-500 text-white',
};

const IDLE = {
  Yes: 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
  Partial: 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100',
  No: 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100',
  NA: 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100',
};

// Four large touch targets. The chosen answer is only shown as selected once
// the parent says so (i.e. after the server accepted it).
export default function AnswerButtons({ value, onPick, disabled }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Answer">
      {ANSWERS.map((a) => (
        <button
          key={a}
          type="button"
          disabled={disabled}
          aria-pressed={value === a}
          onClick={() => onPick(a)}
          className={cn(
            'min-h-[56px] rounded-lg border-2 px-4 text-base font-bold transition-colors',
            value === a ? ACTIVE[a] : IDLE[a],
            disabled && 'cursor-not-allowed opacity-60',
          )}
        >
          {LABEL[a]}
        </button>
      ))}
    </div>
  );
}
