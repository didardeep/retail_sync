import { useState, useEffect } from 'react';
import { useToast } from '../components/Toast';
import { api } from '../api/client';
import { avC, sBadge } from '../utils/helpers';
import { cn, fieldClass, labelClass } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Modal, ModalActions, Drawer } from '../components/Modal';

const AUDITORS = ['Rohit Sharma','Meera Patel','Sara Khan','Amit Singh','Priya Das'];
const PER_PAGE = 8;

function normalizeAudit(a) {
  const dt = a.scheduled_at ? new Date(a.scheduled_at) : new Date();
  return {
    id: a.id || a.audit_id,
    type: a.checklist || a.type || 'Store Audit',
    region: a.region || 'North India',
    auditor: a.auditor_name || a.auditor || '',
    role: a.auditor_name || a.auditor ? 'Field Auditor' : '',
    date: dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}),
    time: dt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}),
    status: a.status || 'Scheduled',
    prog: a.status === 'Completed' ? 100 : a.status === 'Assigned' ? 40 : a.status === 'In Progress' ? 65 : 0,
    store: a.store || '',
    storeSub: a.region || 'Region',
    notes: a.notes || '',
  };
}

export default function Scheduling() {
  const toast = useToast();
  const [data, setData] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [regionF, setRegionF] = useState('');
  const [statusF, setStatusF] = useState('');
  const [page, setPage] = useState(1);
  // drawer
  const [drawerId, setDrawerId] = useState(null);
  // modal
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({title:'',store:'',dt:'',auditor:'',status:'Scheduled',notes:''});

  useEffect(() => {
    Promise.all([
      api.audits().catch(() => []),
      api.stores().catch(() => []),
    ]).then(([audits, st]) => {
      setData((audits || []).map(normalizeAudit));
      setStores(st || []);
      setLoading(false);
    });
  }, []);

  const filtered = data.filter(s => {
    if (search && !s.type.toLowerCase().includes(search.toLowerCase()) && !s.region.toLowerCase().includes(search.toLowerCase()) && !s.store.toLowerCase().includes(search.toLowerCase())) return false;
    if (regionF && s.region !== regionF) return false;
    if (statusF && s.status !== statusF) return false;
    return true;
  });

  const pages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE);

  const total = data.length;
  const scheduled = data.filter(s => s.status === 'Scheduled').length;
  const assigned = data.filter(s => s.status === 'Assigned').length;
  const completed = data.filter(s => s.status === 'Completed').length;
  const pending = data.filter(s => !s.auditor).length;

  const drawerItem = drawerId ? data.find(s => s.id === drawerId) : null;

  function openAdd() {
    setEditId(null);
    setForm({title:'',store:'',dt:'',auditor:'',status:'Scheduled',notes:''});
    setModal(true);
  }

  function openEdit(s) {
    setEditId(s.id);
    setForm({title:s.type,store:s.store,dt:'',auditor:s.auditor,status:s.status,notes:s.notes||''});
    setModal(true);
    setDrawerId(null);
  }

  function save() {
    if (!form.title || !form.store) return;
    if (editId) {
      setData(prev => prev.map(s => s.id === editId ? {...s, type:form.title, store:form.store, auditor:form.auditor, status:form.status, notes:form.notes, prog:form.status==='Completed'?100:s.prog} : s));
      toast('Schedule updated');
    } else {
      const id = 'SCH' + String(data.length+1).padStart(3,'0');
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
      const timeStr = now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
      // Also schedule via API
      api.scheduleAudit({
        store: form.store,
        checklist: form.title,
        scheduled_at: form.dt || new Date().toISOString(),
      }).catch(() => {});
      setData(prev => [...prev, {id,type:form.title,region:'North India',auditor:form.auditor,role:form.auditor?'Field Auditor':'',date:dateStr,time:timeStr,status:form.status,prog:0,store:form.store,storeSub:'Region',notes:form.notes}]);
      toast('Audit scheduled');
    }
    setModal(false);
  }

  function del(id) {
    if (!confirm('Delete this schedule?')) return;
    setData(prev => prev.filter(s => s.id !== id));
    setDrawerId(null);
    toast('Schedule deleted');
  }

  function progColor(s) {
    if (s.status === 'Completed') return 'bg-emerald-500';
    if (s.status === 'Assigned') return 'bg-primary';
    return 'bg-amber-500';
  }

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground">Loading schedules...</div>;
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-5 gap-3">
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4"><div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{background:'#e8eefa'}}>&#x1F550;</div><div><div className="mb-0.5 text-[11px] text-muted-foreground">Total Audits</div><div className="text-2xl font-bold leading-none text-foreground">{total}</div></div></div>
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4"><div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{background:'#e8eefa'}}>&#x1F4C5;</div><div><div className="mb-0.5 text-[11px] text-muted-foreground">Scheduled</div><div className="text-2xl font-bold leading-none text-foreground">{scheduled}</div></div></div>
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4"><div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{background:'#fffbeb'}}>&#x1F464;</div><div><div className="mb-0.5 text-[11px] text-muted-foreground">Assigned</div><div className="text-2xl font-bold leading-none text-foreground">{assigned}</div></div></div>
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4"><div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{background:'#ecfdf5'}}>&#x2705;</div><div><div className="mb-0.5 text-[11px] text-muted-foreground">Completed</div><div className="text-2xl font-bold leading-none text-foreground">{completed}</div></div></div>
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4"><div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{background:'#fde8e8'}}>&#x23F0;</div><div><div className="mb-0.5 text-[11px] text-muted-foreground">Pending Assignment</div><div className="text-2xl font-bold leading-none text-foreground">{pending}</div></div></div>
      </div>

      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">&#x1F50D;</span><Input className="pl-8" placeholder="Search audit or store..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></div>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={regionF} onChange={e=>{setRegionF(e.target.value);setPage(1);}}>
          <option value="">Region</option>
          <option>North India</option><option>South India</option><option>East India</option><option>West India</option>
        </select>
        <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={statusF} onChange={e=>{setStatusF(e.target.value);setPage(1);}}>
          <option value="">Status</option>
          <option>Scheduled</option><option>Assigned</option><option>Completed</option>
        </select>
        <Button size="sm" onClick={openAdd}>+ Schedule Audit</Button>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Audit Detail</TableHead><TableHead>Schedule</TableHead><TableHead>Auditor</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {paged.map(s => (
              <TableRow key={s.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-base">&#x1F4CB;</span>
                    <div>
                      <div className="text-[12.5px] font-semibold">{s.type}</div>
                      <div className="text-[11px] text-muted-foreground">{s.region}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-[12.5px] font-semibold">{s.date}</div>
                  <div className="text-[11px] text-muted-foreground">{s.time}</div>
                </TableCell>
                <TableCell>
                  {s.auditor ? (
                    <div className="flex items-center gap-1.5">
                      <div className={cn('flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white', avC(s.auditor))}>{s.auditor[0]}</div>
                      <div>
                        <div className="text-[12.5px] font-semibold">{s.auditor}</div>
                        <div className="text-[11px] text-muted-foreground">{s.role}</div>
                      </div>
                    </div>
                  ) : <Badge className="bg-muted text-muted-foreground border border-border">Unassigned</Badge>}
                </TableCell>
                <TableCell>
                  <Badge className={sBadge(s.status)}>{s.status}</Badge>
                  <div className="mt-1.5 h-[5px] overflow-hidden rounded-[3px] bg-gray-200">
                    <div className={cn('h-full rounded-[3px]', progColor(s))} style={{width:`${s.prog}%`}}/>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <button className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-border bg-card text-[11px]" onClick={()=>setDrawerId(s.id)} title="View">&#x1F441;</button>
                    <button className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-border bg-card text-[11px]" onClick={()=>openEdit(s)} title="Edit">&#x270F;&#xFE0F;</button>
                    <button className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-border bg-card text-[11px]" onClick={()=>del(s.id)} title="Delete">&#x1F5D1;&#xFE0F;</button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-3 flex items-center justify-end gap-1 text-xs text-muted-foreground">
        <span className="mr-2">{filtered.length} audits</span>
        {Array.from({length:pages},(_,i)=>(
          <button key={i} className={cn('flex h-[27px] w-[27px] items-center justify-center rounded-md border border-border bg-card text-xs text-foreground/80', page===i+1 && 'border-primary bg-primary text-primary-foreground')} onClick={()=>setPage(i+1)}>{i+1}</button>
        ))}
      </div>

      {/* Drawer */}
      <Drawer open={!!drawerItem} onClose={()=>setDrawerId(null)}>
        {drawerItem && <>
          <div className="mb-1 flex items-center justify-between">
            <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Audit Reference</div>
            <span className="cursor-pointer text-[15px] text-muted-foreground" onClick={()=>setDrawerId(null)}>&#x2715;</span>
          </div>
          <div className="mb-4.5 flex items-center justify-between">
            <div className="text-base font-bold text-foreground">{drawerItem.id}</div>
            <Badge className={sBadge(drawerItem.status)}>{drawerItem.status}</Badge>
          </div>
          <div className="mb-4 text-[13px] font-semibold text-foreground">{drawerItem.type}</div>

          <div className="mb-4 flex items-start gap-2.5">
            <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md bg-accent text-[13px]">&#x1F4CD;</div>
            <div><div className="mb-0.5 text-[10.5px] uppercase tracking-wide text-muted-foreground">Store Location</div><div className="text-[12.5px] font-semibold text-foreground">{drawerItem.store}</div><div className="text-[11.5px] text-muted-foreground">{drawerItem.storeSub}</div></div>
          </div>
          <div className="mb-4 flex items-start gap-2.5">
            <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md bg-accent text-[13px]">&#x1F4C5;</div>
            <div><div className="mb-0.5 text-[10.5px] uppercase tracking-wide text-muted-foreground">Scheduled Execution</div><div className="text-[12.5px] font-semibold text-foreground">{drawerItem.date}</div><div className="text-[11.5px] text-muted-foreground">{drawerItem.time}</div></div>
          </div>

          <div className="mb-2 text-[10.5px] uppercase tracking-wide text-muted-foreground">Assigned Personnel</div>
          {drawerItem.auditor ? (
            <div className="mb-4.5 flex items-center gap-2">
              <div className={cn('flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white', avC(drawerItem.auditor))}>{drawerItem.auditor[0]}</div>
              <div><div className="text-[12.5px] font-semibold">{drawerItem.auditor}</div><div className="text-[11px] text-muted-foreground">{drawerItem.role}</div></div>
            </div>
          ) : <div className="mb-4.5"><Badge className="bg-muted text-muted-foreground border border-border">Unassigned</Badge></div>}

          <div className="mb-1.5 text-[10.5px] uppercase tracking-wide text-muted-foreground">Completion Progress</div>
          <div className="mb-4.5 h-1.5 overflow-hidden rounded-[3px] bg-gray-200"><div className={cn('h-full rounded-[3px]', progColor(drawerItem))} style={{width:`${drawerItem.prog}%`}}/></div>

          <div className="mb-1.5 text-[10.5px] uppercase tracking-wide text-muted-foreground">Audit Notes &amp; Objectives</div>
          <textarea value={drawerItem.notes||''} readOnly rows={3} className="mb-5 w-full rounded-lg border border-border px-2.5 py-2 font-[inherit] text-[12.5px] text-foreground/80 resize-y"/>

          <div className="flex gap-2">
            <Button className="flex-1" onClick={()=>openEdit(drawerItem)}>&#x270E; Edit Audit</Button>
            <Button variant="outline" className="border-red-200 text-destructive" onClick={()=>del(drawerItem.id)}>&#x1F5D1; Delete</Button>
          </div>
        </>}
      </Drawer>

      {/* Modal */}
      <Modal open={modal} onClose={()=>setModal(false)} className="w-[620px]">
        <div className="mb-4 text-[15px] font-bold text-foreground">{editId ? 'Edit Audit' : 'Schedule New Audit'}</div>
        <div className="grid gap-3">
          <div><label className={labelClass}>Audit Title <span className="text-destructive">*</span></label><Input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Q3 Compliance Audit"/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelClass}>Store <span className="text-destructive">*</span></label>
              <select className={fieldClass} value={form.store} onChange={e=>setForm({...form,store:e.target.value})}>
                <option value="">Select store</option>
                {stores.map(s=><option key={s.id} value={`${s.name} – Retail`}>{s.name} – {s.city}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Date &amp; Time <span className="text-destructive">*</span></label><Input type="datetime-local" value={form.dt} onChange={e=>setForm({...form,dt:e.target.value})}/></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelClass}>Auditor</label>
              <select className={fieldClass} value={form.auditor} onChange={e=>setForm({...form,auditor:e.target.value})}>
                <option value="">Unassigned</option>
                {AUDITORS.map(a=><option key={a}>{a}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Status</label>
              <select className={fieldClass} value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
                <option>Scheduled</option><option>Assigned</option><option>In Progress</option><option>Completed</option>
              </select>
            </div>
          </div>
          <div><label className={labelClass}>Notes</label><textarea className={cn(fieldClass, 'min-h-[90px] resize-y')} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Add any relevant notes..."/></div>
        </div>
        <ModalActions>
          <Button variant="outline" onClick={()=>setModal(false)}>Cancel</Button>
          <Button onClick={save}>{editId ? 'Save Changes' : 'Schedule'}</Button>
        </ModalActions>
      </Modal>
    </>
  );
}
