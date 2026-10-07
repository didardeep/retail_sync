import { X } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Drawer } from '@/components/Modal';

// Side drawer that lists exactly the records behind a number on the page.
// `link` is an optional { to, label } shown above the list.
export default function DrillDrawer({ open, onClose, title, link, empty = 'Nothing here.', children }) {
  return (
    <Drawer open={open} onClose={onClose}>
      <div className="mb-3.5 flex items-start justify-between gap-2">
        <div className="text-[15px] font-bold text-foreground">{title}</div>
        <button type="button" aria-label="Close" onClick={onClose} className="shrink-0 text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
      {link && (
        <Link to={link.to} onClick={onClose} className="mb-3 block text-xs text-primary hover:underline">
          {link.label}
        </Link>
      )}
      {children || <div className="p-5 text-center text-xs text-muted-foreground">{empty}</div>}
    </Drawer>
  );
}
