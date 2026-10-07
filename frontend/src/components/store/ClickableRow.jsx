import { TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

// A table row that acts as one big button: click, Enter or Space activates it.
export default function ClickableRow({ onActivate, className, children, label, role = 'link' }) {
  const onKeyDown = (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate();
    }
  };
  return (
    <TableRow
      role={role}
      tabIndex={0}
      aria-label={label}
      onClick={onActivate}
      onKeyDown={onKeyDown}
      className={cn('cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none', className)}
    >
      {children}
    </TableRow>
  );
}
