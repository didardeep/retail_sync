import { useEffect, useMemo, useState } from 'react';

import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loading, ErrorNote } from '@/components/Loader';
import { Modal, ModalActions, ModalTitle } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { conditionsLabel, groupByProcess, storeChoices } from '@/lib/checklists';
import { labelClass } from '@/lib/utils';

const EMPTY = { id: null, name: '', format: [], category: [], question_ids: [], is_active: true };

function toggled(list, value) {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

function Choices({ label, hint, options, value, onChange }) {
  if (!options.length) return null;
  return (
    <div>
      <div className={labelClass}>{label}</div>
      <div className="flex flex-wrap gap-3">
        {options.map((o) => (
          <label key={o} className="flex items-center gap-1.5 text-[12.5px] text-foreground">
            <input type="checkbox" checked={value.includes(o)} onChange={() => onChange(toggled(value, o))} /> {o}
          </label>
        ))}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

// Build and edit checklists: their questions and which stores they apply to.
// Shown inside the Audit page for managers. onChange gets the new list.
export default function ChecklistsPanel({ onChange }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [stores, setStores] = useState([]);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.checklists(), api.questions(), api.stores()])
      .then(([c, q, s]) => {
        setRows(c || []);
        setQuestions((q || []).filter((x) => x.active !== false && x.status !== 'Rejected'));
        setStores(s || []);
      })
      .catch((e) => setError(e.message || 'Could not load checklists'));
  }, []);

  const choices = useMemo(() => storeChoices(stores), [stores]);
  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    return groupByProcess(term ? questions.filter((q) => q.text.toLowerCase().includes(term)) : questions);
  }, [questions, search]);

  async function openEdit(row) {
    try {
      const full = await api.checklist(row.id);
      setForm({
        id: row.id, name: row.name, is_active: row.is_active,
        format: row.conditions?.format || [], category: row.conditions?.category || [],
        question_ids: (full.questions || []).map((q) => q.id),
      });
      setSearch('');
    } catch (e) {
      toast.error(e.message || 'Could not open the checklist');
    }
  }

  async function save() {
    if (!form.name.trim()) { toast.error('Please enter a name'); return; }
    if (!form.question_ids.length) { toast.error('Pick at least one question'); return; }
    const body = {
      name: form.name.trim(), question_ids: form.question_ids, is_active: form.is_active,
      conditions: { format: form.format, category: form.category },
    };
    setSaving(true);
    try {
      const saved = form.id ? await api.updateChecklist(form.id, body) : await api.createChecklist(body);
      const list = await api.checklists();
      setRows(list);
      onChange?.(list);
      setForm(null);
      toast(form.id && saved.id !== form.id ? `Saved as version ${saved.version}` : 'Checklist saved');
    } catch (e) {
      toast.error(e.message || 'Could not save the checklist');
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!rows) return <Loading what="checklists" />;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h3 className="text-[15px] font-bold text-foreground">Checklists</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Choose the questions and which store formats or categories each checklist applies to</p>
        </div>
        <Button size="sm" onClick={() => { setForm(EMPTY); setSearch(''); }}>+ New Checklist</Button>
      </div>

      <div className="overflow-x-auto rounded-[10px] border border-border bg-card">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              {['Name', 'Version', 'Questions', 'Applies to', 'Status', ''].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5 font-semibold text-foreground">{c.name}</td>
                <td className="px-4 py-2.5">v{c.version}</td>
                <td className="px-4 py-2.5">{c.question_count}</td>
                <td className="px-4 py-2.5">{conditionsLabel(c.conditions)}</td>
                <td className="px-4 py-2.5">
                  <Badge className={c.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-muted-foreground'}>{c.is_active ? 'Active' : 'Inactive'}</Badge>
                </td>
                <td className="px-4 py-2.5 text-right"><Button size="sm" variant="outline" onClick={() => openEdit(c)}>Edit</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!form} onClose={() => !saving && setForm(null)} className="w-[720px] max-w-[95vw]">
        {form && (
          <>
            <ModalTitle>{form.id ? 'Edit Checklist' : 'New Checklist'}</ModalTitle>
            <div className="grid gap-3">
              <div>
                <label className={labelClass} htmlFor="checklist-name">Name</label>
                <Input id="checklist-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <Choices label="Store formats" hint="None ticked means every format." options={choices.formats} value={form.format} onChange={(format) => setForm({ ...form, format })} />
              <Choices label="Store categories" hint="None ticked means every category." options={choices.categories} value={form.category} onChange={(category) => setForm({ ...form, category })} />
              <label className="flex items-center gap-1.5 text-[12.5px] text-foreground">
                <input type="checkbox" checked={form.is_active} onChange={() => setForm({ ...form, is_active: !form.is_active })} /> Active (can be used for new audits)
              </label>
              <div>
                <div className={labelClass}>Questions ({form.question_ids.length} picked)</div>
                <Input className="mb-2" placeholder="Search questions" value={search} onChange={(e) => setSearch(e.target.value)} />
                <div className="max-h-[300px] overflow-y-auto rounded-md border border-border p-2">
                  {groups.map((g) => (
                    <div key={g.process} className="mb-2">
                      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{g.process}</div>
                      {g.items.map((q) => (
                        <label key={q.id} className="flex items-start gap-2 py-1 text-[12.5px] leading-snug text-foreground">
                          <input type="checkbox" className="mt-0.5" checked={form.question_ids.includes(q.id)} onChange={() => setForm({ ...form, question_ids: toggled(form.question_ids, q.id) })} />
                          {q.text}
                        </label>
                      ))}
                    </div>
                  ))}
                  {!groups.length && <div className="p-3 text-center text-xs text-muted-foreground">No questions match</div>}
                </div>
              </div>
            </div>
            <ModalActions>
              <Button variant="outline" disabled={saving} onClick={() => setForm(null)}>Cancel</Button>
              <Button disabled={saving} onClick={save}>Save</Button>
            </ModalActions>
          </>
        )}
      </Modal>
    </>
  );
}
