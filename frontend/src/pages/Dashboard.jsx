import { useState, useEffect, useMemo } from 'react';
import { Doughnut, Bar } from 'react-chartjs-2';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, loadSession } from '../api/client';
import { Loading } from '@/components/Loader';
import ScopePicker from '@/components/ScopePicker';
import PowerBiSample from '@/components/PowerBiSample';
import BrandTrendCard from '@/components/dashboard/BrandTrendCard';
import ObservationsCard from '@/components/dashboard/ObservationsCard';
import { StoreView } from '@/components/store-dashboard/StoreView';
import { avC, sColor, sBadge, pbClass, prC, stC } from '../utils/helpers';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Drawer } from '../components/Modal';
import { auditsLink, issuesLink, storesLink, storeScorecardLink } from '@/lib/links';
import { QUARTERS } from '@/lib/storeStats';
import {
  RISK_COLORS, UNASSIGNED_REGION, averageScore, bucketScoredStores, formatAverages, groupAuditsByRegion,
  auditStageCounts, groupObservationsByRisk, rankScored, scoreStores,
} from '@/lib/overviewStats';
import {
  inScope, resolveScope, scopeFromParams, scopeParams, scopeTitle, storesInScope, wording,
} from '@/lib/dashboardScope';

// The sections for all brands or for one brand. Everything passed in is already
// limited to the stores in scope, so every number here equals the list it opens.
function OverviewBody({ scope, brandName, brands, allBrands, stores, scoreMap, issues, observations, audits, selectedQ }) {
  const navigate = useNavigate();
  const role = loadSession()?.user?.role;
  const words = wording(scope, brandName);
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillTitle, setDrillTitle] = useState('');
  const [drillList, setDrillList] = useState([]);
  const [drillLink, setDrillLink] = useState(null);

  const { scored, unscored } = scoreStores(stores, scoreMap, selectedQ);
  const ranked = rankScored(scored);
  const qLabel = selectedQ.toUpperCase();

  // KPI tiles link to the Audit page filtered by stage, so the tile number
  // equals the number of rows shown there. Approved is its own tile because
  // the Audit page keeps it as its own stage.
  const stageCounts = auditStageCounts(audits);

  // Risk distribution: observations grouped by their risk level (four levels
  // plus Unrated for blank/unrecognised text). The drawer lists the same group.
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

  // Recent issues for the scope (the API returns them newest first).
  const recentIssues = issues.slice(0, 5);

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
    setDrillLink(g.l === UNASSIGNED_REGION ? null : auditsLink({ region: g.l }));
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
  return (
    <>
      {/* KPIs: same rows as the Audit page for the same stage */}
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
        {[
          { label: 'Planned', stage: 'scheduled', bg: '#e8eefa', icon: '\u{1F4CB}' },
          { label: 'Ongoing', stage: 'in_progress', bg: '#fffbeb', icon: '\u23F3' },
          { label: 'Completed', stage: 'completed', bg: '#ecfdf5', icon: '\u2705' },
          { label: 'Approved', stage: 'approved', bg: '#ecfdf5', icon: '\u2714' },
        ].map(k => (
          <div key={k.stage} className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-border bg-card p-3.5 py-4 hover:bg-accent/40" onClick={() => navigate(auditsLink({ stage: k.stage }))}>
            <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-base" style={{background:k.bg}}>{k.icon}</div>
            <div><div className="mb-0.5 text-[11px] text-muted-foreground">{k.label}</div><div className="text-2xl font-bold leading-none text-foreground">{stageCounts[k.stage]}</div></div>
          </div>
        ))}
      </div>

      {/* Row 1: Trend + Risk */}
      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
        <BrandTrendCard title={words.trend} allBrands={allBrands} brands={brands} stores={stores} />
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="mb-3 text-[13px] font-semibold text-foreground">{words.risk}<span className="ml-2 text-[11px] font-normal text-muted-foreground">{observations.length} total</span></div>
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
      {/* Row 2: Store bars + Region */}
      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="mb-3 text-[13px] font-semibold text-foreground">{words.storeBars}<span className="ml-2 text-[11px] font-normal text-muted-foreground">{qLabel}, top 7 of {scored.length} scored</span></div>
          {storeBarD.length ? <div className="relative h-[190px] w-full"><Bar data={storeBarData} options={storeBarOpts}/></div> : <div className="flex h-[190px] items-center justify-center text-xs text-muted-foreground">No stores scored in {qLabel}</div>}
        </div>
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="mb-3 text-[13px] font-semibold text-foreground">{words.region}<span className="ml-2 text-[11px] font-normal text-muted-foreground">{audits.length} checklist audits</span></div>
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
      {/* Row 3: Format + Distribution */}
      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="mb-3 text-[13px] font-semibold text-foreground">{words.format}<span className="ml-2 text-[11px] font-normal text-muted-foreground">{qLabel}</span></div>
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
          <div className="mb-3 text-[13px] font-semibold text-foreground">{words.distribution}<span className="ml-2 text-[11px] font-normal text-muted-foreground">{qLabel}</span></div>
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
          <div className="mb-3 text-[13px] font-semibold text-foreground">{words.topBottom}<span className="ml-2 text-[11px] font-normal text-muted-foreground">{qLabel}</span></div>
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
        <ObservationsCard scope={scope} observations={observations} issues={issues} />
      </div>

      {/* Row 5: Recent issues */}
      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="self-start rounded-[10px] border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between text-[13px] font-semibold text-foreground">{words.issues}<span className="cursor-pointer text-[11px] font-normal text-muted-foreground" onClick={() => navigate('/issues')}>View all &rarr;</span></div>
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
    </>
  );
}

// Dashboard & Analytics: one outline for every scope. The heading names what is
// shown and the selector beside it picks all brands, one brand or one store
// (?brand=<id> or ?store=<id>); the sections below follow the selection.
export default function Dashboard() {
  const [params, setParams] = useSearchParams();
  const role = loadSession()?.user?.role;
  const [data, setData] = useState(null);
  const [selectedQ, setSelectedQ] = useState('q4');
  const [pbiOpen, setPbiOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      api.stores().catch(() => []),
      api.brands().catch(() => []),
      api.issues().catch(() => []),
      api.observations().catch(() => []),
      api.audits().catch(() => []),
      api.storeScores().catch(() => []),
    ]).then(([stores, brands, issues, observations, audits, scores]) => {
      const scoreMap = {};
      for (const sc of (scores || [])) scoreMap[sc.store_id] = sc;
      setData({
        stores: stores || [], brands: brands || [], issues: issues || [],
        observations: observations || [], audits: audits || [], scoreMap,
      });
    });
  }, []);

  const stores = data?.stores;
  const brands = data?.brands;
  const scope = useMemo(
    () => (data ? resolveScope(scopeFromParams(params), stores, brands) : { kind: 'all', id: '' }),
    [data, params, stores, brands],
  );
  const scoped = useMemo(() => (data ? storesInScope(stores, scope) : []), [data, stores, scope]);

  if (!data) return <Loading what="dashboard" />;

  const brandName = brands.find((b) => b.id === scope.id)?.name || '';
  const shownBrands = brands.filter((b) => scoped.some((s) => s.brand_id === b.id));
  const store = scope.kind === 'store' ? scoped[0] : null;

  return (
    <div>
      <div className="mb-4 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-foreground">{scopeTitle(scope, stores, brands)}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {store
                ? `${store.brand || 'No brand'}${store.format ? ` - format ${store.format}` : ''}`
                : `${scoped.length} ${scoped.length === 1 ? 'store' : 'stores'}${scope.kind === 'all' ? ` in ${shownBrands.length} ${shownBrands.length === 1 ? 'brand' : 'brands'}` : ''}`}
              {' - '}{selectedQ.toUpperCase()}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <ScopePicker
              brands={brands}
              stores={stores}
              scope={scope}
              onChange={(next) => setParams(scopeParams(next), { replace: true })}
            />
            <div className="flex gap-1.5">
              {QUARTERS.map((q) => (
                <Button key={q} size="sm" className="h-11" variant={selectedQ === q ? 'default' : 'outline'} onClick={() => setSelectedQ(q)}>{q.toUpperCase()}</Button>
              ))}
            </div>
            <Button size="sm" className="h-11" variant="outline" onClick={() => setPbiOpen(true)}>Power BI (sample preview)</Button>
          </div>
        </div>
      </div>

      {store ? (
        <StoreView key={store.id} store={store} role={role} quarter={selectedQ} />
      ) : (
        <OverviewBody
          key={scope.kind + scope.id}
          scope={scope}
          brandName={brandName}
          brands={shownBrands}
          allBrands={brands}
          stores={scoped}
          scoreMap={data.scoreMap}
          issues={inScope(data.issues, scoped)}
          observations={inScope(data.observations, scoped)}
          audits={inScope(data.audits, scoped)}
          selectedQ={selectedQ}
        />
      )}

      <PowerBiSample open={pbiOpen} onClose={() => setPbiOpen(false)} />
    </div>
  );
}
