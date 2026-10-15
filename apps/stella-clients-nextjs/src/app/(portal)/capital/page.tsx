"use client";

import { useState } from "react";

const C = {
  bg:"#0B0D11", surface:"#12151C", surfaceAlt:"#0E111A", border:"#1C2338", borderSub:"#161B28",
  green:"#00E5A0", greenDim:"#00E5A012", greenMid:"#00E5A035",
  red:"#F04F59", amber:"#F59E0B",
  textPri:"#C8CDE0", textMid:"#A0AAC0", textMuted:"#8B95B0", textDim:"#6A7590",
};
const mono = "'JetBrains Mono','Fira Code',monospace";

const EXCHANGES = [
  {id:"binance",name:"Binance",logo:"B",logoColor:"#F0B90B",status:"connected",balance:12400,allocated:9500,available:2900,pairs:12,bots:4,lastSync:"12s ago",credentials:[{label:"Main API",status:"active",permissions:["read","trade"],expires:null,lastValidated:"2h ago"}]},
  {id:"alpaca",name:"Alpaca",logo:"A",logoColor:"#FF5733",status:"connected",balance:4200,allocated:1500,available:2700,pairs:6,bots:1,lastSync:"8s ago",credentials:[{label:"Paper Key",status:"active",permissions:["read","trade"],expires:null,lastValidated:"5h ago"}]},
  {id:"hyperliquid",name:"Hyperliquid",logo:"H",logoColor:"#6C63FF",status:"disconnected",balance:0,allocated:0,available:0,pairs:0,bots:0,lastSync:"never",credentials:[]},
];

const BOT_ALLOCATIONS = [
  {botId:"bot-1",botName:"Momentum Alpha",exchange:"Binance",strategy:"Core Momentum",allocated:5000,maxAlloc:8000,pnl:+1240,status:"running"},
  {botId:"bot-2",botName:"Mean Rev Grid",exchange:"Binance",strategy:"Core Mean Reversion",allocated:2500,maxAlloc:4000,pnl:+340,status:"running"},
  {botId:"bot-3",botName:"Impulse Scalper",exchange:"Alpaca",strategy:"Core Momentum",allocated:1500,maxAlloc:3000,pnl:+180,status:"paused"},
  {botId:"bot-5",botName:"DCA Accumulator",exchange:"Binance",strategy:"Core DCA",allocated:3000,maxAlloc:5000,pnl:+450,status:"running"},
];

const fmt = {
  usd: (v: number) => (v>=0?"+":"")+"$"+Math.abs(v).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}),
  abs: (v: number) => "$"+Math.abs(v).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}),
};

function M({size=11,color=C.textPri,weight=500,caps=false,style={},children}: any) {
  return <span style={{fontFamily:mono,fontSize:size,color,fontWeight:weight,letterSpacing:caps?"0.11em":"0.03em",textTransform:caps?"uppercase":"none" as any,...style}}>{children}</span>;
}
function Lbl({children,color=C.textMuted,style={}}: any) {
  return <M size={9} color={color} weight={600} caps style={{letterSpacing:"0.13em",...style}}>{children}</M>;
}
function Div() { return <div style={{height:1,background:C.borderSub}}/>; }

function PrimaryBtn({children,onClick,small=false}: any) {
  return <button onClick={onClick} style={{background:C.green,color:"#0A0D14",border:"none",borderRadius:3,padding:small?"6px 14px":"9px 20px",fontFamily:mono,fontSize:small?9:10,letterSpacing:"0.1em",textTransform:"uppercase" as any,fontWeight:700,cursor:"pointer"}}>{children}</button>;
}
function GhostBtn({children,onClick,small=false}: any) {
  return <button onClick={onClick} style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:3,padding:small?"5px 12px":"9px 16px",fontFamily:mono,fontSize:small?9:10,letterSpacing:"0.1em",textTransform:"uppercase" as any,color:C.textMuted,cursor:"pointer",fontWeight:600}}>{children}</button>;
}

function Card({children,style={}}: any) {
  return <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:4,...style}}>{children}</div>;
}

function CardHeader({title,sub,right}: any) {
  return (<><div style={{padding:"12px 18px",display:"flex",alignItems:"center",justifyContent:"space-between"}}><div><M size={11} weight={700} style={{letterSpacing:"0.06em",display:"block"}}>{title}</M>{sub&&<Lbl style={{marginTop:3}}>{sub}</Lbl>}</div>{right}</div><Div/></>);
}

function StatBox({label,value,color=C.textPri}: any) {
  return (<div style={{padding:"14px 18px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:4}}><Lbl>{label}</Lbl><M size={20} color={color} weight={700} style={{display:"block",marginTop:6,lineHeight:1}}>{value}</M></div>);
}

function Tag({children,color=C.green}: any) {
  return <span style={{background:color+"18",border:`1px solid ${color}35`,borderRadius:2,padding:"2px 7px",fontFamily:mono,fontSize:9,color,fontWeight:700,letterSpacing:"0.1em"}}>{children}</span>;
}

function AllocationBar({allocated,max,color=C.green}: any) {
  const pct=Math.min((allocated/max)*100,100);
  return (<div style={{position:"relative",height:6,background:C.border,borderRadius:3,overflow:"hidden"}}><div style={{position:"absolute",left:0,top:0,bottom:0,width:pct+"%",background:`linear-gradient(90deg,${color}90,${color})`,borderRadius:3,transition:"width 0.4s ease"}}/></div>);
}

function ExchangeCard({ex}: any) {
  const isConn=ex.status==="connected";
  const usedPct=ex.balance>0?(ex.allocated/ex.balance*100).toFixed(0):0;
  const logoColors: any={"B":"#F0B90B","A":"#FF5733","H":"#6C63FF"};
  const lc=logoColors[ex.logo];
  return (
    <Card>
      <div style={{padding:"14px 18px",display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:40,height:40,borderRadius:6,background:lc+"20",border:`1px solid ${lc}30`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:mono,fontSize:16,fontWeight:700,color:lc,flexShrink:0}}>{ex.logo}</div>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <M size={13} weight={700}>{ex.name}</M>
            <Tag color={isConn?C.green:C.textMuted}>{isConn?"CONNECTED":"DISCONNECTED"}</Tag>
          </div>
          <Lbl>Last sync: {ex.lastSync}</Lbl>
        </div>
        {isConn?<GhostBtn small>Manage</GhostBtn>:<PrimaryBtn small>Connect</PrimaryBtn>}
      </div>
      <Div/>

      {isConn?(
        <div style={{padding:"14px 18px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"12px 0",marginBottom:14}}>
            <div><Lbl>Total Balance</Lbl><M size={18} color={C.textPri} weight={700} style={{display:"block",marginTop:4}}>{fmt.abs(ex.balance)}</M></div>
            <div><Lbl>Allocated</Lbl><M size={18} color={C.green} weight={700} style={{display:"block",marginTop:4}}>{fmt.abs(ex.allocated)}</M></div>
            <div><Lbl>Available</Lbl><M size={18} color={C.textMid} weight={700} style={{display:"block",marginTop:4}}>{fmt.abs(ex.available)}</M></div>
          </div>
          <div style={{marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <Lbl>Allocation</Lbl>
              <M size={9} color={C.textMuted}>{usedPct}% of balance deployed</M>
            </div>
            <AllocationBar allocated={ex.allocated} max={ex.balance}/>
          </div>
          <div style={{display:"flex",gap:16,marginTop:12}}>
            <div style={{display:"flex",alignItems:"center",gap:5}}><Lbl>Bots</Lbl><M size={11} color={C.textPri}>{ex.bots}</M></div>
            <div style={{display:"flex",alignItems:"center",gap:5}}><Lbl>Pairs</Lbl><M size={11} color={C.textPri}>{ex.pairs}</M></div>
            {ex.credentials.map((cr: any)=>(<div key={cr.label} style={{display:"flex",alignItems:"center",gap:5}}><Lbl>Key</Lbl><Tag color={C.green}>{cr.status.toUpperCase()}</Tag></div>))}
          </div>
        </div>
      ):(
        <div style={{padding:"20px 18px",display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
          <M size={11} color={C.textMuted}>No credentials configured</M>
          <M size={10} color={C.textDim}>Connect this exchange to trade with it</M>
        </div>
      )}
    </Card>
  );
}

export default function CapitalPage() {
  const [showAdd,setShowAdd]=useState(false);
  const [allocations,setAllocations]=useState(Object.fromEntries(BOT_ALLOCATIONS.map(b=>[b.botId,b.allocated])));
  const totalBalance=EXCHANGES.filter(e=>e.status==="connected").reduce((s,e)=>s+e.balance,0);
  const totalAllocated=EXCHANGES.filter(e=>e.status==="connected").reduce((s,e)=>s+e.allocated,0);

  return (
    <div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        @keyframes slideIn{from{transform:translateX(30px);opacity:0}to{transform:none;opacity:1}}
        input[type=range]{-webkit-appearance:none;appearance:none}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:${C.green};border:2px solid ${C.bg};cursor:pointer;box-shadow:0 0 6px ${C.green}50}
      `}</style>

      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:20}}>
        <div>
          <M size={16} weight={700} style={{letterSpacing:"0.04em",display:"block"}}>Capital</M>
          <M size={10} color={C.textMuted} style={{display:"block",marginTop:3}}>Manage exchange connections and bot allocations</M>
        </div>
        <PrimaryBtn small onClick={()=>setShowAdd(true)}>+ Add Exchange</PrimaryBtn>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        {[
          {l:"Total Balance",v:fmt.abs(totalBalance),c:C.textPri},
          {l:"Total Deployed",v:fmt.abs(totalAllocated),c:C.green},
          {l:"Undeployed",v:fmt.abs(totalBalance-totalAllocated),c:C.textMid},
          {l:"Deployment Rate",v:((totalAllocated/totalBalance)*100).toFixed(0)+"%",c:C.green},
        ].map(s=><StatBox key={s.l} label={s.l} value={s.v} color={s.c}/>)}
      </div>

      <Card style={{marginBottom:20,padding:"14px 18px"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
          <M size={11} weight={700}>Overall Capital Deployment</M>
          <M size={10} color={C.textMuted}>{fmt.abs(totalAllocated)} of {fmt.abs(totalBalance)}</M>
        </div>
        <AllocationBar allocated={totalAllocated} max={totalBalance}/>
        <div style={{display:"flex",gap:20,marginTop:10}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:8,height:8,borderRadius:2,background:C.green}}/><M size={9} color={C.textMuted}>Allocated to bots</M></div>
          <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:8,height:8,borderRadius:2,background:C.border}}/><M size={9} color={C.textMuted}>Unallocated (available)</M></div>
        </div>
      </Card>

      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:24}}>
        {EXCHANGES.map(ex=><ExchangeCard key={ex.id} ex={ex}/>)}
      </div>

      <Card>
        <CardHeader title="Bot Capital Allocations" sub="Adjust how much each bot can trade with" right={<M size={9} color={C.textMuted}>Changes apply on next bot cycle</M>}/>
        <div style={{padding:"0 0 4px"}}>
          {BOT_ALLOCATIONS.map((bot,i)=>{
            const alloc=allocations[bot.botId]||bot.allocated;
            const pct=((alloc/bot.maxAlloc)*100).toFixed(0);
            const statusColor: any={running:C.green,paused:C.amber,error:C.red}[bot.status]||C.textDim;
            return (
              <div key={bot.botId}>
                <div style={{padding:"16px 18px"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:statusColor}}/>
                      <div>
                        <M size={12} weight={700}>{bot.botName}</M>
                        <M size={9} color={C.textMuted} style={{display:"block",marginTop:1}}>{bot.strategy} · {bot.exchange}</M>
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:16}}>
                      <div style={{textAlign:"right"}}>
                        <Lbl>P&L</Lbl>
                        <M size={12} color={bot.pnl>=0?C.green:C.red} weight={700} style={{display:"block",marginTop:2}}>{fmt.usd(bot.pnl)}</M>
                      </div>
                      <div style={{textAlign:"right",minWidth:80}}>
                        <Lbl>Allocated</Lbl>
                        <M size={13} color={C.textPri} weight={700} style={{display:"block",marginTop:2}}>{fmt.abs(alloc)}</M>
                      </div>
                    </div>
                  </div>
                  <div style={{position:"relative",marginBottom:8}}>
                    <div style={{height:6,background:C.border,borderRadius:3,overflow:"hidden",position:"relative"}}>
                      <div style={{position:"absolute",left:0,top:0,bottom:0,width:pct+"%",background:`linear-gradient(90deg,${statusColor}80,${statusColor})`,borderRadius:3,transition:"width 0.15s"}}/>
                    </div>
                    <input type="range" min={100} max={bot.maxAlloc} step={100} value={alloc}
                      onChange={e=>setAllocations(a=>({...a,[bot.botId]:Number(e.target.value)}))}
                      style={{position:"absolute",top:"50%",transform:"translateY(-50%)",left:0,right:0,width:"100%",appearance:"none",background:"transparent",margin:0,padding:0,height:20,cursor:"pointer"}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    <Lbl>$100</Lbl>
                    <M size={9} color={C.textMuted}>{pct}% of max ({fmt.abs(bot.maxAlloc)})</M>
                    <Lbl>{fmt.abs(bot.maxAlloc)}</Lbl>
                  </div>
                </div>
                {i<BOT_ALLOCATIONS.length-1&&<Div/>}
              </div>
            );
          })}
          <div style={{padding:"14px 18px",display:"flex",justifyContent:"flex-end",borderTop:`1px solid ${C.borderSub}`}}>
            <PrimaryBtn>Save Allocations</PrimaryBtn>
          </div>
        </div>
      </Card>

      {showAdd&&(<><div onClick={()=>setShowAdd(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:199}}/><div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:440,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,zIndex:200,animation:"slideIn 0.2s ease"}}><div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><M size={13} weight={700}>Add Exchange</M><button onClick={()=>setShowAdd(false)} style={{background:"transparent",border:"none",color:C.textMuted,cursor:"pointer",fontFamily:mono,fontSize:18}}>×</button></div><div style={{padding:"18px 20px",display:"flex",flexDirection:"column",gap:12}}>{[{name:"Binance",logo:"B",type:"API Key + Secret",lc:"#F0B90B"},{name:"Alpaca",logo:"A",type:"API Key + Secret",lc:"#FF5733"},{name:"Hyperliquid",logo:"H",type:"WalletConnect",lc:"#6C63FF"},{name:"Robinhood",logo:"R",type:"OAuth 2.0",lc:"#00C805"}].map(ex=>(<button key={ex.name} onClick={()=>setShowAdd(false)} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:4,cursor:"pointer",textAlign:"left" as any,width:"100%",transition:"border-color 0.15s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=ex.lc+"60"} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}><div style={{width:36,height:36,borderRadius:4,background:ex.lc+"20",border:`1px solid ${ex.lc}30`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:mono,fontSize:14,fontWeight:700,color:ex.lc}}>{ex.logo}</div><div><M size={12} weight={700} style={{display:"block"}}>{ex.name}</M><Lbl>{ex.type}</Lbl></div><M size={12} color={C.textDim} style={{marginLeft:"auto"}}>→</M></button>))}</div></div></>)}
    </div>
  );
}
