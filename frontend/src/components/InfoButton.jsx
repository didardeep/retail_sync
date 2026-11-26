import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';

// A small "i" beside a title. Clicking it shows how the number is worked out.
export default function InfoButton({ lines, label = 'How this is calculated' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handle(e) { if (!ref.current?.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  return (
    <span ref={ref} className="relative ml-1.5 inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        title={label}
        className="flex size-[18px] items-center justify-center rounded-full text-muted-foreground hover:text-primary"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      >
        <Info className="size-3.5" />
      </button>
      {open && (
        <span className="absolute left-0 top-[calc(100%+6px)] z-40 block w-[300px] max-w-[80vw] rounded-lg border border-border bg-card p-3 text-left text-[11.5px] font-normal leading-snug text-foreground shadow-lg">
          <b className="mb-1 block">{label}</b>
          {lines.map((line) => <span key={line} className="mt-1 block">{line}</span>)}
        </span>
      )}
    </span>
  );
}
