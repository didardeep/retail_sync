import { useState, useEffect } from 'react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, loadSession } from '../api/client';
import { Loading } from '@/components/Loader';
import StorePicker from '@/components/StorePicker';
import { StoreView } from '@/components/store-dashboard/StoreView';
import { avC, sColor, sBadge, pbClass, prC, stC } from '../utils/helpers';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Drawer } from '../components/Modal';
import { auditsLink, issuesLink, sopDashboardLink, storesLink, storeScorecardLink } from '@/lib/links';
import {
  UNASSIGNED_REGION, averageScore, bucketScoredStores, formatAverages, groupAuditsByRegion,
  groupObservationsByRisk, legacyStageCounts, rankScored, scoreFor, scoreStores,
} from '@/lib/overviewStats';
import SopDashboard from './SopDashboard';

// `picker` is the store selector rendered by Dashboard; it sits in the header.
function OverviewDashboard({ picker }) {
  const navigate = useNavigate();
  const role = loadSession()?.user?.role;
  const [obsTab, setObsTab] = useState('top');
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillTitle, setDrillTitle] = useState('');
  const [drillList, setDrillList] = useState([]);
  const [drillLink, setDrillLink] = useState(null);
  const [pbiOpen, setPbiOpen] = useState(false);

  // API data
  const [stores, setStores] = useState([]);
  const [issues, setIssues] = useState([]);
  const [observations, setObservations] = useState([]);
  const [audits, setAudits] = useState([]);
  const [scoreMap, setScoreMap] = useState({});
  const [selectedQ, setSelectedQ] = useState('q4');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.stores().catch(() => []),
      api.issues().catch(() => []),
      api.observations().catch(() => []),
      api.audits().catch(() => []),
      api.storeScores().catch(() => []),
    ]).then(([s, i, o, a, scores]) => {
      setStores(s || []);
      setIssues(i || []);
      setObservations(o || []);
      setAudits(a || []);
      const map = {};
      for (const sc of (scores || [])) map[sc.store_id] = sc;
      setScoreMap(map);
      setLoading(false);
    });
  }, []);

  // Everything below is derived from live data for the selected quarter, and
  // every donut slice, legend entry and drill list comes from the same helper
  // output (lib/overviewStats.js), so a number always equals its clicked list.
  const { scored, unscored } = scoreStores(stores, scoreMap, selectedQ);
  const ranked = rankScored(scored);
  const qLabel = selectedQ.toUpperCase();

  // KPI tiles count classic (checklist) audits only and link to the Audit page
  // with kind=legacy, so the tile number equals the number of rows shown there.
  // Approved is its own tile because the Audit page keeps it as its own stage.
  const stageCounts = legacyStageCounts(audits);

  // Real trend: average of every store quarterly score (stores with no score are skipped).
  const trendScores = ['q1', 'q2', 'q3', 'q4'].map(q => {
    const avg = averageScore(Object.keys(scoreMap).map(id => scoreFor(scoreMap, id, q)).filter(v => v !== null));
    return avg === null ? null : Math.round(avg);
  });

  const trendData = {
    labels: ['Q1','Q2','Q3','Q4'],
    datasets: [
      { label:'Current', data:trendScores, borderColor:'#00338D', backgroundColor:'rgba(0,51,141,.08)', borderWidth:2.5, tension:.4, pointRadius:3, fill:true },
      { label:'Benchmark', data:[90,90,90,90], borderColor:'#9ca3af', borderDash:[5,5], borderWidth:1.5, pointRadius:0, fill:false }
    ]
  };
  const trendOpts = { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'top',labels:{font:{size:11},boxWidth:12}}}, scales:{y:{min:50,max:100,ticks:{font:{size:10}}},x:{ticks:{font:{size:10}}}} };

  // Risk distribution: observations grouped by their risk level (four levels
  // plus Unrated for blank/unrecognised text). The drawer lists the same group.
  const RISK_COLORS = {Critical:'#9b1c1c',High:'#e02424',Medium:'#f59e0b',Low:'#0e9f6e',Unrated:'#9ca3af'};
  const riskD = groupObservationsByRisk(observations).map(g => ({...g, l:g.level, c:RISK_COLORS[g.level]}));
  const riskData = { labels:riskD.map(d=>d.l), datasets:[{data:riskD.map(d=>d.count),backgroundColor:riskD.map(d=>d.c),borderWidth:2,borderColor:'#fff'}] };
  const donutOpts = (cutout, onClick) => ({ responsive:true, maintainAspectRatio:false, cutout, plugins:{legend:{display:false},tooltip:{intersect:true,titleFont:{size:13},bodyFont:{size:13},padding:10,displayColors:true}}, onClick:(evt,els)=>{if(els.length && onClick) onClick(els[0].index);} });

  // Store bar chart: top 7 scored stores for the selected quarter.
  const storeBarD = ranked.slice(0,7).map(e => ({l: e.store.name?.substring(0,12) || e.store.id, v: e.score, id: e.store.id}));
  const storeBarData = { labels:storeBarD.map(d=>d.l), datasets:[{data:storeBarD.map(d=>d.v),backgroundColor:storeBarD.map(d=>d.v>=77?'#0e9f6e':'#f59e0b'),borderRadius:4}] };
  const storeBarOpts = { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{min:50,max:100,ticks:{font:{size:10}}},x:{ticks:{font:{size:10}}}}, onClick:(evt,els)=>{ if(els.length){ const d=storeBarD[els[0].index]; if(d?.id) navigate(storeScorecardLink(d.id, role)); } } };

  // Region distribution: counts classic audits per audit region. The slice,
  // the legend count and the drawer list all come from the same group.
  const regColors = ['#00338D','#0e9f6e','#f59e0b','#e02424','#8b5cf6','#06b6d4'];
  const regD = groupAuditsByRegion(audits).map((g, i) => ({...g, l:g.region, c:regColors[i % regColors.length]}));
  const regData = { labels:regD.map(d=>d.l), datasets:[{data:regD.map(d=>d.count),backgroundColor:regD.map(d=>d.c),borderWidth:2,borderColor:'#fff'}] };
  // Centre figure: average of the scores of exactly those audits that have one.
  const regionScores = audits.map(a => a.score).filter(v => typeof v === 'number');
  const regionAvg = averageScore(regionScores);

  // Format averages over scored stores only (unscored stores are not zeros).
  const fmtColors = {COCO:'#00338D',COFO:'#06b6d4',FOCO:'#f59e0b',FOFO:'#8b5cf6'};
  const fmtD = formatAverages(stores, scoreMap, selectedQ).map(f => ({ l: f.format, v: f.avg, n: f.scoredCount, c: fmtColors[f.format] || '#6b7280' }));
  const fmtScored = fmtD.filter(d => d.v !== null);
  const fmtData = { labels:fmtScored.map(d=>d.l), datasets:[{data:fmtScored.map(d=>d.v),backgroundColor:fmtScored.map(d=>d.c),borderRadius:5}] };
  const fmtOpts = { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{min:50,max:100,ticks:{font:{size:10}}},x:{ticks:{font:{size:10}}}} };

  // Score distribution: one bucket per scored store; unscored stores are
  // excluded from the donut and listed separately as "Not scored".
  const BUCKET_COLORS = ['#0e9f6e','#84cc16','#f59e0b','#f97316','#e02424'];
  const distD = bucketScoredStores(scored).map((b, i) => ({...b, l:b.label, c:BUCKET_COLORS[i]}));
  const distData = { labels:distD.map(d=>d.l), datasets:[{data:distD.map(d=>d.count),backgroundColor:distD.map(d=>d.c),borderWidth:2,borderColor:'#fff'}] };

  // Top/Bottom stores: scored stores only.
  const toRow = e => ({n:`${e.store.name}, ${e.store.city}`, v:`${e.score}%`, id:e.store.id});
  const t5 = ranked.slice(0,5).map(toRow);
  const b5 = ranked.slice(-5).reverse().map(toRow);

  // Top observations from DB
  const topObservations = [...new Set(observations.map(o => o.observation))].slice(0,5);
  const repeatObservations = issues.slice(0,5).map(i => i.title);

  // Recent issues from DB
  const recentIssues = issues.slice(0,3);

  // drill handlers
  const BADGE_OPERATING = 'bg-emerald-50 text-emerald-700';
  const BADGE_GRAY = 'bg-muted text-muted-foreground border border-border';
  function openRiskDrill(idx) {
    const g = riskD[idx];
    setDrillTitle(`${g.l} Risk Observations (${g.count})`);
    setDrillList(g.items.map(o => ({ title: o.observation || '--', badges:[], sub: o.store || '' })));
    setDrillLink(null);
    setDrillOpen(true);
  }
  function openRegionDrill(idx) {
    const g = regD[idx];
    setDrillTitle(`${g.l} Audits (${g.count})`);
    setDrillList(g.items.map(a => ({ title:`${a.store}, ${a.city||''}`, badges:[{text:a.status,cls:sBadge(a.status)}], sub:a.scheduled_at, score:typeof a.score === 'number' ? a.score : null })));
    setDrillLink(g.l === UNASSIGNED_REGION ? null : auditsLink({ region: g.l, kind: 'legacy' }));
    setDrillOpen(true);
  }
  function storeDrillItem(s, score) {
    return { title:`${s.name}, ${s.city}`, badges:[{text:s.status,cls:s.status==='Operating'?BADGE_OPERATING:BADGE_GRAY}], sub:score == null ? 'Not scored' : null, score, id:s.id };
  }
  function openDistDrill(idx) {
    const b = distD[idx];
    setDrillTitle(`Stores Scoring ${b.l}% in ${qLabel} (${b.count})`);
    setDrillList(b.items.map(e => storeDrillItem(e.store, e.score)));
    setDrillLink(storesLink({}));
    setDrillOpen(true);
  }
  function openUnscoredDrill() {
    setDrillTitle(`Stores Not Scored in ${qLabel} (${unscored.length})`);
    setDrillList(unscored.map(s => storeDrillItem(s, null)));
    setDrillLink(storesLink({}));
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
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground">Loading dashboard data...</div>;
  }

  return (
    <>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div><h2 className="text-xl font-bold text-foreground">Audit Operations</h2><p className="mt-0.5 text-xs text-muted-foreground">Consolidated View &bull; {selectedQ.toUpperCase()}</p></div>
        <div className="flex flex-wrap items-center gap-1.5">
          {picker}
          {['q1','q2','q3','q4'].map(q => (
            <Button key={q} size="sm" variant={selectedQ === q ? 'default' : 'outline'} onClick={() => setSelectedQ(q)}>{q.toUpperCase()}</Button>
          ))}
          <Button size="sm" onClick={() => setPbiOpen(true)}>Power BI (sample preview)</Button>
        </div>
      </div>

      {/* KPIs: classic (checklist) audits; same rows as the Audit page with kind=legacy */}
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
        {[
          { label: 'Planned', stage: 'scheduled', bg: '#e8eefa', icon: '\u{1F4CB}' },
          { label: 'Ongoing', stage: 'in_progress', bg: '#fffbeb', icon: '\u23F3' },
          { label: 'Completed', stage: 'completed', bg: '#ecfdf5', icon: '\u2705' },
          { label: 'Approved', stage: 'approved', bg: '#ecfdf5', icon: '\u2714' },
        ].map(k => (
          <div key={k.stage} className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4 hover:bg-accent/40" onClick={() => navigate(auditsLink({ stage: k.stage, kind: 'legacy' }))}>
            <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{background:k.bg}}>{k.icon}</div>
            <div><div className="mb-0.5 text-[11px] text-muted-foreground">{k.label} <span className="text-[10px]">(checklist audits)</span></div><div className="text-2xl font-bold leading-none text-foreground">{stageCounts[k.stage]}</div></div>
          </div>
        ))}
      </div>

      {/* Row 1: Trend + Risk */}
      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between text-[13px] font-semibold text-foreground">Average store score by quarter<span className="text-[11px] font-normal text-muted-foreground">Benchmark: 90%</span></div>
          <div className="relative h-[190px] w-full"><Line data={trendData} options={trendOpts}/></div>
        </div>
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="mb-3 text-[13px] font-semibold text-foreground">All Observations by Risk<span className="ml-2 text-[11px] font-normal text-muted-foreground">{observations.length} total</span></div>
          <div className="flex h-[190px] items-center justify-center gap-4">
            <div className="relative h-[155px] w-[155px] shrink-0">
              {riskD.length ? <Doughnut data={riskData} options={donutOpts('62%', openRiskDrill)}/> : null}
            </div>
            <div className="text-[11.5px]">
              {riskD.length ? riskD.map(d => (
                <div key={d.l} className="mb-1.5 flex cursor-pointer items-center gap-1.5" onClick={() => openRiskDrill(riskD.indexOf(d))}>
                  <span className="inline-block h-[9px] w-[9px] rounded-sm" style={{background:d.c}}/>
                  {d.l}: <b>{d.pct}% ({d.count})</b>
                </div>
              )) : <div className="text-xs text-muted-foreground">No observations yet</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Store bars + Region */}
      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="mb-3 text-[13px] font-semibold text-foreground">Store-wise Compliance Score (%)<span className="ml-2 text-[11px] font-normal text-muted-foreground">{qLabel}, top 7 of {scored.length} scored</span></div>
          {storeBarD.length ? <div className="relative h-[190px] w-full"><Bar data={storeBarData} options={storeBarOpts}/></div> : <div className="flex h-[190px] items-center justify-center text-xs text-muted-foreground">No stores scored in {qLabel}</div>}
        </div>
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="mb-3 text-[13px] font-semibold text-foreground">Audit Distribution by Region<span className="ml-2 text-[11px] font-normal text-muted-foreground">{audits.length} checklist audits</span></div>
          <div className="flex h-[190px] items-center justify-center gap-3.5">
            <div className="relative h-[150px] w-[150px] shrink-0">
              {regD.length ? <Doughnut data={regData} options={donutOpts('58%', openRegionDrill)}/> : null}
            </div>
            <div className="text-[11.5px]">
              <div className="mb-1 text-[17px] font-bold">{regionAvg !== null ? regionAvg + '%' : '--'}</div>
              <div className="mb-2 text-[10px] text-muted-foreground">Avg audit score ({regionScores.length} of {audits.length} scored)</div>
              {!regD.length && <div className="text-xs text-muted-foreground">No audits yet</div>}
              {regD.map(d => (
                <div key={d.l} className="mb-1 flex cursor-pointer items-center gap-1.5" onClick={() => openRegionDrill(regD.indexOf(d))}>
                  <span className="inline-block h-[9px] w-[9px] rounded-sm" style={{background:d.c}}/>
                  <span className="text-[11.5px]">{d.l}: <b>{d.pct}% ({d.count})</b></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Format + Distribution */}
      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="mb-3 text-[13px] font-semibold text-foreground">Store Format Performance (Avg. Score, {qLabel})</div>
          <div className="flex gap-4.5">
            <div className="flex-1">{fmtScored.length ? <Bar data={fmtData} options={fmtOpts} height={145}/> : <div className="flex h-[145px] items-center justify-center text-xs text-muted-foreground">No scored stores in {qLabel}</div>}</div>
            <div className="min-w-[155px] text-xs">
              <div className="mb-2 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Format Summary</div>
              {fmtD.map(d => (
                <div key={d.l} className="mb-1 cursor-pointer border-b border-gray-200 pb-1 hover:opacity-80" onClick={() => navigate(storesLink({ format: d.l }))}>
                  <div className="mb-1 flex justify-between">
                    <span className="text-gray-500">{d.l} Average ({d.n} scored)</span><b style={{color:d.c}}>{d.v === null ? 'Not scored' : `${d.v}%`}</b>
                  </div>
                  <div className="h-[5px] overflow-hidden rounded-[3px] bg-gray-200"><div className="h-full rounded-[3px]" style={{width:`${d.v || 0}%`,background:d.c}}/></div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="mb-3 text-[13px] font-semibold text-foreground">Store Score Distribution ({qLabel})</div>
          <div className="flex h-[185px] items-center justify-center gap-3">
            <div className="relative h-[145px] w-[145px] shrink-0">
              {scored.length ? <Doughnut data={distData} options={donutOpts('58%', openDistDrill)}/> : null}
            </div>
            <div className="text-[11.5px]">
              {!scored.length && <div className="mb-1 text-xs text-muted-foreground">No stores scored in {qLabel}</div>}
              {scored.length > 0 && distD.map(d => (
                <div key={d.l} className="mb-1 flex cursor-pointer items-center gap-1.5" onClick={() => openDistDrill(distD.indexOf(d))}>
                  <span className="inline-block h-[9px] w-[9px] rounded-sm" style={{background:d.c}}/>
                  <span className="text-[11.5px]">{d.l}: <b>{d.count}</b></span>
                </div>
              ))}
              <div className="mt-1 cursor-pointer text-[11px] text-muted-foreground hover:underline" onClick={openUnscoredDrill}>Not scored: <b>{unscored.length}</b></div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 4: Scorecards + Observations */}
      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="mb-3 text-[13px] font-semibold text-foreground">Store Scorecards</div>
          <div className="flex gap-4.5">
            <div className="flex-1">
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider" style={{color:'var(--green)'}}>&#x1F3C6; Top 5 Stores</div>
              {!t5.length && <div className="py-2 text-xs text-muted-foreground">No stores scored in {qLabel}</div>}
              {t5.map(s => { const v = parseInt(s.v); return (
                <div key={s.n} className={cn('flex cursor-pointer items-center justify-between border-b border-border py-1 text-xs last:border-0', s.id && 'hover:bg-accent/40')} onClick={() => s.id && navigate(storeScorecardLink(s.id, role))}>
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
              {!b5.length && <div className="py-2 text-xs text-muted-foreground">No stores scored in {qLabel}</div>}
              {b5.map(s => { const v = parseInt(s.v); return (
                <div key={s.n} className={cn('flex cursor-pointer items-center justify-between border-b border-border py-1 text-xs last:border-0', s.id && 'hover:bg-accent/40')} onClick={() => s.id && navigate(storeScorecardLink(s.id, role))}>
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
          {obsTab === 'top' && !topObservations.length && <div className="p-3 text-center text-xs text-muted-foreground">No observations yet</div>}
          {obsTab === 'repeat' && !repeatObservations.length && <div className="p-3 text-center text-xs text-muted-foreground">No issues yet</div>}
          {obsTab === 'top' && topObservations.map(o => (
            <div key={o} className="flex items-start gap-1.5 border-b border-border py-1.5 text-xs text-foreground/80 last:border-0"><div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{background:'var(--orange)'}}/><div>{o}</div></div>
          ))}
          {obsTab === 'repeat' && repeatObservations.map(o => (
            <div key={o} className="flex items-start gap-1.5 border-b border-border py-1.5 text-xs text-foreground/80 last:border-0"><div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{background:'var(--red)'}}/><div>{o}</div></div>
          ))}
        </div>
      </div>

      {/* Row 5: Recent Issues */}
      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="self-start rounded-[10px] border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between text-[13px] font-semibold text-foreground">Recent Issues<span className="cursor-pointer text-[11px] font-normal text-muted-foreground" onClick={() => navigate('/issues')}>View all &rarr;</span></div>
          {recentIssues.length ? recentIssues.map((i, idx) => (
            <div key={i.id} className={cn('flex cursor-pointer items-center justify-between gap-2.5 py-2', idx < recentIssues.length - 1 && 'border-b border-border')} onClick={() => navigate(issuesLink({ id: i.id }))}>
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
      <Drawer open={drillOpen} onClose={() => setDrillOpen(false)}>
        <div className="mb-3.5 flex items-center justify-between">
          <div className="text-[15px] font-bold text-foreground">{drillTitle}</div>
          <span className="cursor-pointer text-[15px] text-muted-foreground" onClick={() => setDrillOpen(false)}>&#x2715;</span>
        </div>
        {drillLink && (
          <button className="mb-3 text-xs text-primary hover:underline" onClick={() => { setDrillOpen(false); navigate(drillLink); }}>View all &rarr;</button>
        )}
        {drillList.length ? drillList.map((item, idx) => (
          <div key={idx} className={cn('border-b border-border py-2.5 last:border-0', item.id && 'cursor-pointer hover:bg-accent/40')} onClick={() => item.id && navigate(storeScorecardLink(item.id, role))}>
            <div className="mb-1 text-[12.5px] font-semibold text-foreground">{item.title}</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {item.badges.map((b, bi) => <Badge key={bi} className={b.cls}>{b.text}</Badge>)}
              {item.sub && <span className="text-[11px] text-muted-foreground">{item.sub}</span>}
              {item.score != null && <span className="text-[11px] font-bold" style={{color:sColor(item.score)}}>{item.score}%</span>}
            </div>
          </div>
        )) : <div className="p-5 text-center text-xs text-muted-foreground">No items in this category</div>}
      </Drawer>

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
                <span style={{marginRight:'auto',fontSize:11,fontWeight:600,color:'#b45309'}}>SAMPLE DATA - illustrative preview, not connected to Power BI or your stores</span>
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
                <span style={{padding:'3px 7px'}}>Preview: KPI 3</span>
                <span style={{padding:'3px 7px'}}>KPI 1 Summary</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'sop', label: 'SOP Audits' },
];

// Dashboard & Analytics: the original overview plus the SOP audit scores.
// The tab lives in the URL (?tab=sop) so links and the back button work.
// The store selector (?store=<id>) swaps the chain-wide Overview for one
// store's view; with ?tab=sop the SOP tab keeps its own store filter instead.
export default function Dashboard() {
  const [params, setParams] = useSearchParams();
  const role = loadSession()?.user?.role;
  const requested = params.get('tab');
  const tab = TABS.some((t) => t.value === requested) ? requested : 'overview';
  const storeId = params.get('store') || '';
  const [stores, setStores] = useState(null);

  useEffect(() => {
    api.stores().catch(() => []).then((s) => setStores(s || []));
  }, []);

  function changeTab(value) {
    // Filters belong to a tab, so switching tabs starts clean.
    setParams(value === 'overview' ? {} : { tab: value }, { replace: true });
  }

  function changeStore(value) {
    setParams(value ? { store: value } : {}, { replace: true });
  }

  const picker = (
    <StorePicker stores={stores || []} value={storeId} onChange={changeStore} allowAll />
  );

  if (tab === 'overview' && storeId) {
    if (stores === null) return <Loading what="store" />;
    const store = stores.find((s) => s.id === storeId);
    if (store) {
      return (
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
            <div>
              <h2 className="text-xl font-bold text-foreground">Audit Operations</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {store.name}{store.city ? `, ${store.city}` : ''}{store.region ? ` - ${store.region}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link to={sopDashboardLink({ store: store.id })} className="text-xs text-primary hover:underline">
                Open SOP scores for this store
              </Link>
              {picker}
            </div>
          </div>
          <StoreView key={store.id} store={store} role={role} />
        </div>
      );
    }
  }

  return (
    <Tabs value={tab} onValueChange={changeTab} className="space-y-4">
      <TabsList>
        {TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
      </TabsList>
      <TabsContent value="overview" className="mt-0"><OverviewDashboard picker={picker} /></TabsContent>
      <TabsContent value="sop" className="mt-0"><SopDashboard /></TabsContent>
    </Tabs>
  );
}
