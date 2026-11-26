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

/** Bottom sheet for phone-first flows (e.g. adding audit proof). */
export function BottomSheet({ open, onClose, className, children }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/40 md:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        className={cn(
          'max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-card p-5 shadow-2xl md:rounded-2xl',
          className,
        )}
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
      >
        {children}
      </div>
    </div>
  );
}

/** Sliding drawer (right by default), replacing the old .drawer-ov/.drawer CSS pair. */
export function Drawer({ open, onClose, className, children, side = 'right' }) {
  const isLeft = side === 'left';
  return (
    <div
      className={cn('fixed inset-0 z-[1000] bg-black/30', open ? 'block' : 'hidden')}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className={cn(
        'fixed bottom-0 top-0 w-[380px] max-w-[92vw] overflow-y-auto bg-card shadow-2xl transition-transform duration-200 ease-out',
        isLeft ? 'left-0' : 'right-0 p-[22px]',
        open ? 'translate-x-0' : (isLeft ? '-translate-x-full' : 'translate-x-full'),
        className,
      )}>
        {children}
      </div>
    </div>
  );
}
