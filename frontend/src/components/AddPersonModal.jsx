import { useEffect, useState } from 'react';

import { api } from '@/api/client';
import { cn, labelClass } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, ModalActions, ModalTitle } from '@/components/Modal';
import { useToast } from '@/components/Toast';

const EMPTY = { name: '', email: '', password: '', phone: '', designation: '', region: '', store_ids: [] };

// Add an auditor or an auditee from Store Management. An auditee must be linked
// to at least one store; for an auditor the stores are optional and make them
// those stores' own auditor (suggested first when scheduling).
// kind: 'auditor' | 'auditee' | null (closed). onSaved(person) after saving.
export default function AddPersonModal({ kind, stores, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (kind) { setForm(EMPTY); setSearch(''); }
  }, [kind]);

  if (!kind) return null;
  const isAuditee = kind === 'auditee';
  const shown = stores.filter((s) => {
    const q = search.trim().toLowerCase();
    return !q || `${s.name} ${s.city || ''} ${s.brand || ''}`.toLowerCase().includes(q);
  });

  function toggle(id) {
    setForm((f) => ({
      ...f, store_ids: f.store_ids.includes(id) ? f.store_ids.filter((x) => x !== id) : [...f.store_ids, id],
    }));
  }

  async function save() {
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      toast.error('Fill in name, login and password');
      return;
    }
    if (isAuditee && !form.store_ids.length) {
      toast.error('Pick at least one store for the auditee');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(), email: form.email.trim(), password: form.password,
        phone: form.phone || null, designation: form.designation || null,
        region: form.region || null, store_ids: form.store_ids,
      };
      const person = await (isAuditee ? api.createAuditee(body) : api.createAuditor(body));
      const where = form.store_ids.length ? ` and linked to ${form.store_ids.length} store${form.store_ids.length === 1 ? '' : 's'}` : '';
      toast.success(`${person.name} added as ${kind}${where}`);
      onSaved?.(person);
      onClose();
    } catch (e) {
      toast.error(e.message || `Could not add the ${kind}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} className="w-[560px]">
      <ModalTitle>Add {isAuditee ? 'Auditee' : 'Auditor'}</ModalTitle>
      <p className="mb-3 text-[12px] text-muted-foreground">
        {isAuditee
          ? 'An auditee follows up the issues raised at their stores and is told when an audit there is queried or approved.'
          : 'An auditor carries out audits. Linking stores makes them those stores’ own auditor, suggested first when scheduling.'}
      </p>
      <div className="grid gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className={labelClass}>Full name <span className="text-destructive">*</span></label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className={labelClass}>Login (username or email) <span className="text-destructive">*</span></label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><label className={labelClass}>Password <span className="text-destructive">*</span></label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          <div><label className={labelClass}>Phone</label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          {isAuditee
            ? <div className="sm:col-span-2"><label className={labelClass}>Designation</label><Input placeholder="e.g. Cashier Head" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></div>
            : <div className="sm:col-span-2"><label className={labelClass}>Region</label><Input placeholder="e.g. North India" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /></div>}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className={cn(labelClass, 'mb-0')}>Stores {isAuditee ? <span className="text-destructive">*</span> : '(optional)'}</span>
            <span className="text-[11px] text-muted-foreground">{form.store_ids.length} selected</span>
          </div>
          <Input className="mb-1.5 h-9" placeholder="Search stores..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="max-h-[180px] overflow-y-auto rounded-md border border-border">
            {shown.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-2 border-b border-border px-2.5 py-1.5 text-[12.5px] last:border-0 hover:bg-accent">
                <input type="checkbox" checked={form.store_ids.includes(s.id)} onChange={() => toggle(s.id)} />
                <span className="font-medium">{s.name}</span>
                <span className="text-[11px] text-muted-foreground">{[s.brand, s.city].filter(Boolean).join(' - ')}</span>
              </label>
            ))}
            {!shown.length && <div className="p-3 text-center text-xs text-muted-foreground">No stores match</div>}
          </div>
        </div>
      </div>
      <ModalActions>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={saving} onClick={save}>{saving ? 'Saving...' : `Add ${isAuditee ? 'Auditee' : 'Auditor'}`}</Button>
      </ModalActions>
    </Modal>
  );
}
