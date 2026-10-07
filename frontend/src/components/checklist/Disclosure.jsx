import { cn } from '@/lib/utils';

// A whole-row click target that opens/closes its content. Content is a sibling
// of the button, so clicking inside it never toggles.
export default function Disclosure({ open, onToggle, header, className, headerClassName, children }) {
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={cn(
          'flex w-full cursor-pointer items-center justify-between gap-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          headerClassName
        )}
      >
        <div className="min-w-0 flex-1">{header}</div>
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 4l6 6-6 6" />
        </svg>
      </button>
      {open && children}
    </div>
  );
}
