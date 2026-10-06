import { useEffect, useRef, useState } from 'react';
import { Camera, Image as ImageIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import AttachmentThumb from '@/components/AttachmentThumb';
import { BottomSheet } from '@/components/Modal';

// Proof for one criterion: a comment and/or photos (FR-3.4). Photos come from
// the camera or the gallery; compression happens in the caller.
export default function ProofSheet({
  open, onClose, criterion, comment, attachments,
  onComment, onAddPhoto, onRemovePhoto, busy,
}) {
  const [text, setText] = useState(comment || '');
  const camera = useRef(null);
  const gallery = useRef(null);

  useEffect(() => {
    if (open) setText(comment || '');
  }, [open, comment]);

  function close() {
    if (text !== (comment || '')) onComment(text);
    onClose();
  }

  async function picked(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await onAddPhoto(file);
  }

  return (
    <BottomSheet open={open} onClose={close}>
      <div className="mb-1 text-[15px] font-bold text-foreground">Proof / comment</div>
      <div className="mb-3 text-xs text-muted-foreground">{criterion?.title}</div>

      <label className="mb-1 block text-[11.5px] font-semibold text-foreground/80">
        Comment{criterion?.requires_comment ? ' (required)' : ''}
      </label>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== (comment || '') && onComment(text)}
        placeholder="What did you observe?"
        rows={4}
      />

      <div className="mb-1 mt-4 text-[11.5px] font-semibold text-foreground/80">
        Photos{criterion?.requires_photo ? ' (required)' : ''}
      </div>
      <div className="flex flex-wrap gap-2">
        {attachments.map((a) => (
          <AttachmentThumb key={a.id} att={a} onRemove={onRemovePhoto} />
        ))}
        {attachments.length === 0 && (
          <div className="text-xs text-muted-foreground">No photos added yet.</div>
        )}
      </div>

      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={picked} />
      <input ref={gallery} type="file" accept="image/*" className="hidden" onChange={picked} />
      <div className="mt-3 flex gap-2">
        <Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => camera.current?.click()}>
          <Camera /> Take photo
        </Button>
        <Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => gallery.current?.click()}>
          <ImageIcon /> Gallery
        </Button>
      </div>

      <Button type="button" className="mt-4 w-full" onClick={close}>Done</Button>
    </BottomSheet>
  );
}
