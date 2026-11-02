import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Paperclip, X } from 'lucide-react';

import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/Toast';

const isUploaded = (url) => (url || '').startsWith('/api/evidence/');

// Uploaded files need the login token, which <img> and <video> cannot send, so
// the file is fetched first and shown from a local blob URL.
function useEvidenceSrc(url) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isUploaded(url)) return undefined;
    let cancelled = false;
    let objectUrl = null;
    api.evidenceFile(url)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return { src, failed };
}

function EvidenceItem({ item }) {
  const { src, failed } = useEvidenceSrc(item.url);
  const box = 'flex h-24 w-32 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40 p-1 text-center text-[11px] text-muted-foreground';

  // Links saved before uploads existed.
  if (!isUploaded(item.url)) {
    if (!/^https?:\/\//i.test(item.url || '')) return <div className={box}>Invalid link</div>;
    return (
      <a href={item.url} target="_blank" rel="noreferrer" className={box}>
        <ExternalLink className="mr-1 size-3.5 shrink-0" /> Open link
      </a>
    );
  }
  if (failed) return <div className={box}>Could not load file</div>;
  if (!src) return <div className={box}>Loading...</div>;
  if (item.type === 'video') {
    return <video src={src} controls className="h-24 w-32 rounded-md border border-border bg-black object-contain" />;
  }
  return (
    <a href={src} target="_blank" rel="noreferrer" title={item.name || 'Open photo'}>
      <img src={src} alt={item.name || 'Evidence photo'} className="h-24 w-32 rounded-md border border-border object-cover" />
    </a>
  );
}

// Read-only view of an evidence list.
export function EvidenceList({ items }) {
  if (!items?.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => <EvidenceItem key={item.url} item={item} />)}
    </div>
  );
}

// Add and remove photos or videos. On a phone the file input also offers the camera.
export function EvidencePicker({ value, onChange, disabled }) {
  const toast = useToast();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const items = value || [];

  async function add(event) {
    const files = [...event.target.files];
    event.target.value = '';
    if (!files.length) return;
    setBusy(true);
    const added = [];
    for (const file of files) {
      try {
        added.push(await api.uploadEvidence(file));
      } catch (e) {
        toast.error(`${file.name}: ${e.message || 'upload failed'}`);
      }
    }
    if (added.length) await onChange([...items, ...added]);
    setBusy(false);
  }

  return (
    <div>
      {items.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {items.map((item) => (
            <div key={item.url} className="relative">
              <EvidenceItem item={item} />
              <button
                type="button"
                aria-label="Remove file"
                disabled={disabled || busy}
                onClick={() => onChange(items.filter((x) => x.url !== item.url))}
                className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-50"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
        multiple
        hidden
        onChange={add}
      />
      <Button type="button" variant="outline" className="h-10" disabled={disabled || busy} onClick={() => input.current?.click()}>
        <Paperclip /> {busy ? 'Uploading...' : 'Add photo or video'}
      </Button>
    </div>
  );
}
