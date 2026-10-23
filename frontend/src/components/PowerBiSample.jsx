import { Bar, Doughnut } from 'react-chartjs-2';
import { cn } from '@/lib/utils';

const pbiDonutData = { labels:['Eligible Return','Ineligible SKU','Late Return'], datasets:[{data:[252,138,3],backgroundColor:['#2f4b9e','#0e9f8e','#cbd5e1'],borderWidth:2,borderColor:'#fff'}] };
const pbiDonutOpts = { responsive:true, maintainAspectRatio:false, cutout:'62%', plugins:{legend:{position:'bottom',labels:{font:{size:9},boxWidth:8,padding:8}},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${ctx.parsed}K`}}} };
const pbiBarData = { labels:['Eligible Return','Ineligible SKU','Late Return','Total'], datasets:[{data:[46.01,18.20,2.38,66.59],backgroundColor:['#0e9f8e','#0e9f8e','#0e9f8e','#1b3a6b'],borderRadius:3}] };
const pbiBarOpts = { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.parsed.y}M`}}}, scales:{y:{ticks:{font:{size:9},callback:v=>v+'M'}},x:{ticks:{font:{size:9}}}} };
const pbiHbarData = { labels:['Fresh','Grocery Non Food','BDF','Staples','Grocery Food','Apparels','General Merchandise','Others','CDIT'], datasets:[{data:[65148,53837,17202,3247,1203,153,103,38,1],backgroundColor:'#1b3a6b',borderRadius:2}] };
const pbiHbarOpts = { indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{ticks:{font:{size:8}}},y:{ticks:{font:{size:9}}}} };

// The "Power BI (sample preview)" window: illustrative static data, not connected to anything.
export default function PowerBiSample({ open, onClose }) {
  return (
  <div className={cn('fixed inset-0 z-[1000] items-center justify-center bg-black/40', open ? 'flex' : 'hidden')} onClick={e => { if(e.target === e.currentTarget) onClose(); }}>
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
            <span style={{cursor:'pointer',color:'var(--text3)',fontSize:15}} onClick={() => onClose()}>&#x2715;</span>
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
  );
}
