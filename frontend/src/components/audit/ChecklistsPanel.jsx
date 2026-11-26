import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loading, ErrorNote } from '@/components/Loader';
import { Modal, ModalActions, ModalTitle } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { conditionsLabel, groupByProcess, storeChoices, versionGroups } from '@/lib/checklists';
import { STORE_FORMATS, STORE_TYPES } from '@/lib/storeCatalog';
import { labelClass } from '@/lib/utils';

const EMPTY = {
  id: null, version: null, name: '', format: [], type: [], category: [], stores: [],
  question_ids: [], is_active: true, new_version: false, retire_previous: true,
};
const CATALOG = { formats: STORE_FORMATS.map((f) => f.code), types: STORE_TYPES.map((t) => t.code) };

function toggled(list, value) {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

function Choices({ label, hint, options, value, onChange, disabled }) {
  if (!options.length) return null;
  return (
    <div className={disabled ? 'opacity-50' : undefined}>
      <div className={labelClass}>{label}</div>
      <div className="flex flex-wrap gap-3">
        {options.map((o) => (
          <label key={o} className="flex items-center gap-1.5 text-[12.5px] text-foreground">
            <input type="checkbox" disabled={disabled} checked={value.includes(o)} onChange={() => onChange(toggled(value, o))} /> {o}
          </label>
        ))}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

// Pick named stores. When any are picked, the checklist is for exactly those stores.
function StoreChoices({ stores, value, onChange }) {
  const [term, setTerm] = useState('');
  const t = term.trim().toLowerCase();
  const shown = t ? stores.filter((s) => `${s.id} ${s.name} ${s.city || ''}`.toLowerCase().includes(t)) : stores;
  return (
    <div>
      <div className={labelClass}>Specific stores ({value.length} picked)</div>
      <Input className="mb-1.5" placeholder="Search stores" value={term} onChange={(e) => setTerm(e.target.value)} />
      <div className="max-h-[140px] overflow-y-auto rounded-md border border-border p-2">
        {shown.map((s) => (
          <label key={s.id} className="flex items-center gap-2 py-0.5 text-[12.5px] text-foreground">
            <input type="checkbox" checked={value.includes(s.id)} onChange={() => onChange(toggled(value, s.id))} />
            <span className="min-w-0 truncate">{s.name}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">{[s.format, s.type, s.city].filter(Boolean).join(' - ')}</span>
          </label>
        ))}
        {!shown.length && <div className="p-2 text-center text-xs text-muted-foreground">No stores match</div>}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {value.length ? 'Only these stores get this checklist; the format, type and category choices are ignored.' : 'None picked means the format, type and category choices decide.'}
      </div>
    </div>
  );
}

// Build and edit checklists: their questions and which stores they apply to
// (by format, store type, category, or named stores). Each change to a used
// checklist, or any edit saved as a new version, becomes the next version, and
// several versions can be in use at once, for example one per store type.
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
  const [openHistory, setOpenHistory] = useState(() => new Set());

  useEffect(() => {
    Promise.all([api.checklists(), api.questions(), api.stores()])
      .then(([c, q, s]) => {
        setRows(c || []);
        setQuestions((q || []).filter((x) => x.active !== false && x.approval_status !== 'REJECTED'));
        setStores(s || []);
      })
      .catch((e) => setError(e.message || 'Could not load checklists'));
  }, []);

  const choices = useMemo(() => storeChoices(stores, CATALOG), [stores]);
  const groups = useMemo(() => versionGroups(rows || []), [rows]);
  const questionGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    return groupByProcess(term ? questions.filter((q) => q.text.toLowerCase().includes(term)) : questions);
  }, [questions, search]);

  async function openEdit(row) {
    try {
      const full = await api.checklist(row.id);
      const c = row.conditions || {};
      setForm({
        ...EMPTY, id: row.id, version: row.version, name: row.name, is_active: row.is_active,
        format: c.format || [], type: c.type || [], category: c.category || [], stores: c.stores || [],
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
      conditions: { format: form.format, type: form.type, category: form.category, stores: form.stores },
      new_version: !!form.id && form.new_version, retire_previous: form.retire_previous,
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

  function toggleHistory(name) {
    setOpenHistory((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!rows) return <Loading what="checklists" />;

  const cell = 'px-4 py-2.5';
  const row = (c, older) => (
    <tr key={c.id} className={older ? 'border-b border-border bg-muted/30 text-muted-foreground last:border-0' : 'border-b border-border last:border-0'}>
      <td className={cell}>{older ? <span className="pl-6 text-[12px]">Earlier version</span> : null}</td>
      <td className={cell}>v{c.version}</td>
      <td className={cell}>{c.question_count}</td>
      <td className={cell}>{conditionsLabel(c.conditions, stores)}</td>
      <td className={cell}>{c.created_at ? c.created_at.slice(0, 10) : '--'}</td>
      <td className={cell}>
        <Badge className={c.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-muted-foreground'}>{c.is_active ? 'In use' : 'Retired'}</Badge>
      </td>
      <td className={`${cell} text-right`}><Button size="sm" variant="outline" onClick={() => openEdit(c)}>Edit</Button></td>
    </tr>
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h3 className="text-[15px] font-bold text-foreground">Checklists</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Choose the questions and which stores each checklist version is for: by format, store type, category or named stores</p>
        </div>
        <Button size="sm" onClick={() => { setForm(EMPTY); setSearch(''); }}>+ New Checklist</Button>
      </div>

      <div className="overflow-x-auto rounded-[10px] border border-border bg-card">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              {['Name', 'Version', 'Questions', 'Assigned to', 'Created', 'Status', ''].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const [latest, ...older] = g.versions;
              const open = openHistory.has(g.name);
              const inUse = g.versions.filter((v) => v.is_active).length;
              return (
                <Fragment key={g.name}>
                  <tr className="border-b border-border last:border-0">
                    <td className={cell}>
                      <div className="flex items-center gap-1.5">
                        {older.length ? (
                          <button type="button" className="text-muted-foreground" onClick={() => toggleHistory(g.name)} aria-expanded={open} aria-label={open ? 'Hide earlier versions' : 'Show earlier versions'}>
                            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          </button>
                        ) : <span className="inline-block w-4" />}
                        <span className="font-semibold text-foreground">{g.name}</span>
                      </div>
                      {g.versions.length > 1 && (
                        <div className="pl-[22px] text-[11px] text-muted-foreground">{g.versions.length} versions, {inUse} in use</div>
                      )}
                    </td>
                    <td className={cell}>v{latest.version}</td>
                    <td className={cell}>{latest.question_count}</td>
                    <td className={cell}>{conditionsLabel(latest.conditions, stores)}</td>
                    <td className={cell}>{latest.created_at ? latest.created_at.slice(0, 10) : '--'}</td>
                    <td className={cell}>
                      <Badge className={latest.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-muted-foreground'}>{latest.is_active ? 'In use' : 'Retired'}</Badge>
                    </td>
                    <td className={`${cell} text-right`}><Button size="sm" variant="outline" onClick={() => openEdit(latest)}>Edit</Button></td>
                  </tr>
                  {open && older.map((c) => row(c, true))}
                </Fragment>
              );
            })}
            {!groups.length && <tr><td colSpan={7} className="p-6 text-center text-xs text-muted-foreground">No checklists yet</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={!!form} onClose={() => !saving && setForm(null)} className="w-[760px] max-w-[95vw]">
        {form && (
          <>
            <ModalTitle>{form.id ? `Edit Checklist (v${form.version})` : 'New Checklist'}</ModalTitle>
            <div className="grid gap-3">
              <div>
                <label className={labelClass} htmlFor="checklist-name">Name</label>
                <Input id="checklist-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="mb-2 text-[12px] font-semibold text-foreground">Assign to stores</div>
                <div className="grid gap-3">
                  <Choices label="Store types" hint="None ticked means every type." options={choices.types} value={form.type} disabled={form.stores.length > 0} onChange={(type) => setForm({ ...form, type })} />
                  <Choices label="Store formats" hint="None ticked means every format." options={choices.formats} value={form.format} disabled={form.stores.length > 0} onChange={(format) => setForm({ ...form, format })} />
                  {/* Store type replaces category for assigning; category is only shown for checklists that already use it. */}
                  {form.category.length > 0 && (
                    <Choices label="Store categories" hint="None ticked means every category." options={choices.categories} value={form.category} disabled={form.stores.length > 0} onChange={(category) => setForm({ ...form, category })} />
                  )}
                  <StoreChoices stores={stores} value={form.stores} onChange={(ids) => setForm({ ...form, stores: ids })} />
                </div>
              </div>
              <label className="flex items-center gap-1.5 text-[12.5px] text-foreground">
                <input type="checkbox" checked={form.is_active} onChange={() => setForm({ ...form, is_active: !form.is_active })} /> In use (can be picked for new audits)
              </label>
              {form.id && (
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <label className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
                    <input type="checkbox" checked={form.new_version} onChange={() => setForm({ ...form, new_version: !form.new_version })} /> Save as the next version
                  </label>
                  {form.new_version && (
                    <label className="mt-1.5 flex items-center gap-1.5 pl-5 text-[12.5px] text-foreground">
                      <input type="checkbox" checked={!form.retire_previous} onChange={() => setForm({ ...form, retire_previous: !form.retire_previous })} /> Keep v{form.version} in use as well (for example for other store types)
                    </label>
                  )}
                  <p className="mt-1.5 text-[11px] text-muted-foreground">A checklist already used by an audit always becomes a new version when its questions change, so finished audits keep what was asked.</p>
                </div>
              )}
              <div>
                <div className={labelClass}>Questions ({form.question_ids.length} picked)</div>
                <Input className="mb-2" placeholder="Search questions" value={search} onChange={(e) => setSearch(e.target.value)} />
                <div className="max-h-[300px] overflow-y-auto rounded-md border border-border p-2">
                  {questionGroups.map((g) => (
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
                  {!questionGroups.length && <div className="p-3 text-center text-xs text-muted-foreground">No questions match</div>}
                </div>
              </div>
            </div>
            <ModalActions>
              <Button variant="outline" disabled={saving} onClick={() => setForm(null)}>Cancel</Button>
              <Button disabled={saving} onClick={save}>{form.id && form.new_version ? 'Save new version' : 'Save'}</Button>
            </ModalActions>
          </>
        )}
      </Modal>
    </>
  );
}
