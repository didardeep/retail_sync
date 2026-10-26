import { useEffect, useState } from 'react';

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
  checklist_id: '', audit_type: AUDIT_TYPES[0],
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
// open: {} for a new audit, { row } to edit one.
export default function ScheduleAuditModal({ open, onClose, onSaved, stores, auditors, checklists }) {
  const toast = useToast();
  const editRow = open?.row || null;
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(null);

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
      setForm(EMPTY_FORM);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

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
      } else {
        await api.scheduleAudit({
          store_id: form.store_id, scheduled_at: startAt, due_at: endAt || null,
          auditor_id: form.auditor_id || null, audit_type: form.audit_type,
          notes: form.notes || null, checklist_id: form.checklist_id || null,
        });
        toast.success('Audit scheduled');
      }
      onClose();
      await onSaved();
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
            <div>
              <label className={labelClass}>Checklist</label>
              <select className={fieldClass} value={form.checklist_id} onChange={(e) => setForm({ ...form, checklist_id: e.target.value })}>
                <option value="">No checklist</option>
                {checklists.map((c) => <option key={c.id} value={c.id}>{c.name} (v{c.version})</option>)}
              </select>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!editRow && (
            <div>
              <label className={labelClass}>Store <span className="text-destructive">*</span></label>
              <select className={fieldClass} value={form.store_id} onChange={(e) => setForm({ ...form, store_id: e.target.value })}>
                <option value="">Select store</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}{s.city ? ` - ${s.city}` : ''}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className={labelClass}>Auditor</label>
            <select className={fieldClass} value={form.auditor_id} onChange={(e) => setForm({ ...form, auditor_id: e.target.value })}>
              <option value="">Unassigned</option>
              {auditors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>

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
