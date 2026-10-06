import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

import { api } from '@/api/client';

// Shows a proof photo from either a local Blob (offline audits) or, for
// audits only on the server, an authenticated download.
export default function AttachmentThumb({ att, onRemove }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let url = null;
    let cancelled = false;
    async function load() {
      try {
        const blob = att.blob || (await api.sopAttachmentBlob(att.url));
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      } catch {
        setSrc(null);
      }
    }
    load();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [att]);

  return (
    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
      {src && <img src={src} alt="Proof" className="h-full w-full object-cover" />}
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(att.id)}
          aria-label="Remove photo"
          className="absolute right-0.5 top-0.5 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
