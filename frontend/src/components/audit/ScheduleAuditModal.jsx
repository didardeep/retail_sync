import { useEffect, useState } from 'react';
import { checklistSummary, fittingChecklists, keepFitting, toggleId } from '@/lib/checklists';

import { useToast } from '../Toast';
import { api } from '../../api/client';
import { scheduleApi } from '../../api/scheduleApi';
import { cn, fieldClass, labelClass } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, ModalActions } from '../Modal';
import { durationLabel, formatTime } from '@/lib/auditRows';

const AUDIT_TYPES = ['Checklist based Audit', 'Store Visit', 'Structured data analysis', 'Unstructured data analysis'];

const EMPTY_FORM = {
  checklist_ids: [], audit_type: AUDIT_TYPES[0],
  store_id: '', auditor_id: '', date: '', time: '10:00', end_date: '', end_time: '18:00', notes: '',
};

// "Auditor is already booked that day at Select Citywalk (11:00)"
function clashText(c) {
  const where = c.store ? ` at ${c.store}` : ' at another store';
  const at = c.scheduled_at ? ` (${formatTime(c.scheduled_at)})` : '';
  return `Auditor is already booked that day${where}${at}`;
}

function conflictText(c) {
  if (!c) return '';
  if (c.error === 'auditor unavailable') return `Auditor is unavailable on that day${c.reason ? ` (${c.reason})` : ''}.`;
  return `${clashText(c)}.`;
}

export function scheduleErrorMessage(e) {
  const d = e.detail || {};
  if (e.status === 409 && d.error === 'auditor unavailable') {
    return `Auditor is unavailable on that day${d.reason ? ` (${d.reason})` : ''}`;
  }
  if (e.status === 409 && d.audit_id) return clashText(d);
  return e.message || 'Something went wrong';
}

// Schedule a new checklist audit or edit a planned one: start, end, auditor,
// notes. Warns live when the auditor is away or already booked.
// open: {} for a new audit, { store_id } for a new audit at that store, { row } to edit one.
// With a store picked, the store's own auditors come first (one is filled in),
// and the form warns when the store has no auditor or no auditee.
export default function ScheduleAuditModal({ open, onClose, onSaved, stores, auditors, checklists }) {
  const toast = useToast();
  const editRow = open?.row || null;
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(null);
  const [hints, setHints] = useState(null);          // /audits/suggestions for the store
  const [assignToStore, setAssignToStore] = useState(false);
  const [added, setAdded] = useState([]);            // auditors created from this form
  const [newAuditor, setNewAuditor] = useState(null); // { name, email, password } while adding

  useEffect(() => {
    if (!open) return;
    setConflict(null);
    if (editRow) {
      const start = editRow.start || '';
      const end = editRow.due_at || '';
      setForm({
        ...EMPTY_FORM, store_id: editRow.store_id || '',
        auditor_id: editRow.auditor_id || '', date: start.slice(0, 10), time: start.slice(11, 16) || '10:00',
        end_date: end.slice(0, 10), end_time: end.slice(11, 16) || '18:00', notes: editRow.notes || '',
      });
    } else {
      setForm({ ...EMPTY_FORM, store_id: open?.store_id || '' });
    }
    setHints(null);
    setAssignToStore(false);
    setNewAuditor(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // The store's auditors and auditees, for the auditor list and the warnings.
  const hintStore = editRow ? editRow.store_id : form.store_id;
  useEffect(() => {
    if (!open || !hintStore) { setHints(null); return undefined; }
    let cancelled = false;
    api.schedulingSuggestions(hintStore).then((h) => {
      if (cancelled) return;
      setHints(h);
      // A new audit gets the store's only auditor filled in.
      if (!editRow && h.suggested_auditor_id) {
        setForm((f) => (f.auditor_id ? f : { ...f, auditor_id: h.suggested_auditor_id }));
      }
    }).catch(() => { if (!cancelled) setHints(null); });
    return () => { cancelled = true; };
  }, [open, hintStore]); // eslint-disable-line react-hooks/exhaustive-deps

  const storeAuditorIds = new Set((hints?.store_auditors || []).map((a) => a.id));
  const otherAuditors = [...auditors, ...added].filter((a) => !storeAuditorIds.has(a.id));
  const pickedOutsideStore = !!form.auditor_id && !!hints && !storeAuditorIds.has(form.auditor_id);

  async function createAuditor() {
    const n = newAuditor || {};
    if (!n.name?.trim() || !n.email?.trim() || !n.password) { toast.error('Fill in name, login and password'); return; }
    try {
      const person = await api.createAuditor({
        name: n.name.trim(), email: n.email.trim(), password: n.password, phone: n.phone || null,
      });
      setAdded((prev) => [...prev, person]);
      setForm((f) => ({ ...f, auditor_id: person.id }));
      setAssignToStore(true);
      setNewAuditor(null);
      toast.success(`Auditor ${person.name} added`);
    } catch (e) {
      toast.error(e.message || 'Could not add the auditor');
    }
  }

  // Live clash hint while the form is open.
  const canCheck = !!open && form.auditor_id && form.date && (form.store_id || editRow);
  useEffect(() => {
    if (!canCheck) { setConflict(null); return undefined; }
    let cancelled = false;
    const timer = setTimeout(() => {
      scheduleApi.conflicts({
        auditorId: form.auditor_id,
        date: form.date,
        storeId: editRow ? editRow.store_id : form.store_id,
        excludeId: editRow?.id,
      }).then((res) => { if (!cancelled) setConflict(res.conflict); })
        .catch(() => { if (!cancelled) setConflict(null); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [canCheck, form.auditor_id, form.date, form.store_id, editRow]);

  const fitting = fittingChecklists(checklists, stores.find((s) => s.id === form.store_id));
  const startAt = form.date ? `${form.date}T${form.time || '10:00'}:00` : '';
  const endAt = form.end_date ? `${form.end_date}T${form.end_time || '18:00'}:00` : '';
  const endBeforeStart = startAt && endAt && endAt < startAt;
  const duration = durationLabel(startAt, endAt);

  async function save() {
    if (!form.store_id && !editRow) { toast.error('Select a store'); return; }
    if (!form.date) { toast.error('Select a start date'); return; }
    if (endBeforeStart) { toast.error('The end must not be before the start'); return; }
    setSaving(true);
    try {
      if (editRow) {
        const body = { scheduled_at: startAt, due_at: endAt || null, notes: form.notes };
        if (form.auditor_id) body.auditor_id = form.auditor_id;
        await scheduleApi.patch(editRow.id, body);
        toast.success('Schedule updated');
        onClose();
        await onSaved();
      } else {
        const created = await api.scheduleAudit({
          store_id: form.store_id, scheduled_at: startAt, due_at: endAt || null,
          auditor_id: form.auditor_id || null, audit_type: form.audit_type,
          notes: form.notes || null, checklist_ids: form.checklist_ids,
          assign_to_store: !!form.auditor_id && pickedOutsideStore && assignToStore,
        });
        const when = new Date(startAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        toast.success(`Audit ${created.id} scheduled for ${created.store || 'the store'} on ${when}`);
        onClose();
        await onSaved(created);
      }
    } catch (e) {
      toast.error(scheduleErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!open} onClose={onClose} className="w-[620px]">
      <div className="mb-4 text-[15px] font-bold text-foreground">{editRow ? 'Edit Scheduled Audit' : 'Schedule New Audit'}</div>
      <div className="grid gap-3">
        {editRow ? (
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[12.5px]">
            <div className="font-semibold">{editRow.tool}</div>
            <div className="text-muted-foreground">{editRow.store} - {editRow.id}</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Audit type</label>
              <select className={fieldClass} value={form.audit_type} onChange={(e) => setForm({ ...form, audit_type: e.target.value })}>
                {AUDIT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <div className="mb-1 flex items-center justify-between">
                <label className={labelClass}>Checklists</label>
                <span className="flex gap-3 text-[11.5px]">
                  <button type="button" className="font-medium text-primary hover:underline"
                    onClick={() => setForm({ ...form, checklist_ids: fitting.map((c) => c.id) })}>Add all ({fitting.length})</button>
                  <button type="button" className="font-medium text-muted-foreground hover:underline"
                    onClick={() => setForm({ ...form, checklist_ids: [] })}>Clear</button>
                </span>
              </div>
              <div className="max-h-40 overflow-y-auto rounded-md border border-border p-1.5">
                {fitting.length ? fitting.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[12.5px] hover:bg-accent">
                    <input type="checkbox" className="accent-primary" checked={form.checklist_ids.includes(c.id)}
                      onChange={() => setForm({ ...form, checklist_ids: toggleId(form.checklist_ids, c.id) })} />
                    <span className="flex-1">{c.name} (v{c.version})</span>
                    <span className="text-[11px] text-muted-foreground">{c.question_count ?? 0} questions</span>
                  </label>
                )) : <div className="px-1.5 py-2 text-xs text-muted-foreground">No checklist applies to this store.</div>}
              </div>
              <p className="mt-1 text-[11.5px] text-muted-foreground">{checklistSummary(form.checklist_ids, checklists)}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!editRow && (
            <div>
              <label className={labelClass}>Store <span className="text-destructive">*</span></label>
              <select className={fieldClass} value={form.store_id} onChange={(e) => {
                const store = stores.find((s) => s.id === e.target.value);
                setForm({ ...form, store_id: e.target.value, checklist_ids: keepFitting(form.checklist_ids, checklists, store) });
              }}>
                <option value="">Select store</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}{s.city ? ` - ${s.city}` : ''}</option>)}
              </select>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between">
              <label className={labelClass}>Auditor</label>
              {!newAuditor && (
                <button type="button" className="mb-1 text-[11.5px] font-semibold text-primary hover:underline" onClick={() => setNewAuditor({ name: '', email: '', password: '' })}>+ Add auditor</button>
              )}
            </div>
            <select className={fieldClass} value={form.auditor_id} onChange={(e) => setForm({ ...form, auditor_id: e.target.value })}>
              <option value="">Unassigned</option>
              {hints?.store_auditors?.length > 0 && (
                <optgroup label="This store's auditors">
                  {hints.store_auditors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </optgroup>
              )}
              <optgroup label={hints?.store_auditors?.length ? 'Other auditors' : 'Auditors'}>
                {otherAuditors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </optgroup>
            </select>
            {hints && form.auditor_id && storeAuditorIds.has(form.auditor_id) && (
              <div className="mt-1 text-[11.5px] text-emerald-700">Assigned auditor for this store</div>
            )}
          </div>
        </div>

        {newAuditor && (
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <div className="mb-2 text-[12.5px] font-semibold">New auditor</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input placeholder="Full name" value={newAuditor.name} onChange={(e) => setNewAuditor({ ...newAuditor, name: e.target.value })} />
              <Input placeholder="Login (username or email)" value={newAuditor.email} onChange={(e) => setNewAuditor({ ...newAuditor, email: e.target.value })} />
              <Input type="password" placeholder="Password" value={newAuditor.password} onChange={(e) => setNewAuditor({ ...newAuditor, password: e.target.value })} />
              <Input placeholder="Phone (optional)" value={newAuditor.phone || ''} onChange={(e) => setNewAuditor({ ...newAuditor, phone: e.target.value })} />
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setNewAuditor(null)}>Cancel</Button>
              <Button size="sm" onClick={createAuditor}>Add auditor</Button>
            </div>
          </div>
        )}

        {!editRow && pickedOutsideStore && (
          <label className="flex items-center gap-2 text-[12.5px]">
            <input type="checkbox" checked={assignToStore} onChange={(e) => setAssignToStore(e.target.checked)} />
            Also assign this auditor to the store, so the next audit here suggests them
          </label>
        )}

        {hints?.warnings?.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[12.5px] text-amber-900">
            {hints.warnings.map((w) => <div key={w}>{w}.</div>)}
          </div>
        )}
        {hints && hints.auditees?.length > 0 && (
          <div className="text-[11.5px] text-muted-foreground">Auditees notified about this store: {hints.auditees.map((a) => a.name).join(', ')}</div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelClass}>Start date <span className="text-destructive">*</span></label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
          <div><label className={labelClass}>Start time</label><Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></div>
          <div><label className={labelClass}>End date</label><Input type="date" min={form.date || undefined} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
          <div><label className={labelClass}>End time</label><Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></div>
        </div>
        {endBeforeStart ? (
          <div className="text-[12px] text-destructive">The end is before the start.</div>
        ) : (
          <div className="text-[12px] text-muted-foreground">
            {duration ? `Duration: ${duration}. The audit is overdue if it is not finished by the end.` : 'Without an end, the audit is overdue once its start day has passed.'}
          </div>
        )}

        {conflict && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[12.5px] text-amber-900" role="alert">
            {conflictText(conflict)} Saving will be refused.
          </div>
        )}

        <div><label className={labelClass}>Notes</label><textarea className={cn(fieldClass, 'min-h-[90px] resize-y')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Add any relevant notes..." /></div>
      </div>
      <ModalActions>
        <Button variant="outline" onClick={onClose}>Close</Button>
        <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : editRow ? 'Save Changes' : 'Schedule'}</Button>
      </ModalActions>
    </Modal>
  );
}
