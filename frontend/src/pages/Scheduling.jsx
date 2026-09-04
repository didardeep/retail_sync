import { useState } from 'react';
import { useToast } from '../components/Toast';
import { mockSchedules, mockStores } from '../data/mockData';
import { avC, sBadge } from '../utils/helpers';

const AUDITORS = ['Rohit Sharma','Meera Patel','Sara Khan','Amit Singh','Priya Das'];
const PER_PAGE = 8;

export default function Scheduling() {
  const toast = useToast();
  const [data, setData] = useState(() => mockSchedules.map(s => ({...s})));
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
    if (s.status === 'Completed') return 'pg';
    if (s.status === 'Assigned') return 'pb';
    return 'po';
  }

  return (
    <>
      <div className="kpi-row c5">
        <div className="kpi"><div className="kpi-ico" style={{background:'#e8eefa'}}>&#x1F550;</div><div><div className="kpi-lbl">Total Audits</div><div className="kpi-val">{total}</div></div></div>
        <div className="kpi"><div className="kpi-ico" style={{background:'#e8eefa'}}>&#x1F4C5;</div><div><div className="kpi-lbl">Scheduled</div><div className="kpi-val">{scheduled}</div></div></div>
        <div className="kpi"><div className="kpi-ico" style={{background:'#fffbeb'}}>&#x1F464;</div><div><div className="kpi-lbl">Assigned</div><div className="kpi-val">{assigned}</div></div></div>
        <div className="kpi"><div className="kpi-ico" style={{background:'#ecfdf5'}}>&#x2705;</div><div><div className="kpi-lbl">Completed</div><div className="kpi-val">{completed}</div></div></div>
        <div className="kpi"><div className="kpi-ico" style={{background:'#fde8e8'}}>&#x23F0;</div><div><div className="kpi-lbl">Pending Assignment</div><div className="kpi-val">{pending}</div></div></div>
      </div>

      <div className="filter-bar">
        <div className="srch"><span className="srch-ic">&#x1F50D;</span><input placeholder="Search audit or store..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></div>
        <select className="sel" value={regionF} onChange={e=>{setRegionF(e.target.value);setPage(1);}}>
          <option value="">Region</option>
          <option>North India</option><option>South India</option><option>East India</option><option>West India</option>
        </select>
        <select className="sel" value={statusF} onChange={e=>{setStatusF(e.target.value);setPage(1);}}>
          <option value="">Status</option>
          <option>Scheduled</option><option>Assigned</option><option>Completed</option>
        </select>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Schedule Audit</button>
      </div>

      <div className="tbl-card">
        <table>
          <thead><tr><th>Audit Detail</th><th>Schedule</th><th>Auditor</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {paged.map(s => (
              <tr key={s.id}>
                <td>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontSize:16}}>&#x1F4CB;</span>
                    <div>
                      <div style={{fontWeight:600,fontSize:'12.5px'}}>{s.type}</div>
                      <div style={{fontSize:11,color:'var(--text3)'}}>{s.region}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div style={{fontWeight:600,fontSize:'12.5px'}}>{s.date}</div>
                  <div style={{fontSize:11,color:'var(--text3)'}}>{s.time}</div>
                </td>
                <td>
                  {s.auditor ? (
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <div className={`av ${avC(s.auditor)}`}>{s.auditor[0]}</div>
                      <div>
                        <div style={{fontWeight:600,fontSize:'12.5px'}}>{s.auditor}</div>
                        <div style={{fontSize:11,color:'var(--text3)'}}>{s.role}</div>
                      </div>
                    </div>
                  ) : <span className="badge bgr">Unassigned</span>}
                </td>
                <td>
                  <span className={`badge ${sBadge(s.status)}`}>{s.status}</span>
                  <div className="prog-bg" style={{marginTop:6,height:5}}>
                    <div className={`prog-fill ${progColor(s)}`} style={{width:`${s.prog}%`,height:5}}/>
                  </div>
                </td>
                <td>
                  <div style={{display:'flex',gap:4}}>
                    <button className="icon-btn" style={{width:26,height:26,fontSize:11}} onClick={()=>setDrawerId(s.id)} title="View">&#x1F441;</button>
                    <button className="icon-btn" style={{width:26,height:26,fontSize:11}} onClick={()=>openEdit(s)} title="Edit">&#x270F;&#xFE0F;</button>
                    <button className="icon-btn" style={{width:26,height:26,fontSize:11}} onClick={()=>del(s.id)} title="Delete">&#x1F5D1;&#xFE0F;</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <span style={{marginRight:8}}>{filtered.length} audits</span>
        {Array.from({length:pages},(_,i)=>(
          <button key={i} className={`pgbtn${page===i+1?' active':''}`} onClick={()=>setPage(i+1)}>{i+1}</button>
        ))}
      </div>

      {/* Drawer */}
      <div className={`drawer-ov${drawerItem?' open':''}`} onClick={e=>{if(e.target===e.currentTarget)setDrawerId(null);}}>
        <div className="drawer">
          {drawerItem && <>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
              <div style={{fontSize:'10.5px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em'}}>Audit Reference</div>
              <span style={{cursor:'pointer',color:'var(--text3)',fontSize:15}} onClick={()=>setDrawerId(null)}>&#x2715;</span>
            </div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
              <div style={{fontSize:16,fontWeight:700,color:'var(--text)'}}>{drawerItem.id}</div>
              <span className={`badge ${sBadge(drawerItem.status)}`}>{drawerItem.status}</span>
            </div>
            <div style={{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:16}}>{drawerItem.type}</div>

            <div className="drawer-row">
              <div className="drawer-ic">&#x1F4CD;</div>
              <div><div className="drawer-lbl">Store Location</div><div className="drawer-val">{drawerItem.store}</div><div className="drawer-sub">{drawerItem.storeSub}</div></div>
            </div>
            <div className="drawer-row">
              <div className="drawer-ic">&#x1F4C5;</div>
              <div><div className="drawer-lbl">Scheduled Execution</div><div className="drawer-val">{drawerItem.date}</div><div className="drawer-sub">{drawerItem.time}</div></div>
            </div>

            <div className="drawer-lbl" style={{marginBottom:8}}>Assigned Personnel</div>
            {drawerItem.auditor ? (
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:18}}>
                <div className={`av ${avC(drawerItem.auditor)}`}>{drawerItem.auditor[0]}</div>
                <div><div style={{fontWeight:600,fontSize:'12.5px'}}>{drawerItem.auditor}</div><div style={{fontSize:11,color:'var(--text3)'}}>{drawerItem.role}</div></div>
              </div>
            ) : <div style={{marginBottom:18}}><span className="badge bgr">Unassigned</span></div>}

            <div className="drawer-lbl" style={{marginBottom:6}}>Completion Progress</div>
            <div className="prog-bg" style={{marginBottom:18}}><div className={`prog-fill ${progColor(drawerItem)}`} style={{width:`${drawerItem.prog}%`,height:6}}/></div>

            <div className="drawer-lbl" style={{marginBottom:6}}>Audit Notes &amp; Objectives</div>
            <textarea value={drawerItem.notes||''} readOnly rows={3} style={{width:'100%',border:'1px solid var(--border)',borderRadius:8,padding:'8px 10px',fontSize:'12.5px',color:'var(--text2)',resize:'vertical',fontFamily:'inherit',marginBottom:20}}/>

            <div style={{display:'flex',gap:8}}>
              <button className="btn btn-primary" style={{flex:1}} onClick={()=>openEdit(drawerItem)}>&#x270E; Edit Audit</button>
              <button className="btn btn-outline" style={{color:'var(--red)',borderColor:'var(--red-soft)'}} onClick={()=>del(drawerItem.id)}>&#x1F5D1; Delete</button>
            </div>
          </>}
        </div>
      </div>

      {/* Modal */}
      <div className={`modal-ov${modal?' open':''}`} onClick={e=>{if(e.target===e.currentTarget)setModal(false);}}>
        <div className="modal" style={{width:620}}>
          <div className="modal-title">{editId ? 'Edit Audit' : 'Schedule New Audit'}</div>
          <div className="modal-grid">
            <div className="fg"><label className="fl">Audit Title <span style={{color:'var(--red)'}}>*</span></label><input className="fi" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Q3 Compliance Audit"/></div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div className="fg"><label className="fl">Store <span style={{color:'var(--red)'}}>*</span></label>
                <select className="fs" value={form.store} onChange={e=>setForm({...form,store:e.target.value})}>
                  <option value="">Select store</option>
                  {mockStores.map(s=><option key={s.id} value={`${s.name} \u2013 Retail`}>{s.name} \u2013 {s.city}</option>)}
                </select>
              </div>
              <div className="fg"><label className="fl">Date &amp; Time <span style={{color:'var(--red)'}}>*</span></label><input type="datetime-local" className="fi" value={form.dt} onChange={e=>setForm({...form,dt:e.target.value})}/></div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div className="fg"><label className="fl">Auditor</label>
                <select className="fs" value={form.auditor} onChange={e=>setForm({...form,auditor:e.target.value})}>
                  <option value="">Unassigned</option>
                  {AUDITORS.map(a=><option key={a}>{a}</option>)}
                </select>
              </div>
              <div className="fg"><label className="fl">Status</label>
                <select className="fs" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
                  <option>Scheduled</option><option>Assigned</option><option>In Progress</option><option>Completed</option>
                </select>
              </div>
            </div>
            <div className="fg"><label className="fl">Notes</label><textarea className="fta" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Add any relevant notes..." style={{minHeight:90}}/></div>
          </div>
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={()=>setModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>{editId ? 'Save Changes' : 'Schedule'}</button>
          </div>
        </div>
      </div>
    </>
  );
}
