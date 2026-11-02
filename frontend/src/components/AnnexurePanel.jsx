import { useEffect, useRef, useState } from 'react';
import { Download, Paperclip, Trash2 } from 'lucide-react';

import { api, loadSession } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/Toast';

const READ_ONLY_ROLES = ['CLUSTER_HEAD', 'HO_OPERATIONS'];

// Supporting documents filed against an audit.
export default function AnnexurePanel({ auditId }) {
  const toast = useToast();
  const user = loadSession()?.user;
  const input = useRef(null);
  const [rows, setRows] = useState(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const canFile = !READ_ONLY_ROLES.includes(user?.role);
  const isManager = user?.role === 'ADMIN' || user?.role === 'AUDIT_MANAGER';

  useEffect(() => {
    api.annexures(auditId).then(setRows).catch(() => setRows([]));
  }, [auditId]);

  async function add(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const row = await api.fileAnnexure(auditId, file, title);
      setRows((prev) => [row, ...(prev || [])]);
      setTitle('');
      toast('Annexure filed');
    } catch (e) {
      toast.error(e.message || 'Could not file the annexure');
    } finally {
      setBusy(false);
    }
  }

  async function download(row) {
    try {
      const url = URL.createObjectURL(await api.annexureFile(auditId, row.id));
      const link = document.createElement('a');
      link.href = url;
      link.download = row.file_name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e.message || 'Could not download the file');
    }
  }

  async function remove(row) {
    try {
      await api.deleteAnnexure(auditId, row.id);
      setRows((prev) => prev.filter((x) => x.id !== row.id));
    } catch (e) {
      toast.error(e.message || 'Could not remove the file');
    }
  }

  return (
    <div className="mb-4 rounded-lg border bg-card p-4 shadow-sm">
      <div className="mb-2 text-[13px] font-bold text-foreground">Supporting annexures</div>
      {rows?.length ? rows.map((row) => (
        <div key={row.id} className="flex items-center justify-between gap-2 border-t border-border py-2 first:border-0">
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-semibold text-foreground">{row.title}</div>
            <div className="truncate text-[11px] text-muted-foreground">{row.file_name} • {row.uploaded_by} • {(row.created_at || '').substring(0, 10)}</div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Button type="button" size="sm" variant="outline" aria-label={`Download ${row.file_name}`} onClick={() => download(row)}><Download /></Button>
            {canFile && (isManager || row.uploaded_by_id === user?.id) && (
              <Button type="button" size="sm" variant="outline" aria-label={`Remove ${row.file_name}`} onClick={() => remove(row)}><Trash2 /></Button>
            )}
          </div>
        </div>
      )) : <div className="py-1 text-xs text-muted-foreground">{rows ? 'Nothing filed yet.' : 'Loading...'}</div>}
      {canFile && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Input className="min-w-[180px] flex-1" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input ref={input} type="file" hidden accept=".pdf,.xlsx,.xls,.csv,.docx,.doc,.jpg,.jpeg,.png" onChange={add} />
          <Button type="button" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
            <Paperclip /> {busy ? 'Uploading...' : 'File an annexure'}
          </Button>
        </div>
      )}
    </div>
  );
}
