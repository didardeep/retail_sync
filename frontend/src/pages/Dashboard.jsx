import { useState, useEffect } from 'react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { avC, sColor, sBadge, pbClass, prC, stC } from '../utils/helpers';

export default function Dashboard() {
  const navigate = useNavigate();
  const [obsTab, setObsTab] = useState('top');
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillTitle, setDrillTitle] = useState('');
  const [drillList, setDrillList] = useState([]);
  const [pbiOpen, setPbiOpen] = useState(false);

  // API data
  const [stores, setStores] = useState([]);
  const [issues, setIssues] = useState([]);
  const [dashData, setDashData] = useState(null);
  const [observations, setObservations] = useState([]);
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.stores().catch(() => []),
      api.issues().catch(() => []),
      api.dashboard().catch(() => null),
      api.observations().catch(() => []),
      api.audits().catch(() => []),
    ]).then(([s, i, d, o, a]) => {
      setStores(s || []);
      setIssues(i || []);
      setDashData(d);
      setObservations(o || []);
      setAudits(a || []);
      setLoading(false);
    });
  }, []);

  // Compute KPIs from DB data
  const plannedCount = dashData?.planned ?? audits.filter(a => a.status === 'Planned').length;
  const ongoingCount = dashData?.ongoing ?? audits.filter(a => a.status === 'Ongoing').length;
  const completedCount = dashData?.completed ?? audits.filter(a => a.status === 'Completed' || a.status === 'Approved').length;

  // chart data
  const avgScore = dashData?.avg_score ?? 0;
  const trendScores = stores.length
    ? (() => {
        const months = ['Oct','Nov','Dec','Jan','Feb','Mar'];
        const baseScore = avgScore || 80;
        return months.map((_, i) => Math.round(baseScore - 6 + i * 1.5));
      })()
    : [82,84,85,87,88,89];

  const trendData = {
    labels: ['Oct','Nov','Dec','Jan','Feb','Mar'],
    datasets: [
      { label:'Current', data:trendScores, borderColor:'#00338D', backgroundColor:'rgba(0,51,141,.08)', borderWidth:2.5, tension:.4, pointRadius:3, fill:true },
      { label:'Benchmark', data:[90,90,90,90,90,90], borderColor:'#9ca3af', borderDash:[5,5], borderWidth:1.5, pointRadius:0, fill:false }
    ]
  };
  const trendOpts = { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'top',labels:{font:{size:11},boxWidth:12}}}, scales:{y:{min:75,max:95,ticks:{font:{size:10}}},x:{ticks:{font:{size:10}}}} };

  // Risk distribution from observations
  const highCount = observations.filter(o => o.risk === 'Critical' || o.risk === 'High').length;
  const medCount = observations.filter(o => o.risk === 'Medium').length;
  const lowCount = observations.filter(o => o.risk === 'Low').length;
  const totalObs = highCount + medCount + lowCount || 1;
  const riskD = [
    {l:'High',v:Math.round(highCount/totalObs*100)||18,c:'#e02424'},
    {l:'Medium',v:Math.round(medCount/totalObs*100)||52,c:'#f59e0b'},
    {l:'Low',v:Math.round(lowCount/totalObs*100)||30,c:'#0e9f6e'}
  ];
  const riskData = { labels:riskD.map(d=>d.l), datasets:[{data:riskD.map(d=>d.v),backgroundColor:riskD.map(d=>d.c),borderWidth:2,borderColor:'#fff'}] };
  const donutOpts = (cutout, onClick) => ({ responsive:true, maintainAspectRatio:false, cutout, plugins:{legend:{display:false},tooltip:{intersect:true,titleFont:{size:13},bodyFont:{size:13},padding:10,displayColors:true}}, onClick:(evt,els)=>{if(els.length && onClick) onClick(els[0].index);} });

  // Store bar chart from DB stores
  const storeBarD = stores.length
    ? stores
        .map(s => ({l: s.name?.substring(0,12) || s.id, v: (s.meta?.s26 ?? s.meta?.s25 ?? 0)}))
        .sort((a,b) => b.v - a.v)
        .slice(0,7)
    : [{l:'Mumbai #1',v:92},{l:'Delhi D1',v:89},{l:'Blr B3',v:88},{l:'Pune P2',v:79},{l:'Jaipur J1',v:72},{l:'Kolkata K4',v:68},{l:'Chennai C2',v:65}];
  const storeBarData = { labels:storeBarD.map(d=>d.l), datasets:[{data:storeBarD.map(d=>d.v),backgroundColor:storeBarD.map(d=>d.v>=77?'#0e9f6e':'#f59e0b'),borderRadius:4}] };
  const storeBarOpts = { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{min:50,max:100,ticks:{font:{size:10}}},x:{ticks:{font:{size:10}}}} };

  // Region distribution from DB
  const byRegion = dashData?.by_region || {};
  const regionEntries = Object.entries(byRegion);
  const regColors = ['#00338D','#0e9f6e','#f59e0b','#e02424'];
  const regD = regionEntries.length
    ? regionEntries.map(([k, v], i) => {
        const total = regionEntries.reduce((a,[,c]) => a+c, 0) || 1;
        return {l: k.replace(' India',''), v: Math.round(v/total*100), c: regColors[i % regColors.length]};
      })
    : [{l:'North',v:28,c:'#00338D'},{l:'South',v:24,c:'#0e9f6e'},{l:'West',v:26,c:'#f59e0b'},{l:'East',v:22,c:'#e02424'}];
  const regData = { labels:regD.map(d=>d.l), datasets:[{data:regD.map(d=>d.v),backgroundColor:regD.map(d=>d.c),borderWidth:2,borderColor:'#fff'}] };

  // Format distribution from DB stores
  const formatGroups = {};
  stores.forEach(s => {
    const fmt = s.format || 'Other';
    if (!formatGroups[fmt]) formatGroups[fmt] = [];
    formatGroups[fmt].push(s.meta?.s26 ?? s.meta?.s25 ?? 0);
  });
  const fmtColors = {COCO:'#00338D',COFO:'#06b6d4',FOCO:'#f59e0b',FOFO:'#8b5cf6'};
  const fmtD = Object.keys(formatGroups).length
    ? Object.entries(formatGroups).map(([fmt, scores]) => ({
        l: fmt,
        v: Math.round(scores.reduce((a,b)=>a+b,0) / scores.length),
        c: fmtColors[fmt] || '#6b7280'
      }))
    : [{l:'COCO',v:92,c:'#00338D'},{l:'COFO',v:84,c:'#06b6d4'},{l:'FOCO',v:76,c:'#f59e0b'},{l:'FOFO',v:68,c:'#8b5cf6'}];
  const fmtData = { labels:fmtD.map(d=>d.l), datasets:[{data:fmtD.map(d=>d.v),backgroundColor:fmtD.map(d=>d.c),borderRadius:5}] };
  const fmtOpts = { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{min:50,max:100,ticks:{font:{size:10}}},x:{ticks:{font:{size:10}}}} };

  // Score distribution from DB stores
  const scoreRanges = stores.length ? (() => {
    const s26Scores = stores.map(s => s.meta?.s26 ?? s.meta?.s25 ?? 0);
    return [
      {l:'>90', v: s26Scores.filter(v=>v>90).length, c:'#0e9f6e'},
      {l:'90-75', v: s26Scores.filter(v=>v<=90&&v>=75).length, c:'#84cc16'},
      {l:'75-60', v: s26Scores.filter(v=>v<75&&v>=60).length, c:'#f59e0b'},
      {l:'60-40', v: s26Scores.filter(v=>v<60&&v>=40).length, c:'#f97316'},
      {l:'<40', v: s26Scores.filter(v=>v<40).length, c:'#e02424'},
    ];
  })() : [{l:'>90',v:20,c:'#0e9f6e'},{l:'90-75',v:40,c:'#84cc16'},{l:'75-60',v:25,c:'#f59e0b'},{l:'60-40',v:10,c:'#f97316'},{l:'<40',v:5,c:'#e02424'}];
  const distD = scoreRanges;
  const distData = { labels:distD.map(d=>d.l), datasets:[{data:distD.map(d=>d.v),backgroundColor:distD.map(d=>d.c),borderWidth:2,borderColor:'#fff'}] };

  // Top/Bottom stores from DB
  const sortedStores = [...stores].sort((a,b) => ((b.meta?.s26??b.meta?.s25??0) - (a.meta?.s26??a.meta?.s25??0)));
  const t5 = sortedStores.slice(0,5).map(s => ({n:`${s.name}, ${s.city}`, v:`${s.meta?.s26??s.meta?.s25??0}%`}));
  const b5 = sortedStores.slice(-5).reverse().map(s => ({n:`${s.name}, ${s.city}`, v:`${s.meta?.s26??s.meta?.s25??0}%`}));

  // Top observations from DB
  const topObservations = observations.length
    ? [...new Set(observations.map(o => o.observation))].slice(0,5)
    : ['GSTIN certificate not displayed at store','Manual bills issued from store not regularized','Defined Merchandise layout not followed across the store','Delay in deposit of cash collected through sales','Fake note detector not available in stores'];
  const repeatObservations = issues.length
    ? issues.slice(0,5).map(i => i.title)
    : ['Freezer temperature fluctuation','Generator oil leakage detected','Critical Gas line inspection overdue','Wet floor in prep area','AC unit not cooling in customer area'];

  // Recent issues from DB
  const recentIssues = issues.slice(0,3);

  // drill handlers
  function openRiskDrill(idx) {
    const level = riskD[idx].l;
    const priMap = { High:['Critical','High'], Medium:['Medium'], Low:['Low'] };
    const pris = priMap[level] || [];
    const data = issues.filter(i => pris.includes(i.priority));
    setDrillTitle(`${level} Risk Observations (${data.length})`);
    setDrillList(data.map(i => ({ title:i.title, badges:[{text:i.status,cls:stC(i.status)},{text:i.priority,cls:prC(i.priority)}], sub:i.store })));
    setDrillOpen(true);
  }
  function openRegionDrill(idx) {
    const region = regD[idx].l;
    const fullRegion = region + ' India';
    const data = audits.filter(a => a.region === fullRegion || a.region === region);
    setDrillTitle(`${fullRegion} Audits (${data.length})`);
    setDrillList(data.map(a => ({ title:`${a.store}, ${a.city||''}`, badges:[{text:a.status,cls:sBadge(a.status)}], sub:a.scheduled_at })));
    setDrillOpen(true);
  }
  function openDistDrill(idx) {
    const bucket = distD[idx].l;
    const inBucket = v => {
      if(bucket==='>90') return v>90;
      if(bucket==='90-75') return v<=90&&v>=75;
      if(bucket==='75-60') return v<75&&v>=60;
      if(bucket==='60-40') return v<60&&v>=40;
      return v<40;
    };
    const data = stores.filter(s => inBucket(s.meta?.s26 ?? s.meta?.s25 ?? 0));
    setDrillTitle(`Stores Scoring ${bucket}% (${data.length})`);
    setDrillList(data.map(s => ({ title:`${s.name}, ${s.city}`, badges:[{text:s.status,cls:s.status==='Operating'?'bg':'bgr'}], sub:null, score:s.meta?.s26??s.meta?.s25??0 })));
    setDrillOpen(true);
  }

  // PBI chart data
  const pbiDonutData = { labels:['Eligible Return','Ineligible SKU','Late Return'], datasets:[{data:[252,138,3],backgroundColor:['#2f4b9e','#0e9f8e','#cbd5e1'],borderWidth:2,borderColor:'#fff'}] };
  const pbiDonutOpts = { responsive:true, maintainAspectRatio:false, cutout:'62%', plugins:{legend:{position:'bottom',labels:{font:{size:9},boxWidth:8,padding:8}},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${ctx.parsed}K`}}} };
  const pbiBarData = { labels:['Eligible Return','Ineligible SKU','Late Return','Total'], datasets:[{data:[46.01,18.20,2.38,66.59],backgroundColor:['#0e9f8e','#0e9f8e','#0e9f8e','#1b3a6b'],borderRadius:3}] };
  const pbiBarOpts = { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.parsed.y}M`}}}, scales:{y:{ticks:{font:{size:9},callback:v=>v+'M'}},x:{ticks:{font:{size:9}}}} };
  const pbiHbarData = { labels:['Fresh','Grocery Non Food','BDF','Staples','Grocery Food','Apparels','General Merchandise','Others','CDIT'], datasets:[{data:[65148,53837,17202,3247,1203,153,103,38,1],backgroundColor:'#1b3a6b',borderRadius:2}] };
  const pbiHbarOpts = { indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{ticks:{font:{size:8}}},y:{ticks:{font:{size:9}}}} };

  if (loading) {
    return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh',color:'var(--text3)'}}>Loading dashboard data...</div>;
  }

  return (
    <>
      {/* Header */}
      <div className="page-hdr">
        <div><h2>Audit Operations</h2><p>Consolidated View &bull; Q4</p></div>
        <div className="btn-row">
          <button className="btn btn-outline btn-sm">Q1</button>
          <button className="btn btn-outline btn-sm">Q2</button>
          <button className="btn btn-outline btn-sm">Q3</button>
          <button className="btn btn-primary btn-sm">Q4</button>
          <button className="btn btn-outline btn-sm" onClick={() => setPbiOpen(true)}>BI Dashboard</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-row c3" style={{marginBottom:12}}>
        <div className="kpi"><div className="kpi-ico" style={{background:'#e8eefa'}}>&#x1F4CB;</div><div><div className="kpi-lbl">Planned</div><div className="kpi-val">{plannedCount}</div></div></div>
        <div className="kpi"><div className="kpi-ico" style={{background:'#fffbeb'}}>&#x23F3;</div><div><div className="kpi-lbl">Ongoing</div><div className="kpi-val">{ongoingCount}</div></div></div>
        <div className="kpi"><div className="kpi-ico" style={{background:'#ecfdf5'}}>&#x2705;</div><div><div className="kpi-lbl">Completed</div><div className="kpi-val">{completedCount}</div></div></div>
      </div>

      {/* Row 1: Trend + Risk */}
      <div className="dash-g21">
        <div className="card">
          <div className="card-title">Performance Trends<span style={{fontSize:11,color:'var(--text3)',fontWeight:400}}>Benchmark: 90%</span></div>
          <div className="ch-wrap"><Line data={trendData} options={trendOpts}/></div>
        </div>
        <div className="card">
          <div className="card-title">All Observations by Risk</div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:16,height:190}}>
            <div style={{position:'relative',width:155,height:155,flexShrink:0}}>
              <Doughnut data={riskData} options={donutOpts('62%', openRiskDrill)}/>
            </div>
            <div style={{fontSize:'11.5px'}}>
              {riskD.map(d => (
                <div key={d.l} style={{display:'flex',alignItems:'center',gap:5,marginBottom:5,cursor:'pointer'}} onClick={() => openRiskDrill(riskD.indexOf(d))}>
                  <span style={{width:9,height:9,borderRadius:2,background:d.c,display:'inline-block'}}/>
                  {d.l}: <b>{d.v}%</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Store bars + Region */}
      <div className="dash-g21">
        <div className="card">
          <div className="card-title">Store-wise Compliance Score (%)</div>
          <div className="ch-wrap"><Bar data={storeBarData} options={storeBarOpts}/></div>
        </div>
        <div className="card">
          <div className="card-title">Audit Distribution by Region</div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:14,height:190}}>
            <div style={{position:'relative',width:150,height:150,flexShrink:0}}>
              <Doughnut data={regData} options={donutOpts('58%', openRegionDrill)}/>
            </div>
            <div style={{fontSize:'11.5px'}}>
              <div style={{fontSize:17,fontWeight:700,marginBottom:3}}>{avgScore ? avgScore + '%' : '74.5%'}</div>
              <div style={{fontSize:10,color:'var(--text3)',marginBottom:8}}>Avg Score</div>
              {regD.map(d => (
                <div key={d.l} style={{display:'flex',alignItems:'center',gap:5,marginBottom:4,cursor:'pointer'}} onClick={() => openRegionDrill(regD.indexOf(d))}>
                  <span style={{width:9,height:9,borderRadius:2,background:d.c,display:'inline-block'}}/>
                  <span style={{fontSize:'11.5px'}}>{d.l}: <b>{d.v}%</b></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Format + Distribution */}
      <div className="dash-g21b">
        <div className="card">
          <div className="card-title">Store Format Performance (Avg. Score)</div>
          <div style={{display:'flex',gap:18}}>
            <div style={{flex:1}}><Bar data={fmtData} options={fmtOpts} height={145}/></div>
            <div style={{minWidth:155,fontSize:12}}>
              <div style={{fontSize:'10.5px',fontWeight:700,textTransform:'uppercase',color:'var(--text3)',letterSpacing:'.05em',marginBottom:8}}>Format Summary</div>
              {fmtD.map(d => (
                <div key={d.l} style={{paddingBottom:4,marginBottom:4,borderBottom:'1px solid #e5e7eb'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                    <span style={{color:'#6b7280'}}>{d.l} Average</span><b style={{color:d.c}}>{d.v}%</b>
                  </div>
                  <div className="prog-bg"><div className="prog-fill" style={{width:`${d.v}%`,background:d.c,height:5}}/></div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Store Score Distribution</div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12,height:185}}>
            <div style={{position:'relative',width:145,height:145,flexShrink:0}}>
              <Doughnut data={distData} options={donutOpts('58%', openDistDrill)}/>
            </div>
            <div style={{fontSize:'11.5px'}}>
              {distD.map(d => (
                <div key={d.l} style={{display:'flex',alignItems:'center',gap:5,marginBottom:4,cursor:'pointer'}} onClick={() => openDistDrill(distD.indexOf(d))}>
                  <span style={{width:9,height:9,borderRadius:2,background:d.c,display:'inline-block'}}/>
                  <span style={{fontSize:'11.5px'}}>{d.l}: <b>{d.v}</b></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row 4: Scorecards + Observations */}
      <div className="dash-g11">
        <div className="card">
          <div className="card-title">Store Scorecards</div>
          <div style={{display:'flex',gap:18}}>
            <div style={{flex:1}}>
              <div className="sc-lbl" style={{color:'var(--green)'}}>&#x1F3C6; Top 5 Stores</div>
              {t5.map(s => { const v = parseInt(s.v); return (
                <div key={s.n} className="sc-row">
                  <span>{s.n}</span>
                  <div style={{display:'flex',alignItems:'center',gap:5,minWidth:70}}>
                    <div className="prog-bg" style={{flex:1,height:5}}><div className={`prog-fill ${pbClass(v)}`} style={{width:`${v}%`}}/></div>
                    <span style={{color:'#0e9f6e',fontWeight:700,fontSize:'11.5px'}}>{s.v}</span>
                  </div>
                </div>
              );})}
            </div>
            <div style={{flex:1}}>
              <div className="sc-lbl" style={{color:'var(--red)'}}>&#x26A0; Bottom 5 Stores</div>
              {b5.map(s => { const v = parseInt(s.v); return (
                <div key={s.n} className="sc-row">
                  <span>{s.n}</span>
                  <div style={{display:'flex',alignItems:'center',gap:5,minWidth:70}}>
                    <div className="prog-bg" style={{flex:1,height:5}}><div className={`prog-fill ${pbClass(v)}`} style={{width:`${v}%`}}/></div>
                    <span style={{color:'#e02424',fontWeight:700,fontSize:'11.5px'}}>{s.v}</span>
                  </div>
                </div>
              );})}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Repeat Observations</div>
          <div style={{display:'flex',gap:5,marginBottom:8}}>
            <button className={`qtab${obsTab==='top'?' active':''}`} onClick={() => setObsTab('top')}>Top 5 Observations</button>
            <button className={`qtab${obsTab==='repeat'?' active':''}`} onClick={() => setObsTab('repeat')}>Top 5 Repeat</button>
          </div>
          {obsTab === 'top' && topObservations.map(o => (
            <div key={o} className="obs-item"><div className="obs-dot"/><div>{o}</div></div>
          ))}
          {obsTab === 'repeat' && repeatObservations.map(o => (
            <div key={o} className="obs-item"><div className="obs-dot" style={{background:'var(--red)'}}/><div>{o}</div></div>
          ))}
        </div>
      </div>

      {/* Row 5: Recent Issues */}
      <div className="dash-g11">
        <div className="card">
          <div className="card-title">Recent Communications<span style={{fontSize:11,color:'var(--text3)',fontWeight:400,cursor:'pointer'}} onClick={() => navigate('/email')}>View all &rarr;</span></div>
          <div style={{textAlign:'center',padding:20,color:'var(--text3)',fontSize:12}}>No communications yet</div>
        </div>
        <div className="card" style={{alignSelf:'start'}}>
          <div className="card-title">Recent Issues<span style={{fontSize:11,color:'var(--text3)',fontWeight:400,cursor:'pointer'}} onClick={() => navigate('/issues')}>View all &rarr;</span></div>
          {recentIssues.length ? recentIssues.map((i, idx) => (
            <div key={i.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,padding:'8px 0',borderBottom:idx<recentIssues.length-1?'1px solid var(--border)':'none',cursor:'pointer'}} onClick={() => navigate('/issues')}>
              <div className={`av ${avC(i.assignee || 'U')}`} style={{width:24,height:24,fontSize:10,flexShrink:0}}>{(i.assignee||'U')[0]}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:'12.5px',fontWeight:600,color:'var(--text)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{i.title}</div>
                <div style={{fontSize:11,color:'var(--text3)'}}>{i.store} &bull; {i.created_at?.substring(0,10)}</div>
              </div>
              <div style={{display:'flex',gap:5,flexShrink:0}}>
                <span className={`badge ${prC(i.priority)}`}>{i.priority}</span>
                <span className={`badge ${stC(i.status)}`}>{i.status}</span>
              </div>
            </div>
          )) : <div style={{textAlign:'center',padding:20,color:'var(--text3)',fontSize:12}}>No issues yet</div>}
        </div>
      </div>

      {/* Drill Drawer */}
      <div className={`drawer-ov${drillOpen?' open':''}`} onClick={e => { if(e.target === e.currentTarget) setDrillOpen(false); }}>
        <div className="drawer">
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
            <div style={{fontSize:15,fontWeight:700,color:'var(--text)'}}>{drillTitle}</div>
            <span style={{cursor:'pointer',color:'var(--text3)',fontSize:15}} onClick={() => setDrillOpen(false)}>&#x2715;</span>
          </div>
          {drillList.length ? drillList.map((item, idx) => (
            <div key={idx} style={{padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
              <div style={{fontSize:'12.5px',fontWeight:600,color:'var(--text)',marginBottom:5}}>{item.title}</div>
              <div style={{display:'flex',gap:5,flexWrap:'wrap',alignItems:'center'}}>
                {item.badges.map((b, bi) => <span key={bi} className={`badge ${b.cls}`}>{b.text}</span>)}
                {item.sub && <span style={{fontSize:11,color:'var(--text3)'}}>{item.sub}</span>}
                {item.score != null && <span style={{fontSize:11,color:sColor(item.score),fontWeight:700}}>{item.score}%</span>}
              </div>
            </div>
          )) : <div style={{textAlign:'center',padding:20,color:'var(--text3)',fontSize:12}}>No items in this category</div>}
        </div>
      </div>

      {/* Power BI Modal */}
      <div className={`modal-ov${pbiOpen?' open':''}`} onClick={e => { if(e.target === e.currentTarget) setPbiOpen(false); }}>
        <div className="modal" style={{width:1020,maxWidth:'96vw',height:640,maxHeight:'92vh',padding:0,overflow:'hidden'}}>
          <div style={{display:'flex',height:'100%'}}>
            <div style={{width:46,background:'#7a1f3d',display:'flex',flexDirection:'column',alignItems:'center',padding:'10px 0',flexShrink:0}}>
              <div style={{color:'#fff',fontSize:16,marginBottom:14}}>&#x1F3E0;</div>
              <div style={{width:30,height:22,background:'rgba(255,255,255,.15)',color:'#fff',fontSize:'8.5px',fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:4,marginBottom:6}}>KPI 1</div>
              <div style={{width:30,height:22,background:'#fff',color:'#7a1f3d',fontSize:'8.5px',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:4}}>KPI 2</div>
            </div>
            <div style={{flex:1,minWidth:0,background:'#f4f5f9',display:'flex',flexDirection:'column'}}>
              <div style={{padding:'6px 14px 0',display:'flex',justifyContent:'flex-end',flexShrink:0}}>
                <span style={{cursor:'pointer',color:'var(--text3)',fontSize:15}} onClick={() => setPbiOpen(false)}>&#x2715;</span>
              </div>
              <div style={{padding:'0 16px 8px',flex:1,minHeight:0,display:'flex',flexDirection:'column'}}>
                <div style={{background:'linear-gradient(90deg,#5a2a6e,#7d3a8c)',borderRadius:6,padding:'9px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:5,flexShrink:0}}>
                  <span style={{color:'#fff',fontSize:15,fontWeight:700}}>Sales Return of Ineligible SKUs</span>
                  <span style={{color:'#fff',fontSize:15}}>&rarr;</span>
                </div>
                <div style={{fontSize:10,color:'var(--text3)',padding:'4px 2px 8px',fontStyle:'italic',flexShrink:0}}>Objective: To enforce company return policies and reduce revenue leakage from unauthorized returns.</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,marginBottom:8,flexShrink:0}}>
                  {[{v:'393K',l:'Total Returns'},{v:'3009',l:'> 14 Days Returns'},{v:'138.12K',l:'Ineligible Returns'},{v:'141K',l:'Total Exception Returns'},{v:'35.93%',l:'Violation %'}].map(k => (
                    <div key={k.l} style={{background:'linear-gradient(135deg,#0b6e63,#12a394)',borderRadius:6,padding:'8px 6px',textAlign:'center',color:'#fff'}}>
                      <div style={{fontSize:16,fontWeight:800}}>{k.v}</div>
                      <div style={{fontSize:'8.5px',opacity:.9,marginTop:1}}>{k.l}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1.4fr 1fr 1fr 1fr',gap:8,marginBottom:8,flexShrink:0}}>
                  <div style={{background:'#fff',borderRadius:6,padding:'6px 12px'}}>
                    <div style={{fontSize:10,fontWeight:600,color:'var(--text2)',marginBottom:4}}>Date Range</div>
                    <div style={{display:'flex',gap:6,alignItems:'center'}}>
                      <span style={{background:'#00338D',color:'#fff',fontSize:'9.5px',padding:'3px 7px',borderRadius:4}}>4/1/2024 &#x1F4C5;</span>
                      <span style={{background:'#00338D',color:'#fff',fontSize:'9.5px',padding:'3px 7px',borderRadius:4}}>12/31/2024 &#x1F4C5;</span>
                    </div>
                  </div>
                  {['Division','Department','City'].map(f => (
                    <div key={f} style={{background:'#fff',borderRadius:6,padding:'6px 12px'}}>
                      <div style={{fontSize:10,fontWeight:600,color:'var(--text2)',marginBottom:4}}>{f}</div>
                      <div style={{background:'#00338D',color:'#fff',fontSize:10,padding:'4px 9px',borderRadius:4,display:'flex',justifyContent:'space-between'}}>All <span>&#x2304;</span></div>
                    </div>
                  ))}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1.3fr',gap:8,flex:1,minHeight:0}}>
                  <div style={{background:'#fff',borderRadius:6,overflow:'hidden',display:'flex',flexDirection:'column'}}>
                    <div style={{background:'linear-gradient(90deg,#5a2a6e,#7d3a8c)',color:'#fff',fontSize:11,fontWeight:700,textAlign:'center',padding:5,flexShrink:0}}>Distribution of Returns</div>
                    <div style={{padding:6,flex:1,minHeight:0}}><div className="ch-wrap" style={{height:'100%'}}><Doughnut data={pbiDonutData} options={pbiDonutOpts}/></div></div>
                  </div>
                  <div style={{background:'#fff',borderRadius:6,overflow:'hidden',display:'flex',flexDirection:'column'}}>
                    <div style={{background:'linear-gradient(90deg,#5a2a6e,#7d3a8c)',color:'#fff',fontSize:11,fontWeight:700,textAlign:'center',padding:5,flexShrink:0}}>Distribution of Return Value</div>
                    <div style={{padding:6,flex:1,minHeight:0}}><div className="ch-wrap" style={{height:'100%'}}><Bar data={pbiBarData} options={pbiBarOpts}/></div></div>
                  </div>
                  <div style={{background:'#fff',borderRadius:6,overflow:'hidden',display:'flex',flexDirection:'column'}}>
                    <div style={{background:'linear-gradient(90deg,#5a2a6e,#7d3a8c)',color:'#fff',fontSize:11,fontWeight:700,textAlign:'center',padding:5,flexShrink:0}}>Violations by Division</div>
                    <div style={{padding:6,flex:1,minHeight:0}}><div className="ch-wrap" style={{height:'100%'}}><Bar data={pbiHbarData} options={pbiHbarOpts}/></div></div>
                  </div>
                </div>
              </div>
              <div style={{display:'flex',gap:2,background:'#e5e2ea',padding:'4px 10px',fontSize:9,color:'var(--text3)',overflowX:'auto',whiteSpace:'nowrap',flexShrink:0}}>
                <span style={{padding:'3px 7px'}}>&#x25A4; KPI 1 Drill-through</span>
                <span style={{padding:'3px 7px'}}>KPI 2</span>
                <span style={{padding:'3px 7px',borderBottom:'2px solid #0e9f6e',color:'#0e9f6e',fontWeight:700}}>KPI 2 - Summary</span>
                <span style={{padding:'3px 7px'}}>KPI 2 Drill-through</span>
                <span style={{padding:'3px 7px'}}>KPI 3</span>
                <span style={{padding:'3px 7px'}}>Duplicate of KPI 3</span>
                <span style={{padding:'3px 7px'}}>KPI 1 Summary</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
