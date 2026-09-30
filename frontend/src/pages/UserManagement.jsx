import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useToast } from '../components/Toast';

const ROLES = [
  { value: 'AUDIT_MANAGER', label: 'Audit Manager' },
  { value: 'AUDITOR',       label: 'Auditor' },
  { value: 'STORE_MANAGER', label: 'Store Manager' },
];

const ROLE_LABEL = {
  ADMIN:         'Admin',
  AUDIT_MANAGER: 'Audit Manager',
  AUDITOR:       'Auditor',
  STORE_MANAGER: 'Store Manager',
};

const ROLE_COLOR = {
  ADMIN:         'bg-purple-100 text-purple-700',
  AUDIT_MANAGER: 'bg-blue-100 text-blue-700',
  AUDITOR:       'bg-amber-100 text-amber-700',
  STORE_MANAGER: 'bg-emerald-100 text-emerald-700',
};

const EMPTY_FORM = {
  name: '', email: '', password: '', role: 'AUDITOR',
  designation: '', region: '', store_id: '',
};

export default function UserManagement() {
  const { showToast } = useToast();
  const [users, setUsers]     = useState([]);
  const [stores, setStores]   = useState([]);
  const [filter, setFilter]   = useState('ALL');
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser]   = useState(null);   // null = create
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const firstRef = useRef(null);

  async function load() {
    setLoading(true);
    try {
      const [u, s] = await Promise.all([api.listUsers(), api.stores()]);
      setUsers(u);
      setStores(s);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { if (modalOpen) firstRef.current?.focus(); }, [modalOpen]);

  const filtered = filter === 'ALL' ? users : users.filter(u => u.role === filter);

  const counts = {
    total: users.length,
    am:    users.filter(u => u.role === 'AUDIT_MANAGER').length,
    aud:   users.filter(u => u.role === 'AUDITOR').length,
    sm:    users.filter(u => u.role === 'STORE_MANAGER').length,
  };

  function openCreate() {
    setEditUser(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(u) {
    setEditUser(u);
    setForm({
      name: u.name, email: u.email, password: '',
      role: u.role, designation: u.designation || '',
      region: u.region || '', store_id: u.store_id || '',
    });
    setModalOpen(true);
  }

  function closeModal() { setModalOpen(false); setEditUser(null); }

  async function save() {
    if (!form.name.trim() || !form.email.trim()) {
      return showToast('Name and email are required', 'error');
    }
    if (!editUser && !form.password) {
      return showToast('Password is required for new users', 'error');
    }
    setSaving(true);
    try {
      const body = { ...form };
      if (!body.password) delete body.password;
      if (!body.store_id) delete body.store_id;
      if (editUser) {
        await api.updateUser(editUser.id, body);
        showToast('User updated');
      } else {
        await api.createUser(body);
        showToast('User created');
      }
      closeModal();
      load();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u) {
    try {
      await api.updateUser(u.id, { active: !u.active });
      showToast(u.active ? 'User deactivated' : 'User activated');
      load();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  const FILTERS = [
    { key: 'ALL',           label: 'All' },
    { key: 'AUDIT_MANAGER', label: 'Audit Manager' },
    { key: 'AUDITOR',       label: 'Auditor' },
    { key: 'STORE_MANAGER', label: 'Store Manager' },
  ];

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Users',     value: counts.total,  color: 'text-foreground' },
          { label: 'Audit Managers',  value: counts.am,     color: 'text-blue-600' },
          { label: 'Auditors',        value: counts.aud,    color: 'text-amber-600' },
          { label: 'Store Managers',  value: counts.sm,     color: 'text-emerald-600' },
        ].map(c => (
          <div key={c.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
                filter === f.key
                  ? 'bg-primary text-white'
                  : 'border border-border bg-card text-foreground hover:bg-muted/50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-[12.5px] font-medium text-white hover:opacity-90"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add User
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {['Name', 'Email', 'Role', 'Region / Store', 'Status', 'Actions'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left font-semibold text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">No users found</td></tr>
            ) : filtered.map(u => (
              <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                <td className="px-4 py-2.5 font-medium text-foreground">{u.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ROLE_COLOR[u.role] || 'bg-muted text-foreground'}`}>
                    {ROLE_LABEL[u.role] || u.role}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {u.role === 'STORE_MANAGER'
                    ? (u.store_name || <span className="italic text-muted-foreground/60">No store</span>)
                    : (u.region || '—')}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${u.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                    {u.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEdit(u)}
                      className="text-[11px] text-primary hover:underline font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleActive(u)}
                      className={`text-[11px] font-medium hover:underline ${u.active ? 'text-red-500' : 'text-emerald-600'}`}
                    >
                      {u.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl mx-4">
            <h2 className="mb-4 text-[15px] font-semibold text-foreground">
              {editUser ? 'Edit User' : 'Add User'}
            </h2>

            <div className="space-y-3">
              {[
                { label: 'Name *',        key: 'name',        type: 'text',     placeholder: 'Full name' },
                { label: 'Email *',       key: 'email',       type: 'email',    placeholder: 'user@example.com' },
                { label: editUser ? 'New Password' : 'Password *', key: 'password', type: 'password', placeholder: editUser ? 'Leave blank to keep' : 'Min 6 characters' },
                { label: 'Designation',   key: 'designation', type: 'text',     placeholder: 'e.g. Field Auditor' },
                { label: 'Region',        key: 'region',      type: 'text',     placeholder: 'e.g. North India' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</label>
                  <input
                    ref={key === 'name' ? firstRef : undefined}
                    type={type}
                    value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[12.5px] text-foreground outline-none focus:border-primary"
                  />
                </div>
              ))}

              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Role *</label>
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value, store_id: '' }))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[12.5px] text-foreground outline-none focus:border-primary"
                >
                  {ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              {form.role === 'STORE_MANAGER' && (
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Assign Store</label>
                  <select
                    value={form.store_id}
                    onChange={e => setForm(f => ({ ...f, store_id: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[12.5px] text-foreground outline-none focus:border-primary"
                  >
                    <option value="">— No store —</option>
                    {stores.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.city})</option>
                    ))}
                  </select>
                </div>
              )}

              {editUser && (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <span className="text-[12px] text-foreground flex-1">Account active</span>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, active: !(f.active ?? editUser.active) }))}
                    className={`relative h-5 w-9 rounded-full transition-colors ${
                      (form.active ?? editUser.active) ? 'bg-primary' : 'bg-muted-foreground/30'
                    }`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      (form.active ?? editUser.active) ? 'translate-x-4' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={closeModal}
                className="rounded-lg border border-border px-4 py-2 text-[12.5px] font-medium text-foreground hover:bg-muted/50"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="rounded-lg bg-primary px-4 py-2 text-[12.5px] font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Saving…' : editUser ? 'Update' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
