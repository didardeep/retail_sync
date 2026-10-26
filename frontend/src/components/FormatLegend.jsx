import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';

// Who owns and who runs the store, for each store format code.
export const STORE_FORMATS = [
  { code: 'COCO', name: 'Company Owned, Company Operated', note: 'The company owns the store and runs it.' },
  { code: 'COFO', name: 'Company Owned, Franchise Operated', note: 'The company owns the store; a franchisee runs it.' },
  { code: 'FOCO', name: 'Franchise Owned, Company Operated', note: 'A franchisee owns the store; the company runs it.' },
  { code: 'FOFO', name: 'Franchise Owned, Franchise Operated', note: 'A franchisee owns the store and runs it.' },
];

// An (i) button that opens the store format legend. Closes on a second click,
// a click outside or Escape.
export default function FormatLegend({ className }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className={`relative inline-flex ${className || ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="What do COCO, COFO, FOCO and FOFO mean?"
        title="What do COCO, COFO, FOCO and FOFO mean?"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Info className="size-3.5" />
      </button>
      {open && (
        <div role="dialog" aria-label="Store formats" className="absolute left-0 top-6 z-30 w-[280px] rounded-lg border border-border bg-card p-3 text-left text-xs font-normal shadow-lg">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Store formats</div>
          {STORE_FORMATS.map((f) => (
            <div key={f.code} className="mb-2 last:mb-0">
              <div className="text-foreground"><b>{f.code}</b> - {f.name}</div>
              <div className="text-muted-foreground">{f.note}</div>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
