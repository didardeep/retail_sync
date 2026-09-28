import { cn } from '@/lib/utils';

/** Centered modal, replacing the old .modal-ov/.modal CSS pair. */
export function Modal({ open, onClose, className, children }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className={cn('max-h-[88vh] w-[460px] max-w-[93vw] overflow-y-auto rounded-xl bg-card p-[22px] shadow-2xl', className)}>
        {children}
      </div>
    </div>
  );
}

export function ModalTitle({ children }) {
  return <div className="mb-4 text-[15px] font-bold text-foreground">{children}</div>;
}

export function ModalActions({ children }) {
  return <div className="mt-4.5 flex justify-end gap-1.5">{children}</div>;
}

/** Right-side sliding drawer, replacing the old .drawer-ov/.drawer CSS pair. */
export function Drawer({ open, onClose, className, children }) {
  return (
    <div
      className={cn('fixed inset-0 z-[1000] bg-black/30', open ? 'block' : 'hidden')}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className={cn(
        'fixed bottom-0 right-0 top-0 w-[380px] max-w-[92vw] overflow-y-auto bg-card p-[22px] shadow-2xl transition-transform duration-200 ease-out',
        open ? 'translate-x-0' : 'translate-x-full',
        className,
      )}>
        {children}
      </div>
    </div>
  );
}
