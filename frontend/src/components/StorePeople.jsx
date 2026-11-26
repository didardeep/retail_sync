import { useCallback, useEffect, useState } from 'react';

import { api } from '@/api/client';
import { cn, fieldClass, labelClass } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/Toast';

const KINDS = {
  auditor: {
    title: 'Auditors', role: 'AUDITOR', empty: 'No auditor assigned to this store.',
    add: (sid, uid) => api.addStoreAuditor(sid, uid),
    remove: (sid, uid, to) => api.removeStoreAuditor(sid, uid, to ? { reassign_to: to } : {}),
    create: (body) => api.createAuditor(body),
    moveLabel: 'Give their planned audits here to',
    moveNone: 'Leave them unassigned',
  },
  auditee: {
    title: 'Auditees', role: 'AUDITEE', empty: 'No auditee for this store. Add one so they get its issues and notifications.',
    add: (sid, uid) => api.addStoreAuditee(sid, uid),
    remove: (sid, uid, to) => api.removeStoreAuditee(sid, uid, to ? { move_issues_to: to } : {}),
    create: (body) => api.createAuditee(body),
    moveLabel: 'Move their open issues here to',
    moveNone: 'Nobody (only if they have no open issues)',
  },
};

const EMPTY_NEW = { name: '', email: '', password: '', phone: '', designation: '' };

// One list (auditors or auditees) of a store: add an existing person, create a
// new one, or remove someone and say who takes over their open work.
function PeopleList({ kind, storeId, linked, onChange }) {
  const toast = useToast();
  const k = KINDS[kind];
  const [everyone, setEveryone] = useState([]);
  const [pick, setPick] = useState('');
  const [creating, setCreating] = useState(null);
  const [removing, setRemoving] = useState(null); // { person, to }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.people(`?role=${k.role}`).then(setEveryone).catch(() => setEveryone([]));
  }, [k.role]);

  const linkedIds = new Set(linked.map((p) => p.id));
  const addable = everyone.filter((p) => !linkedIds.has(p.id));

  async function run(fn, done) {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      await onChange();
      return true;
    } catch (e) {
      toast.error(e.message || 'Something went wrong');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addExisting() {
    if (!pick) return;
    if (await run(() => k.add(storeId, pick), `${kind === 'auditor' ? 'Auditor' : 'Auditee'} added to the store`)) setPick('');
  }

  async function createNew() {
    const n = creating;
    if (!n.name.trim() || !n.email.trim() || !n.password) { toast.error('Fill in name, login and password'); return; }
    const ok = await run(async () => {
      const person = await k.create({
        name: n.name.trim(), email: n.email.trim(), password: n.password,
        phone: n.phone || null, designation: n.designation || null, store_ids: [storeId],
      });
      setEveryone((prev) => [...prev, person]);
    }, `${n.name.trim()} added and linked to this store`);
    if (ok) setCreating(null);
  }

  async function confirmRemove() {
    const { person, to } = removing;
    const ok = await run(async () => {
      const res = await k.remove(storeId, person.id, to);
      const moved = res.planned_audits_moved ?? res.issues_moved ?? 0;
      if (moved) toast(`${moved} ${kind === 'auditor' ? 'planned audit' : 'open issue'}${moved === 1 ? '' : 's'} ${to ? 'handed over' : 'left unassigned'}`);
    }, `${person.name} removed from this store`);
    if (ok) setRemoving(null);
  }

  const others = linked.filter((p) => p.id !== removing?.person.id);
  const moveChoices = kind === 'auditor' ? everyone.filter((p) => p.id !== removing?.person.id) : others;

  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="text-[12.5px] font-bold text-foreground">{k.title} ({linked.length})</div>
        {!creating && (
          <button type="button" className="text-[11.5px] font-semibold text-primary hover:underline" onClick={() => setCreating({ ...EMPTY_NEW })}>
            + Create new {kind}
          </button>
        )}
      </div>

      {linked.length === 0 && <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[12px] text-amber-900">{k.empty}</div>}
      {linked.map((p) => (
        <div key={p.id} className="flex items-center justify-between gap-2 border-b border-border py-1.5 text-[12.5px] last:border-0">
          <div className="min-w-0">
            <div className="truncate font-semibold">{p.name}</div>
            <div className="truncate text-[11px] text-muted-foreground">{[p.designation, p.email, p.phone].filter(Boolean).join(' · ')}</div>
          </div>
          <Button size="sm" variant="outline" className="h-7 border-red-200 px-2 text-[11px] text-destructive" disabled={busy} onClick={() => setRemoving({ person: p, to: '' })}>Remove</Button>
        </div>
      ))}

      {removing && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50/50 p-2.5">
          <div className="mb-1.5 text-[12.5px]">Remove <b>{removing.person.name}</b> from this store? Their account stays active.</div>
          <label className={labelClass}>{k.moveLabel}</label>
          <select className={fieldClass} value={removing.to} onChange={(e) => setRemoving({ ...removing, to: e.target.value })}>
            <option value="">{k.moveNone}</option>
            {moveChoices.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button size="sm" variant="destructive" disabled={busy} onClick={confirmRemove}>Remove</Button>
          </div>
        </div>
      )}

      {!removing && (
        <div className="mt-2 flex gap-2">
          <select className={cn(fieldClass, 'h-9 py-0 text-[12.5px]')} value={pick} onChange={(e) => setPick(e.target.value)} aria-label={`Add an existing ${kind}`}>
            <option value="">Add an existing {kind}...</option>
            {addable.map((p) => <option key={p.id} value={p.id}>{p.name}{p.region ? ` (${p.region})` : ''}</option>)}
          </select>
          <Button size="sm" disabled={!pick || busy} onClick={addExisting}>Add</Button>
        </div>
      )}

      {creating && (
        <div className="mt-2 rounded-lg border border-border bg-muted/40 p-2.5">
          <div className="mb-1.5 text-[12.5px] font-semibold">New {kind} for this store</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input placeholder="Full name" value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value })} />
            <Input placeholder="Login (username or email)" value={creating.email} onChange={(e) => setCreating({ ...creating, email: e.target.value })} />
            <Input type="password" placeholder="Password" value={creating.password} onChange={(e) => setCreating({ ...creating, password: e.target.value })} />
            <Input placeholder="Phone (optional)" value={creating.phone} onChange={(e) => setCreating({ ...creating, phone: e.target.value })} />
            {kind === 'auditee' && (
              <Input className="sm:col-span-2" placeholder="Designation, e.g. Cashier Head (optional)" value={creating.designation} onChange={(e) => setCreating({ ...creating, designation: e.target.value })} />
            )}
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setCreating(null)}>Cancel</Button>
            <Button size="sm" disabled={busy} onClick={createNew}>Create &amp; add</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// The People tab of a store: its auditors and its auditees. `focus` scrolls
// to one list ('auditor' or 'auditee') when opened from a next step.
export default function StorePeople({ storeId, focus, onCounts }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await api.storeDetails(storeId);
      setData(d);
      setError(null);
      onCounts?.(storeId, d.auditors.length, d.auditees.length);
    } catch (e) {
      setError(e);
    }
  }, [storeId, onCounts]);

  useEffect(() => { load(); }, [load]);

  if (error) return <div className="py-4 text-center text-xs text-destructive">{error.message}</div>;
  if (!data) return <div className="py-4 text-center text-xs text-muted-foreground">Loading people...</div>;
  const order = focus === 'auditee' ? ['auditee', 'auditor'] : ['auditor', 'auditee'];
  return (
    <div>
      {order.map((kind) => (
        <PeopleList key={kind} kind={kind} storeId={storeId} linked={kind === 'auditor' ? data.auditors : data.auditees} onChange={load} />
      ))}
    </div>
  );
}
