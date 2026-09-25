import { useState, useEffect } from 'react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { avC, sColor, sBadge, pbClass, prC, stC } from '../utils/helpers';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
  const [scoreMap, setScoreMap] = useState({});
  const [selectedQ, setSelectedQ] = useState('q4');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.stores().catch(() => []),
      api.issues().catch(() => []),
      api.dashboard().catch(() => null),
      api.observations().catch(() => []),
      api.audits().catch(() => []),
      api.storeScores().catch(() => []),
    ]).then(([s, i, d, o, a, scores]) => {
      setStores(s || []);
      setIssues(i || []);
      setDashData(d);
      setObservations(o || []);
      setAudits(a || []);
      const map = {};
      for (const sc of (scores || [])) map[sc.store_id] = sc;
      setScoreMap(map);
      setLoading(false);
    });
  }, []);

  function latestScore(s) {
    const sc = scoreMap[s.id];
    if (!sc) return 0;
    return sc[selectedQ] || 0;
  }

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
        .map(s => ({l: s.name?.substring(0,12) || s.id, v: latestScore(s)}))
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
    formatGroups[fmt].push(latestScore(s));
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
    const allScores = stores.map(s => latestScore(s));
    return [
      {l:'>90', v: allScores.filter(v=>v>90).length, c:'#0e9f6e'},
      {l:'90-75', v: allScores.filter(v=>v<=90&&v>=75).length, c:'#84cc16'},
      {l:'75-60', v: allScores.filter(v=>v<75&&v>=60).length, c:'#f59e0b'},
      {l:'60-40', v: allScores.filter(v=>v<60&&v>=40).length, c:'#f97316'},
      {l:'<40', v: allScores.filter(v=>v<40).length, c:'#e02424'},
    ];
  })() : [{l:'>90',v:20,c:'#0e9f6e'},{l:'90-75',v:40,c:'#84cc16'},{l:'75-60',v:25,c:'#f59e0b'},{l:'60-40',v:10,c:'#f97316'},{l:'<40',v:5,c:'#e02424'}];
  const distD = scoreRanges;
  const distData = { labels:distD.map(d=>d.l), datasets:[{data:distD.map(d=>d.v),backgroundColor:distD.map(d=>d.c),borderWidth:2,borderColor:'#fff'}] };

  // Top/Bottom stores from DB
  const sortedStores = [...stores].sort((a,b) => (latestScore(b) - latestScore(a)));
  const t5 = sortedStores.slice(0,5).map(s => ({n:`${s.name}, ${s.city}`, v:`${latestScore(s)}%`}));
  const b5 = sortedStores.slice(-5).reverse().map(s => ({n:`${s.name}, ${s.city}`, v:`${latestScore(s)}%`}));

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
    const data = stores.filter(s => inBucket(latestScore(s)));
    setDrillTitle(`Stores Scoring ${bucket}% (${data.length})`);
    setDrillList(data.map(s => ({ title:`${s.name}, ${s.city}`, badges:[{text:s.status,cls:s.status==='Operating'?BADGE_OPERATING:BADGE_GRAY}], sub:null, score:latestScore(s) })));
    setDrillOpen(true);
  }
  const BADGE_OPERATING = 'bg-emerald-50 text-emerald-700';
  const BADGE_GRAY = 'bg-muted text-muted-foreground border border-border';

  // PBI chart data
  const pbiDonutData = { labels:['Eligible Return','Ineligible SKU','Late Return'], datasets:[{data:[252,138,3],backgroundColor:['#2f4b9e','#0e9f8e','#cbd5e1'],borderWidth:2,borderColor:'#fff'}] };
  const pbiDonutOpts = { responsive:true, maintainAspectRatio:false, cutout:'62%', plugins:{legend:{position:'bottom',labels:{font:{size:9},boxWidth:8,padding:8}},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${ctx.parsed}K`}}} };
  const pbiBarData = { labels:['Eligible Return','Ineligible SKU','Late Return','Total'], datasets:[{data:[46.01,18.20,2.38,66.59],backgroundColor:['#0e9f8e','#0e9f8e','#0e9f8e','#1b3a6b'],borderRadius:3}] };
  const pbiBarOpts = { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.parsed.y}M`}}}, scales:{y:{ticks:{font:{size:9},callback:v=>v+'M'}},x:{ticks:{font:{size:9}}}} };
  const pbiHbarData = { labels:['Fresh','Grocery Non Food','BDF','Staples','Grocery Food','Apparels','General Merchandise','Others','CDIT'], datasets:[{data:[65148,53837,17202,3247,1203,153,103,38,1],backgroundColor:'#1b3a6b',borderRadius:2}] };
  const pbiHbarOpts = { indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{ticks:{font:{size:8}}},y:{ticks:{font:{size:9}}}} };

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground">Loading dashboard data...</div>;
  }

  return (
    <>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div><h2 className="text-xl font-bold text-foreground">Audit Operations</h2><p className="mt-0.5 text-xs text-muted-foreground">Consolidated View &bull; {selectedQ.toUpperCase()}</p></div>
        <div className="flex flex-wrap items-center gap-1.5">
          {['q1','q2','q3','q4'].map(q => (
            <Button key={q} size="sm" variant={selectedQ === q ? 'default' : 'outline'} onClick={() => setSelectedQ(q)}>{q.toUpperCase()}</Button>
          ))}
          <Button size="sm" onClick={() => setPbiOpen(true)}>&#x1F4CA; Power BI</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-3 grid grid-cols-3 gap-3">
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4">
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{background:'#e8eefa'}}>&#x1F4CB;</div>
          <div><div className="mb-0.5 text-[11px] text-muted-foreground">Planned</div><div className="text-2xl font-bold leading-none text-foreground">{plannedCount}</div></div>
        </div>
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4">
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{background:'#fffbeb'}}>&#x23F3;</div>
          <div><div className="mb-0.5 text-[11px] text-muted-foreground">Ongoing</div><div className="text-2xl font-bold leading-none text-foreground">{ongoingCount}</div></div>
        </div>
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4">
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{background:'#ecfdf5'}}>&#x2705;</div>
          <div><div className="mb-0.5 text-[11px] text-muted-foreground">Completed</div><div className="text-2xl font-bold leading-none text-foreground">{completedCount}</div></div>
        </div>
      </div>

      {/* Row 1: Trend + Risk */}
      <div className="mb-3 grid grid-cols-[2fr_1fr] gap-3">
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between text-[13px] font-semibold text-foreground">Performance Trends<span className="text-[11px] font-normal text-muted-foreground">Benchmark: 90%</span></div>
          <div className="relative h-[190px] w-full"><Line data={trendData} options={trendOpts}/></div>
        </div>
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="mb-3 text-[13px] font-semibold text-foreground">All Observations by Risk</div>
          <div className="flex h-[190px] items-center justify-center gap-4">
            <div className="relative h-[155px] w-[155px] shrink-0">
              <Doughnut data={riskData} options={donutOpts('62%', openRiskDrill)}/>
            </div>
            <div className="text-[11.5px]">
              {riskD.map(d => (
                <div key={d.l} className="mb-1.5 flex cursor-pointer items-center gap-1.5" onClick={() => openRiskDrill(riskD.indexOf(d))}>
                  <span className="inline-block h-[9px] w-[9px] rounded-sm" style={{background:d.c}}/>
                  {d.l}: <b>{d.v}%</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Store bars + Region */}
      <div className="mb-3 grid grid-cols-[2fr_1fr] gap-3">
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="mb-3 text-[13px] font-semibold text-foreground">Store-wise Compliance Score (%)</div>
          <div className="relative h-[190px] w-full"><Bar data={storeBarData} options={storeBarOpts}/></div>
        </div>
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="mb-3 text-[13px] font-semibold text-foreground">Audit Distribution by Region</div>
          <div className="flex h-[190px] items-center justify-center gap-3.5">
            <div className="relative h-[150px] w-[150px] shrink-0">
              <Doughnut data={regData} options={donutOpts('58%', openRegionDrill)}/>
            </div>
            <div className="text-[11.5px]">
              <div className="mb-1 text-[17px] font-bold">{avgScore ? avgScore + '%' : '74.5%'}</div>
              <div className="mb-2 text-[10px] text-muted-foreground">Avg Score</div>
              {regD.map(d => (
                <div key={d.l} className="mb-1 flex cursor-pointer items-center gap-1.5" onClick={() => openRegionDrill(regD.indexOf(d))}>
                  <span className="inline-block h-[9px] w-[9px] rounded-sm" style={{background:d.c}}/>
                  <span className="text-[11.5px]">{d.l}: <b>{d.v}%</b></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Format + Distribution */}
      <div className="mb-3 grid grid-cols-[2fr_1fr] gap-3">
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="mb-3 text-[13px] font-semibold text-foreground">Store Format Performance (Avg. Score)</div>
          <div className="flex gap-4.5">
            <div className="flex-1"><Bar data={fmtData} options={fmtOpts} height={145}/></div>
            <div className="min-w-[155px] text-xs">
              <div className="mb-2 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Format Summary</div>
              {fmtD.map(d => (
                <div key={d.l} className="mb-1 border-b border-gray-200 pb-1">
                  <div className="mb-1 flex justify-between">
                    <span className="text-gray-500">{d.l} Average</span><b style={{color:d.c}}>{d.v}%</b>
                  </div>
                  <div className="h-[5px] overflow-hidden rounded-[3px] bg-gray-200"><div className="h-full rounded-[3px]" style={{width:`${d.v}%`,background:d.c}}/></div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="mb-3 text-[13px] font-semibold text-foreground">Store Score Distribution</div>
          <div className="flex h-[185px] items-center justify-center gap-3">
            <div className="relative h-[145px] w-[145px] shrink-0">
              <Doughnut data={distData} options={donutOpts('58%', openDistDrill)}/>
            </div>
            <div className="text-[11.5px]">
              {distD.map(d => (
                <div key={d.l} className="mb-1 flex cursor-pointer items-center gap-1.5" onClick={() => openDistDrill(distD.indexOf(d))}>
                  <span className="inline-block h-[9px] w-[9px] rounded-sm" style={{background:d.c}}/>
                  <span className="text-[11.5px]">{d.l}: <b>{d.v}</b></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row 4: Scorecards + Observations */}
      <div className="mb-3 grid grid-cols-2 gap-3">
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="mb-3 text-[13px] font-semibold text-foreground">Store Scorecards</div>
          <div className="flex gap-4.5">
            <div className="flex-1">
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider" style={{color:'var(--green)'}}>&#x1F3C6; Top 5 Stores</div>
              {t5.map(s => { const v = parseInt(s.v); return (
                <div key={s.n} className="flex items-center justify-between border-b border-border py-1 text-xs last:border-0">
                  <span>{s.n}</span>
                  <div className="flex min-w-[70px] items-center gap-1.5">
                    <div className="h-[5px] flex-1 overflow-hidden rounded-[3px] bg-gray-200"><div className={cn('h-full rounded-[3px]', pbClass(v))} style={{width:`${v}%`}}/></div>
                    <span className="text-[11.5px] font-bold text-emerald-600">{s.v}</span>
                  </div>
                </div>
              );})}
            </div>
            <div className="flex-1">
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider" style={{color:'var(--red)'}}>&#x26A0; Bottom 5 Stores</div>
              {b5.map(s => { const v = parseInt(s.v); return (
                <div key={s.n} className="flex items-center justify-between border-b border-border py-1 text-xs last:border-0">
                  <span>{s.n}</span>
                  <div className="flex min-w-[70px] items-center gap-1.5">
                    <div className="h-[5px] flex-1 overflow-hidden rounded-[3px] bg-gray-200"><div className={cn('h-full rounded-[3px]', pbClass(v))} style={{width:`${v}%`}}/></div>
                    <span className="text-[11.5px] font-bold text-red-600">{s.v}</span>
                  </div>
                </div>
              );})}
            </div>
          </div>
        </div>
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="mb-3 text-[13px] font-semibold text-foreground">Repeat Observations</div>
          <div className="mb-2 flex gap-1.5">
            <button className={cn('rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground', obsTab==='top' && 'border-primary bg-primary text-primary-foreground')} onClick={() => setObsTab('top')}>Top 5 Observations</button>
            <button className={cn('rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground', obsTab==='repeat' && 'border-primary bg-primary text-primary-foreground')} onClick={() => setObsTab('repeat')}>Top 5 Repeat</button>
          </div>
          {obsTab === 'top' && topObservations.map(o => (
            <div key={o} className="flex items-start gap-1.5 border-b border-border py-1.5 text-xs text-foreground/80 last:border-0"><div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{background:'var(--orange)'}}/><div>{o}</div></div>
          ))}
          {obsTab === 'repeat' && repeatObservations.map(o => (
            <div key={o} className="flex items-start gap-1.5 border-b border-border py-1.5 text-xs text-foreground/80 last:border-0"><div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{background:'var(--red)'}}/><div>{o}</div></div>
          ))}
        </div>
      </div>

      {/* Row 5: Recent Issues */}
      <div className="mb-3 grid grid-cols-2 gap-3">
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between text-[13px] font-semibold text-foreground">Recent Communications<span className="cursor-pointer text-[11px] font-normal text-muted-foreground" onClick={() => navigate('/email')}>View all &rarr;</span></div>
          <div className="p-5 text-center text-xs text-muted-foreground">No communications yet</div>
        </div>
        <div className="self-start rounded-[10px] border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between text-[13px] font-semibold text-foreground">Recent Issues<span className="cursor-pointer text-[11px] font-normal text-muted-foreground" onClick={() => navigate('/issues')}>View all &rarr;</span></div>
          {recentIssues.length ? recentIssues.map((i, idx) => (
            <div key={i.id} className={cn('flex cursor-pointer items-center justify-between gap-2.5 py-2', idx < recentIssues.length - 1 && 'border-b border-border')} onClick={() => navigate('/issues')}>
              <div className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white', avC(i.assignee || 'U'))}>{(i.assignee||'U')[0]}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-semibold text-foreground">{i.title}</div>
                <div className="text-[11px] text-muted-foreground">{i.store} &bull; {i.created_at?.substring(0,10)}</div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Badge className={prC(i.priority)}>{i.priority}</Badge>
                <Badge className={stC(i.status)}>{i.status}</Badge>
              </div>
            </div>
          )) : <div className="p-5 text-center text-xs text-muted-foreground">No issues yet</div>}
        </div>
      </div>

      {/* Drill Drawer */}
      <div className={cn('fixed inset-0 z-[1000] bg-black/30', drillOpen ? 'block' : 'hidden')} onClick={e => { if(e.target === e.currentTarget) setDrillOpen(false); }}>
        <div className={cn('fixed bottom-0 right-0 top-0 w-[380px] max-w-[92vw] overflow-y-auto bg-card p-[22px] shadow-2xl transition-transform duration-200 ease-out', drillOpen ? 'translate-x-0' : 'translate-x-full')}>
          <div className="mb-3.5 flex items-center justify-between">
            <div className="text-[15px] font-bold text-foreground">{drillTitle}</div>
            <span className="cursor-pointer text-[15px] text-muted-foreground" onClick={() => setDrillOpen(false)}>&#x2715;</span>
          </div>
          {drillList.length ? drillList.map((item, idx) => (
            <div key={idx} className="border-b border-border py-2.5 last:border-0">
              <div className="mb-1 text-[12.5px] font-semibold text-foreground">{item.title}</div>
              <div className="flex flex-wrap items-center gap-1.5">
                {item.badges.map((b, bi) => <Badge key={bi} className={b.cls}>{b.text}</Badge>)}
                {item.sub && <span className="text-[11px] text-muted-foreground">{item.sub}</span>}
                {item.score != null && <span className="text-[11px] font-bold" style={{color:sColor(item.score)}}>{item.score}%</span>}
              </div>
            </div>
          )) : <div className="p-5 text-center text-xs text-muted-foreground">No items in this category</div>}
        </div>
      </div>

      {/* Power BI Modal */}
      <div className={cn('fixed inset-0 z-[1000] items-center justify-center bg-black/40', pbiOpen ? 'flex' : 'hidden')} onClick={e => { if(e.target === e.currentTarget) setPbiOpen(false); }}>
        <div className="w-[1020px] max-w-[96vw] overflow-hidden rounded-xl bg-card p-0 shadow-2xl" style={{height:640,maxHeight:'92vh'}}>
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
                    <div style={{padding:6,flex:1,minHeight:0}}><div className="relative h-full w-full"><Doughnut data={pbiDonutData} options={pbiDonutOpts}/></div></div>
                  </div>
                  <div style={{background:'#fff',borderRadius:6,overflow:'hidden',display:'flex',flexDirection:'column'}}>
                    <div style={{background:'linear-gradient(90deg,#5a2a6e,#7d3a8c)',color:'#fff',fontSize:11,fontWeight:700,textAlign:'center',padding:5,flexShrink:0}}>Distribution of Return Value</div>
                    <div style={{padding:6,flex:1,minHeight:0}}><div className="relative h-full w-full"><Bar data={pbiBarData} options={pbiBarOpts}/></div></div>
                  </div>
                  <div style={{background:'#fff',borderRadius:6,overflow:'hidden',display:'flex',flexDirection:'column'}}>
                    <div style={{background:'linear-gradient(90deg,#5a2a6e,#7d3a8c)',color:'#fff',fontSize:11,fontWeight:700,textAlign:'center',padding:5,flexShrink:0}}>Violations by Division</div>
                    <div style={{padding:6,flex:1,minHeight:0}}><div className="relative h-full w-full"><Bar data={pbiHbarData} options={pbiHbarOpts}/></div></div>
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
