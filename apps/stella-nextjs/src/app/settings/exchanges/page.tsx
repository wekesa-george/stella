"use client";

import { useState } from "react";
import Image from "next/image";

const EXCHANGES_DATA = [
  { id: "binance", name: "Binance", color: "#C99400", bg: "#C9940018", abbr: "BN", status: "connected", apiKey: "BNCE-••••-••••-••••-3f2a", rateLimit: 1200, pairs: 47, env: "live", lastPing: "1s ago", fees: "0.02/0.04" },
  { id: "bybit", name: "Bybit", color: "#00e5a0", bg: "#00e5a018", abbr: "BY", status: "connected", apiKey: "BYBT-••••-••••-••••-9c1d", rateLimit: 600, pairs: 31, env: "live", lastPing: "2s ago", fees: "0.01/0.06" },
  { id: "okx", name: "OKX", color: "#3d9df3", bg: "#3d9df318", abbr: "OK", status: "connected", apiKey: "OKEX-••••-••••-••••-7b3e", rateLimit: 1000, pairs: 28, env: "live", lastPing: "3s ago", fees: "0.02/0.05" },
  { id: "kraken", name: "Kraken", color: "#8B5CF6", bg: "#8B5CF618", abbr: "KR", status: "degraded", apiKey: "KRKN-••••-••••-••••-2d1f", rateLimit: 60, pairs: 19, env: "live", lastPing: "18s ago", fees: "0.16/0.26" },
  { id: "kucoin", name: "Kucoin", color: "#21A179", bg: "#21A17918", abbr: "KC", status: "connected", apiKey: "KUCN-••••-••••-••••-5a8c", rateLimit: 600, pairs: 22, env: "live", lastPing: "2s ago", fees: "0.10/0.10" },
  { id: "binance_t", name: "Binance Testnet", color: "#7a6200", bg: "#7a620018", abbr: "BT", status: "connected", apiKey: "BNTST-••••-••••-8812", rateLimit: 1200, pairs: 47, env: "sandbox", lastPing: "5s ago", fees: "0/0" },
];

export default function ExchangeManagementPage() {
  const [exs, setExs] = useState(EXCHANGES_DATA);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testedOk, setTestedOk] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  function test(id: string) {
    setTesting((p) => ({ ...p, [id]: true }));
    setTimeout(() => {
      setTesting((p) => ({ ...p, [id]: false }));
      setTestedOk((p) => ({ ...p, [id]: true }));
    }, 1500);
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-[1100px]">
      {/* Page Header */}
      <div className="mb-1">
        <div className="font-mono text-[11px] md:text-[13px] font-semibold text-[#e8edf3] tracking-wider mb-1">Exchange Management</div>
        <div className="font-mono text-[10px] text-[#5a7090]">
          API credentials, rate limits, and connection health per connected exchange.
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[#0d1117] border border-[#1e2d40] border-t-2 border-t-[#00e5a0] rounded px-3.5 py-3">
          <div className="font-mono text-[8px] uppercase tracking-wider text-[#5a7090] mb-1">Connected</div>
          <div className="font-mono text-[20px] font-semibold text-[#00e5a0]">5</div>
          <div className="font-mono text-[8px] text-[#5a7090] mt-0.5">1 sandbox</div>
        </div>
        <div className="bg-[#0d1117] border border-[#1e2d40] border-t-2 border-t-[#f5a623] rounded px-3.5 py-3">
          <div className="font-mono text-[8px] uppercase tracking-wider text-[#5a7090] mb-1">Degraded</div>
          <div className="font-mono text-[20px] font-semibold text-[#f5a623]">1</div>
          <div className="font-mono text-[8px] text-[#5a7090] mt-0.5">Kraken · high latency</div>
        </div>
        <div className="bg-[#0d1117] border border-[#1e2d40] border-t-2 border-t-[#3d9df3] rounded px-3.5 py-3">
          <div className="font-mono text-[8px] uppercase tracking-wider text-[#5a7090] mb-1">Total Pairs</div>
          <div className="font-mono text-[20px] font-semibold text-[#3d9df3]">147</div>
          <div className="font-mono text-[8px] text-[#5a7090] mt-0.5">Across all exchanges</div>
        </div>
        <div className="bg-[#0d1117] border border-[#1e2d40] border-t-2 border-t-[#00e5a0] rounded px-3.5 py-3">
          <div className="font-mono text-[8px] uppercase tracking-wider text-[#5a7090] mb-1">Avg Latency</div>
          <div className="font-mono text-[20px] font-semibold text-[#e8edf3]">84ms</div>
          <div className="font-mono text-[8px] text-[#5a7090] mt-0.5">Last 5 min avg</div>
        </div>
      </div>

      {/* Exchange Cards */}
      {exs.map((ex) => (
        <div key={ex.id} className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden" style={{ borderTop: `2px solid ${ex.color}` }}>
          <div
            className="px-4 py-3 border-b border-[#1e2d40] cursor-pointer"
            onClick={() => setExpanded(expanded === ex.id ? null : ex.id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 overflow-hidden relative"
                  style={{ background: ex.bg }}
                >
                  <Image
                    src={`/exchanges/${ex.id}.png`}
                    alt={`${ex.name} logo`}
                    width={28}
                    height={28}
                    className="object-contain"
                    onError={(e) => {
                      // Fallback to initials if logo not found
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const parent = target.parentElement;
                      if (parent) {
                        parent.innerHTML = `<span class="font-mono text-[10px] font-bold" style="color: ${ex.color}">${ex.abbr}</span>`;
                      }
                    }}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] font-semibold text-[#e8edf3]">{ex.name}</span>
                    <StatusDot status={ex.status} />
                    <span
                      className={`px-2 py-0.5 rounded-sm font-mono text-[9px] font-bold uppercase tracking-wide ${
                        ex.status === "connected"
                          ? "bg-[rgba(0,229,160,0.10)] text-[#00e5a0]"
                          : ex.status === "degraded"
                          ? "bg-[rgba(245,166,35,0.10)] text-[#f5a623]"
                          : "bg-[rgba(255,71,87,0.10)] text-[#ff4757]"
                      }`}
                    >
                      {ex.status}
                    </span>
                    {ex.env === "sandbox" && (
                      <span className="px-2 py-0.5 rounded-sm bg-[rgba(34,211,238,0.10)] text-[#22d3ee] font-mono text-[9px] font-bold uppercase tracking-wide">
                        Sandbox
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[9px] text-[#5a7090] mt-0.5">
                    {ex.pairs} pairs · Last ping {ex.lastPing} · Fees {ex.fees}% maker/taker
                  </div>
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <button
                  className="px-3 py-1.5 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] hover:border-[#253550] transition-all"
                  onClick={(e) => {
                    e.stopPropagation();
                    test(ex.id);
                  }}
                >
                  {testing[ex.id] ? "Testing…" : testedOk[ex.id] ? "✓ Healthy" : "Test"}
                </button>
                <span className="font-mono text-[11px] text-[#5a7090]">{expanded === ex.id ? "▲" : "▼"}</span>
              </div>
            </div>
          </div>

          {expanded === ex.id && (
            <div className="px-4 py-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="flex flex-col gap-3">
                  <Field label="API Key">
                    <div className="flex gap-1.5 items-center">
                      <div className="flex-1 bg-[#131920] border border-[#1e2d40] text-[#5a7090] font-mono text-[10px] px-2.5 py-1.5 rounded overflow-hidden text-ellipsis whitespace-nowrap">
                        {revealed[ex.id + "-key"] ? `LIVE-KEY-${ex.id.toUpperCase()}-EXAMPLE` : ex.apiKey}
                      </div>
                      <button
                        className="px-2 py-1 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] transition-all"
                        onClick={() => setRevealed((p) => ({ ...p, [ex.id + "-key"]: !p[ex.id + "-key"] }))}
                      >
                        {revealed[ex.id + "-key"] ? "Hide" : "Reveal"}
                      </button>
                    </div>
                  </Field>
                  <Field label="API Secret">
                    <div className="flex gap-1.5 items-center">
                      <div className="flex-1 bg-[#131920] border border-[#1e2d40] text-[#5a7090] font-mono text-[10px] px-2.5 py-1.5 rounded">
                        ••••••••••••••••••••••••••••••••••••
                      </div>
                      <button className="px-2 py-1 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] transition-all">
                        Rotate
                      </button>
                    </div>
                  </Field>
                  <Field label="Passphrase (if required)">
                    <div className="flex gap-1.5 items-center">
                      <div className="flex-1 bg-[#131920] border border-[#1e2d40] text-[#5a7090] font-mono text-[10px] px-2.5 py-1.5 rounded">
                        ••••••••
                      </div>
                      <button className="px-2 py-1 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] transition-all">
                        Update
                      </button>
                    </div>
                  </Field>
                </div>

                {/* Right Column */}
                <div className="flex flex-col gap-3">
                  <Field label="Rate Limit (requests/min)" hint="Maximum API calls per minute to this exchange.">
                    <input
                      className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                      type="number"
                      defaultValue={ex.rateLimit}
                    />
                  </Field>
                  <Field label="Environment">
                    <select
                      className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full cursor-pointer"
                      defaultValue={ex.env}
                    >
                      <option value="live">Live / Production</option>
                      <option value="sandbox">Sandbox / Testnet</option>
                    </select>
                  </Field>
                  <Field label="Max Open Orders" hint="Hard limit on simultaneous open orders on this exchange.">
                    <input
                      className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                      type="number"
                      defaultValue={200}
                    />
                  </Field>
                </div>
              </div>

              <div className="h-px bg-[#1e2d40] my-3.5" />

              <div className="flex gap-2 justify-end">
                <button className="px-3 py-1.5 rounded border bg-[rgba(255,71,87,0.10)] text-[#ff4757] border-[rgba(255,71,87,0.3)] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#ff4757] hover:text-white transition-all">
                  Disconnect
                </button>
                <button className="px-3 py-1.5 rounded border bg-[rgba(0,229,160,0.10)] text-[#00e5a0] border-[rgba(0,229,160,0.3)] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#00e5a0] hover:text-black transition-all">
                  Save Changes
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Add Exchange */}
      <div className="border border-dashed border-[#253550] rounded p-4.5 flex items-center justify-center gap-3">
        <span className="font-mono text-[11px] text-[#5a7090]">Connect a new exchange — Bitget, MEXC, Deribit, Hyperliquid…</span>
        <button className="px-3 py-1.5 rounded border bg-[rgba(0,229,160,0.10)] text-[#00e5a0] border-[rgba(0,229,160,0.3)] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#00e5a0] hover:text-black transition-all">
          + Add Exchange
        </button>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const col = status === "connected" ? "#00e5a0" : status === "degraded" ? "#f5a623" : "#ff4757";
  return <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: col, flexShrink: 0 }} />;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] flex items-center gap-1.5">{label}</div>
      {children}
      {hint && <div className="font-mono text-[9px] text-[#3a5068]">{hint}</div>}
    </div>
  );
}
