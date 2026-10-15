"use client";

import { useState } from "react";

// DESIGN TOKENS
const C = {
  bg:         "#0B0D11",
  surface:    "#12151C",
  surfaceAlt: "#0E111A",
  surfaceHov: "#161B26",
  border:     "#1C2338",
  borderSub:  "#161B28",
  green:      "#00E5A0",
  greenDim:   "#00E5A012",
  greenMid:   "#00E5A035",
  red:        "#F04F59",
  redDim:     "#F04F5912",
  amber:      "#F59E0B",
  textPri:    "#C8CDE0",
  textMid:    "#A0AAC0",
  textMuted:  "#8B95B0",
  textDim:    "#6A7590",
};
const mono = "'JetBrains Mono', 'Fira Code', monospace";

// MOCK DATA
const OPEN_POSITIONS = [
  { id:1, bot:"Momentum Alpha", pair:"BTC/USDT", side:"LONG",  exchange:"Binance",
    entry:97420.50, current:98840.00, qty:0.028, value:2767.52,
    unrealPnl:+39.74, pnlPct:+1.46, held:"2h 14m", slPrice:96500, tpPrice:99800,
    strategy:"Core Momentum", confidence:0.84, momentum:0.62, energy:"releasing",
    openedAt:"2026-02-19 08:28", botId:"bot-1" },
  { id:2, bot:"Momentum Alpha", pair:"ETH/USDT", side:"LONG",  exchange:"Binance",
    entry:3180.20, current:3156.40, qty:0.42, value:1325.69,
    unrealPnl:-9.99, pnlPct:-0.75, held:"41m",    slPrice:3100, tpPrice:3280,
    strategy:"Core Momentum", confidence:0.71, momentum:0.38, energy:"accumulating",
    openedAt:"2026-02-19 10:03", botId:"bot-1" },
  { id:3, bot:"Mean Rev Grid",  pair:"ETH/USDT", side:"SHORT", exchange:"Binance",
    entry:3210.00, current:3156.40, qty:0.20, value:631.28,
    unrealPnl:+10.72, pnlPct:+1.67, held:"1h 03m", slPrice:3260, tpPrice:3120,
    strategy:"Core Mean Reversion", confidence:0.77, momentum:-0.41, energy:"releasing",
    openedAt:"2026-02-19 09:41", botId:"bot-2" },
  { id:4, bot:"DCA Accumulator", pair:"BTC/USDT", side:"LONG", exchange:"Binance",
    entry:96200.00, current:98840.00, qty:0.012, value:1186.08,
    unrealPnl:+31.68, pnlPct:+2.74, held:"18h 32m", slPrice:93000, tpPrice:102000,
    strategy:"Core DCA", confidence:null, momentum:null, energy:null,
    openedAt:"2026-02-18 16:12", botId:"bot-5" },
];

const CLOSED_POSITIONS = [
  { id:10, bot:"Momentum Alpha", pair:"BTC/USDT", side:"LONG",  exchange:"Binance",
    entry:96900, exit:97810, qty:0.030, realPnl:+112.20, pnlPct:+2.91,
    held:"55m", exitReason:"strategy_signal", closedAt:"2026-02-19 09:17" },
  { id:11, bot:"Mean Rev Grid",  pair:"ETH/USDT", side:"SHORT", exchange:"Binance",
    entry:3204.80, exit:3176.20, qty:0.40, realPnl:+28.60, pnlPct:+1.77,
    held:"34m", exitReason:"take_profit",   closedAt:"2026-02-19 08:52" },
  { id:12, bot:"Impulse Scalper",pair:"SOL/USDT", side:"LONG",  exchange:"Alpaca",
    entry:192.40, exit:195.80, qty:2.0, realPnl:+6.80, pnlPct:+3.52,
    held:"22m", exitReason:"take_profit",   closedAt:"2026-02-18 11:05" },
  { id:13, bot:"Momentum Alpha", pair:"BTC/USDT", side:"LONG",  exchange:"Binance",
    entry:97100, exit:96880, qty:0.025, realPnl:-22.60, pnlPct:-0.88,
    held:"1h 32m", exitReason:"stop_loss", closedAt:"2026-02-18 14:42" },
  { id:14, bot:"Mean Rev Grid",  pair:"ETH/USDT", side:"LONG",  exchange:"Binance",
    entry:3190.10, exit:3215.00, qty:0.40, realPnl:+16.80, pnlPct:+1.56,
    held:"3h 20m", exitReason:"take_profit", closedAt:"2026-02-18 12:25" },
  { id:15, bot:"Momentum Alpha", pair:"BTC/USDT", side:"SHORT", exchange:"Binance",
    entry:97320, exit:97010, qty:0.020, realPnl:+31.00, pnlPct:+1.31,
    held:"45m", exitReason:"strategy_signal", closedAt:"2026-02-17 17:29" },
  { id:16, bot:"Impulse Scalper",pair:"SOL/USDT", side:"LONG",  exchange:"Alpaca",
    entry:198.20, exit:196.10, qty:1.5, realPnl:-12.40, pnlPct:-1.58,
    held:"58m", exitReason:"stop_loss", closedAt:"2026-02-17 09:14" },
  { id:17, bot:"DCA Accumulator",pair:"BTC/USDT", side:"LONG",  exchange:"Binance",
    entry:95400, exit:97100, qty:0.010, realPnl:+17.00, pnlPct:+1.78,
    held:"2d 4h", exitReason:"take_profit", closedAt:"2026-02-16 11:00" },
];

// FORMAT HELPERS
const fmt = {
  usd:  (v: number) => (v >= 0 ? "+" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  abs:  (v: number) => "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2 }),
  pct:  (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%",
};

// COMPONENTS
function M({ size=11, color=C.textPri, weight=500, style={}, children }: any) {
  return <span style={{ fontFamily:mono, fontSize:size, color, fontWeight:weight, letterSpacing:"0.03em", ...style }}>{children}</span>;
}

function Lbl({ children, color=C.textMuted, style={} }: any) {
  return <M size={9} color={color} weight={600} style={{ letterSpacing:"0.13em", textTransform:"uppercase", ...style }}>{children}</M>;
}

function Div() {
  return <div style={{ height:1, background:C.borderSub }} />;
}

function VDiv() {
  return <div style={{ width:1, background:C.border, alignSelf:"stretch" }} />;
}

function Pill({ children, color=C.green, active=false, onClick }: any) {
  return (
    <button onClick={onClick} style={{ background:active?color+"18":"transparent",
      border:`1px solid ${active?color+"40":C.border}`, borderRadius:3, padding:"5px 12px",
      fontFamily:mono, fontSize:9, letterSpacing:"0.1em", textTransform:"uppercase",
      color:active?color:C.textMuted, cursor:"pointer", fontWeight:active?700:500 }}>
      {children}
    </button>
  );
}

function Tag({ children, color=C.green }: any) {
  return <span style={{ background:color+"18", border:`1px solid ${color}35`, borderRadius:2,
    padding:"2px 7px", fontFamily:mono, fontSize:9, color, fontWeight:700, letterSpacing:"0.1em" }}>{children}</span>;
}

function SideDot({ side, size=7 }: any) {
  const c = side === "LONG" ? C.green : C.red;
  return <span style={{ width:size, height:size, borderRadius:"50%", background:c, display:"inline-block", flexShrink:0 }} />;
}

function GhostBtn({ children, onClick, small=false, danger=false }: any) {
  return (
    <button onClick={onClick} style={{ background:"transparent",
      border:`1px solid ${danger?C.red+"40":C.border}`, borderRadius:3,
      padding:small?"6px 12px":"9px 16px", fontFamily:mono,
      fontSize:small?9:10, letterSpacing:"0.1em", textTransform:"uppercase",
      color:danger?C.red:C.textMuted, cursor:"pointer", fontWeight:600 }}>
      {children}
    </button>
  );
}

function Card({ children, style={} }: any) {
  return <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:4, ...style }}>{children}</div>;
}

function CardHeader({ title, sub }: any) {
  return (
    <>
      <div style={{ padding:"12px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <M size={11} weight={700} style={{ letterSpacing:"0.06em", display:"block" }}>{title}</M>
          {sub && <Lbl style={{ marginTop:3 }}>{sub}</Lbl>}
        </div>
      </div>
      <Div />
    </>
  );
}

function StatBox({ label, value, color=C.textPri }: any) {
  return (
    <div style={{ padding:"14px 18px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:4 }}>
      <Lbl>{label}</Lbl>
      <M size={20} color={color} weight={700} style={{ display:"block", marginTop:6, lineHeight:1 }}>{value}</M>
    </div>
  );
}

function PositionDetailPanel({ pos, onClose }: any) {
  const isUp = pos.unrealPnl !== undefined ? pos.unrealPnl >= 0 : pos.realPnl >= 0;
  const isOpen = pos.unrealPnl !== undefined;
  const isLong = pos.side === "LONG";
  const pnl = isOpen ? pos.unrealPnl : pos.realPnl;
  const pct = pos.pnlPct;

  return (
    <div style={{
      position:"fixed", top:0, right:0, bottom:0, width:440,
      background:C.surface, borderLeft:`1px solid ${C.border}`,
      zIndex:200, display:"flex", flexDirection:"column", animation:"slideIn 0.2s ease"
    }}>
      <div style={{
        padding:"16px 20px", borderBottom:`1px solid ${C.border}`,
        display:"flex", alignItems:"flex-start", justifyContent:"space-between"
      }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
            <SideDot side={pos.side} size={8} />
            <M size={14} weight={700}>{pos.pair}</M>
            <Tag color={isLong?C.green:C.red}>{pos.side}</Tag>
            {isOpen ? <Tag color={C.green}>LIVE</Tag> : <Tag color={C.textMuted}>CLOSED</Tag>}
          </div>
          <Lbl>{pos.bot} · {pos.exchange}</Lbl>
        </div>
        <button onClick={onClose} style={{
          background:"transparent", border:"none", color:C.textMuted,
          cursor:"pointer", fontFamily:mono, fontSize:20, padding:4
        }}>×</button>
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"18px 20px" }}>
        {/* P&L headline */}
        <div style={{
          background:C.surfaceAlt, border:`1px solid ${C.border}`, borderRadius:4,
          padding:"16px 18px", marginBottom:16
        }}>
          <Lbl>{isOpen ? "Unrealised P&L" : "Realised P&L"}</Lbl>
          <M size={28} color={isUp?C.green:C.red} weight={700} style={{ display:"block", marginTop:6, lineHeight:1 }}>
            {fmt.usd(pnl)}
          </M>
          <M size={12} color={isUp?C.green:C.red} style={{ display:"block", marginTop:4 }}>{fmt.pct(pct)}</M>
        </div>

        {/* Fields */}
        <Card style={{ marginBottom:16 }}>
          <div style={{ padding:"4px 16px" }}>
            {(isOpen ? [
              { l:"Entry Price",   v:"$"+pos.entry.toLocaleString("en-US",{minimumFractionDigits:2}) },
              { l:"Current Price", v:"$"+pos.current.toLocaleString("en-US",{minimumFractionDigits:2}), c:isUp?C.green:C.red },
              { l:"Quantity",      v:pos.qty },
              { l:"Position Value",v:fmt.abs(pos.value) },
              { l:"Stop Loss",     v:pos.slPrice?"$"+pos.slPrice.toLocaleString():"—", c:C.red },
              { l:"Take Profit",   v:pos.tpPrice?"$"+pos.tpPrice.toLocaleString():"—", c:C.green },
              { l:"Time Held",     v:pos.held },
              { l:"Opened At",     v:pos.openedAt },
              { l:"Strategy",      v:pos.strategy },
            ] : [
              { l:"Entry Price",   v:"$"+pos.entry.toLocaleString() },
              { l:"Exit Price",    v:"$"+pos.exit.toLocaleString(), c:isUp?C.green:C.red },
              { l:"Quantity",      v:pos.qty },
              { l:"Time Held",     v:pos.held },
              { l:"Exit Reason",   v:pos.exitReason?.replace(/_/g," ").toUpperCase(), c:
                pos.exitReason==="stop_loss"?C.red:pos.exitReason==="take_profit"?C.green:C.textPri },
              { l:"Closed At",     v:pos.closedAt },
            ]).map(({ l, v, c }, i, a) => (
              <div key={l}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 0" }}>
                  <Lbl>{l}</Lbl>
                  <M size={11} color={c||C.textPri} weight={600}>{String(v)}</M>
                </div>
                {i < a.length - 1 && <Div />}
              </div>
            ))}
          </div>
        </Card>

        {/* Physics params */}
        {isOpen && pos.momentum !== null && (
          <Card>
            <CardHeader title="Physics Model" sub="Stella momentum engine state" />
            <div style={{ padding:"12px 18px", display:"flex", flexDirection:"column", gap:10 }}>
              {[
                { l:"Signal Confidence", v:(pos.confidence*100).toFixed(0)+"%", c:C.green },
                { l:"Momentum Vector", v:pos.momentum.toFixed(2), c:pos.momentum>0?C.green:C.red },
                { l:"Energy State", v:pos.energy?.toUpperCase(), c:
                  pos.energy==="releasing"?C.green:pos.energy==="accumulating"?C.amber:C.textMid },
              ].map(({ l, v, c }) => (
                <div key={l} style={{ display:"flex", justifyContent:"space-between" }}>
                  <Lbl>{l}</Lbl><M size={11} color={c} weight={700}>{v}</M>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Action */}
        {isOpen && (
          <div style={{ marginTop:16 }}>
            <GhostBtn onClick={onClose} danger>Force Close Position</GhostBtn>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PositionsPage() {
  const [tab, setTab] = useState("open");
  const [sideF, setSideF] = useState("all");
  const [excF, setExcF] = useState("all");
  const [selected, setSelected] = useState<any>(null);

  const openPnl = OPEN_POSITIONS.reduce((s, p) => s + p.unrealPnl, 0);
  const realPnl = CLOSED_POSITIONS.filter(p => p.realPnl > 0).reduce((s, p) => s + p.realPnl, 0)
    - CLOSED_POSITIONS.filter(p => p.realPnl < 0).reduce((s, p) => s + Math.abs(p.realPnl), 0);

  const filterOpen = OPEN_POSITIONS.filter(p => {
    if (sideF !== "all" && p.side !== sideF) return false;
    if (excF !== "all" && p.exchange !== excF) return false;
    return true;
  });
  const filterClosed = CLOSED_POSITIONS.filter(p => {
    if (sideF !== "all" && p.side !== sideF) return false;
    if (excF !== "all" && p.exchange !== excF) return false;
    return true;
  });

  return (
    <div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        @keyframes slideIn { from{transform:translateX(30px);opacity:0;} to{transform:none;opacity:1;} }
      `}</style>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:20 }}>
        <div>
          <M size={16} weight={700} style={{ letterSpacing:"0.04em", display:"block" }}>Positions</M>
          <M size={10} color={C.textMuted} style={{ display:"block", marginTop:3 }}>
            {OPEN_POSITIONS.length} open · {CLOSED_POSITIONS.length} closed today
          </M>
        </div>
        <GhostBtn danger small>Force Close All</GhostBtn>
      </div>

      {/* Summary strip */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:18 }}>
        {[
          { l:"Open",          v:String(OPEN_POSITIONS.length),         c:C.textPri },
          { l:"Unrealised P&L", v:fmt.usd(openPnl),                    c:openPnl>=0?C.green:C.red },
          { l:"Closed Today",  v:String(CLOSED_POSITIONS.length),       c:C.textMid },
          { l:"Realised P&L",  v:fmt.usd(realPnl),                     c:realPnl>=0?C.green:C.red },
          { l:"Total Value",   v:fmt.abs(OPEN_POSITIONS.reduce((s,p)=>s+p.value,0)), c:C.textPri },
        ].map(s => (
          <StatBox key={s.l} label={s.l} value={s.v} color={s.c} />
        ))}
      </div>

      {/* Tabs + Filters */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, flexWrap:"wrap" }}>
        <div style={{ display:"flex", gap:0, border:`1px solid ${C.border}`, borderRadius:3, overflow:"hidden" }}>
          {[{ k:"open", label:"Open", n:OPEN_POSITIONS.length }, { k:"closed", label:"Closed", n:CLOSED_POSITIONS.length }].map(t => (
            <button key={t.k} onClick={() => setTab(t.k)} style={{
              padding:"7px 18px", background:tab===t.k?C.green+"18":"transparent",
              border:"none", borderRight:t.k==="open"?`1px solid ${C.border}`:"none",
              fontFamily:mono, fontSize:9, letterSpacing:"0.1em", textTransform:"uppercase",
              color:tab===t.k?C.green:C.textMuted, cursor:"pointer", fontWeight:tab===t.k?700:500,
              display:"flex", alignItems:"center", gap:6,
            }}>
              {t.label}
              <span style={{
                background:tab===t.k?C.green+"30":C.border, color:tab===t.k?C.green:C.textMuted,
                borderRadius:8, padding:"0 5px", fontSize:8, fontWeight:700
              }}>{t.n}</span>
            </button>
          ))}
        </div>
        <VDiv />
        {["all", "LONG", "SHORT"].map(s => (
          <Pill key={s} active={sideF === s} onClick={() => setSideF(s)}
            color={s === "LONG" ? C.green : s === "SHORT" ? C.red : C.textMuted}>
            {s === "all" ? "Both Sides" : s}
          </Pill>
        ))}
        <VDiv />
        {["all", "Binance", "Alpaca"].map(ex => (
          <Pill key={ex} active={excF === ex} onClick={() => setExcF(ex)}>
            {ex === "all" ? "All Exchanges" : ex}
          </Pill>
        ))}
      </div>

      {/* Table */}
      {tab === "open" ? (
        <Card>
          <div style={{
            display:"grid",
            gridTemplateColumns:"170px 70px 110px 110px 70px 90px 100px 110px 110px 80px",
            padding:"9px 18px", gap:0
          }}>
            {["Position", "Side", "Entry", "Current", "Qty", "Value", "Unreal. P&L", "SL", "TP", "Held"].map(h => (
              <Lbl key={h}>{h}</Lbl>
            ))}
          </div>
          <Div />
          {filterOpen.map((pos, i) => {
            const isUp = pos.unrealPnl >= 0;
            const isLong = pos.side === "LONG";
            return (
              <div key={pos.id}>
                <div onClick={() => setSelected(pos)} style={{
                  display:"grid",
                  gridTemplateColumns:"170px 70px 110px 110px 70px 90px 100px 110px 110px 80px",
                  padding:"11px 18px", gap:0, alignItems:"center", cursor:"pointer",
                  background:i%2===0?"transparent":C.surfaceAlt+"60", transition:"background 0.1s"
                }}
                  onMouseEnter={e => e.currentTarget.style.background = C.surfaceHov}
                  onMouseLeave={e => e.currentTarget.style.background = i%2===0?"transparent":C.surfaceAlt+"60"}>
                  <div>
                    <M size={11} weight={700}>{pos.pair}</M>
                    <M size={9} color={C.textDim} style={{ display:"block", marginTop:1 }}>{pos.bot}</M>
                  </div>
                  <Tag color={isLong?C.green:C.red}>{pos.side}</Tag>
                  <M size={11} color={C.textMid}>${pos.entry.toLocaleString("en-US",{minimumFractionDigits:2})}</M>
                  <M size={11} color={isUp?C.green:C.red} weight={600}>${pos.current.toLocaleString("en-US",{minimumFractionDigits:2})}</M>
                  <M size={11} color={C.textMid}>{pos.qty}</M>
                  <M size={11} color={C.textPri}>{fmt.abs(pos.value)}</M>
                  <M size={11} color={isUp?C.green:C.red} weight={700}>{fmt.usd(pos.unrealPnl)}</M>
                  <M size={10} color={C.red}>{pos.slPrice?"$"+pos.slPrice.toLocaleString():"—"}</M>
                  <M size={10} color={C.green}>{pos.tpPrice?"$"+pos.tpPrice.toLocaleString():"—"}</M>
                  <M size={10} color={C.textMuted}>{pos.held}</M>
                </div>
                {i < filterOpen.length - 1 && <Div />}
              </div>
            );
          })}
        </Card>
      ) : (
        <Card>
          <div style={{
            display:"grid",
            gridTemplateColumns:"170px 70px 100px 100px 70px 100px 100px 120px 120px",
            padding:"9px 18px", gap:0
          }}>
            {["Position", "Side", "Entry", "Exit", "Qty", "Realised P&L", "Return", "Exit Reason", "Closed"].map(h => (
              <Lbl key={h}>{h}</Lbl>
            ))}
          </div>
          <Div />
          {filterClosed.map((pos, i) => {
            const isUp = pos.realPnl >= 0;
            const isLong = pos.side === "LONG";
            const exitColor = pos.exitReason === "stop_loss" ? C.red : pos.exitReason === "take_profit" ? C.green : C.textMid;
            return (
              <div key={pos.id}>
                <div onClick={() => setSelected(pos)} style={{
                  display:"grid",
                  gridTemplateColumns:"170px 70px 100px 100px 70px 100px 100px 120px 120px",
                  padding:"11px 18px", gap:0, alignItems:"center", cursor:"pointer",
                  background:i%2===0?"transparent":C.surfaceAlt+"60", transition:"background 0.1s"
                }}
                  onMouseEnter={e => e.currentTarget.style.background = C.surfaceHov}
                  onMouseLeave={e => e.currentTarget.style.background = i%2===0?"transparent":C.surfaceAlt+"60"}>
                  <div>
                    <M size={11} weight={700}>{pos.pair}</M>
                    <M size={9} color={C.textDim} style={{ display:"block", marginTop:1 }}>{pos.bot} · {pos.held}</M>
                  </div>
                  <Tag color={isLong?C.green:C.red}>{pos.side}</Tag>
                  <M size={11} color={C.textMid}>${pos.entry.toLocaleString()}</M>
                  <M size={11} color={C.textPri} weight={600}>${pos.exit.toLocaleString()}</M>
                  <M size={11} color={C.textMid}>{pos.qty}</M>
                  <M size={11} color={isUp?C.green:C.red} weight={700}>{fmt.usd(pos.realPnl)}</M>
                  <M size={11} color={isUp?C.green:C.red}>{fmt.pct(pos.pnlPct)}</M>
                  <Tag color={exitColor}>{pos.exitReason?.replace(/_/g," ").toUpperCase()}</Tag>
                  <M size={9} color={C.textMuted}>{pos.closedAt}</M>
                </div>
                {i < filterClosed.length - 1 && <Div />}
              </div>
            );
          })}
        </Card>
      )}

      {selected && (
        <>
          <div onClick={() => setSelected(null)} style={{
            position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:199
          }} />
          <PositionDetailPanel pos={selected} onClose={() => setSelected(null)} />
        </>
      )}
    </div>
  );
}
