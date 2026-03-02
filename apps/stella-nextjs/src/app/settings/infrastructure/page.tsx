"use client";

import { useState } from "react";

const JOBS_DATA = [
  { name: "Fee Calculation", desc: "Calculates and records platform fees per user", cron: "0 1 * * *", lastRun: "2h ago", nextRun: "22h", status: "ok" },
  { name: "Document Expiry Scan", desc: "Flags KYC documents expiring within 30 days", cron: "0 8 * * *", lastRun: "16h ago", nextRun: "8h", status: "ok" },
  { name: "AML Watchlist Refresh", desc: "Re-screens all users against updated lists", cron: "0 3 * * 0", lastRun: "3d ago", nextRun: "4d", status: "ok" },
  { name: "Metrics Aggregation", desc: "Aggregates hourly metrics into daily summaries", cron: "5 0 * * *", lastRun: "2h ago", nextRun: "22h", status: "ok" },
  { name: "Position Reconciliation", desc: "Reconciles bot positions against exchange state", cron: "*/15 * * * *", lastRun: "3m ago", nextRun: "12m", status: "ok" },
  { name: "Inactive Bot Cleanup", desc: "Archives bots with no activity for 30+ days", cron: "0 4 1 * *", lastRun: "18d ago", nextRun: "13d", status: "warn" },
];

const FEATURE_FLAGS = [
  { key: "multi_exchange_arbitrage", name: "Multi-Exchange Arbitrage", desc: "Allow bots to execute cross-exchange arbitrage simultaneously", prod: true, staging: true, dev: true },
  { key: "enhanced_due_diligence", name: "Enhanced Due Diligence KYC", desc: "Require enhanced KYC for accounts above 10M UGX AUM", prod: true, staging: true, dev: true },
  { key: "auto_circuit_breaker", name: "Auto Circuit Breaker", desc: "Automatically pause all bots when platform drawdown exceeds threshold", prod: true, staging: true, dev: true },
  { key: "user_api_access", name: "User API Access", desc: "Allow Pro/Enterprise users to connect external tools via API", prod: false, staging: true, dev: true },
  { key: "websocket_v2", name: "WebSocket v2 Protocol", desc: "New optimised WebSocket protocol with binary framing", prod: false, staging: false, dev: true },
  { key: "referral_programme", name: "Referral Programme", desc: "Enable referral code generation and commission tracking", prod: false, staging: true, dev: true },
  { key: "strategy_marketplace", name: "Strategy Marketplace", desc: "Allow users to publish and subscribe to community strategies", prod: false, staging: false, dev: false },
];

export default function InfrastructurePage() {
  const [envFilter, setEnvFilter] = useState("prod");
  const [dirty, setDirty] = useState(false);

  const handleSave = () => {
    setDirty(false);
    // In real app, save to API
  };

  const handleDiscard = () => {
    setDirty(false);
    // In real app, reset to original values
  };

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-[1100px]">
      {/* Page Header */}
      <div className="mb-1">
        <div className="font-mono text-[11px] md:text-[13px] font-semibold text-[#e8edf3] tracking-wider mb-1">Infrastructure & Performance</div>
        <div className="font-mono text-[10px] text-[#5a7090]">
          Connection pools, cache policy, background jobs, and feature flags.
        </div>
      </div>

      {/* Connection pools */}
      <div className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#8fa3b8]">Connection Pool Sizes</div>
          <div className="text-[11px] text-[#5a7090] mt-0.5">Requires service restart to take effect</div>
        </div>
        <div className="px-4 py-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[
              ["PostgreSQL Pool Size", 20, "Connections kept open to the primary DB."],
              ["TimescaleDB Pool Size", 10, "Connections for time-series metrics DB."],
              ["Redis Max Connections", 50, "Maximum concurrent Redis connections."],
              ["RabbitMQ Channel Pool", 25, "Pre-opened AMQP channels per node."],
            ].map(([label, def, hint]) => (
              <Field key={label as string} label={label as string} hint={hint as string}>
                <input
                  className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                  type="number"
                  defaultValue={def as number}
                  onChange={() => setDirty(true)}
                />
              </Field>
            ))}
          </div>
        </div>
      </div>

      {/* Cache TTLs */}
      <div className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#8fa3b8]">Cache TTL Policy (seconds)</div>
        </div>
        <div className="px-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {[
              ["Bot state", 5],
              ["User profile", 300],
              ["KYC status", 900],
              ["Exchange prices", 1],
              ["Analytics aggregates", 3600],
              ["Subscription tier", 600],
            ].map(([label, def]) => (
              <Field key={label as string} label={label as string}>
                <input
                  className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                  type="number"
                  defaultValue={def as number}
                  onChange={() => setDirty(true)}
                />
              </Field>
            ))}
          </div>
        </div>
      </div>

      {/* Background jobs */}
      <div className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#8fa3b8]">Background Jobs</div>
        </div>
        <div className="p-0">
          <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_80px] px-3.5 py-2 border-b border-[#1e2d40] bg-[#131920]">
            {["Job", "Schedule", "Last Run", "Next Run", "Status"].map((h) => (
              <div key={h} className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090]">
                {h}
              </div>
            ))}
          </div>
          {JOBS_DATA.map((j) => (
            <div key={j.name} className="grid grid-cols-[1.5fr_1fr_1fr_1fr_80px] px-3.5 py-2.5 border-b border-[#1e2d40] last:border-b-0 items-center">
              <div>
                <div className="font-mono text-[10px] font-semibold text-[#e8edf3]">{j.name}</div>
                <div className="font-mono text-[8px] text-[#5a7090] mt-0.5">{j.desc}</div>
              </div>
              <div>
                <span className="font-mono text-[9px] text-[#22d3ee] bg-[rgba(34,211,238,0.10)] px-1.5 py-0.5 rounded-sm">
                  {j.cron}
                </span>
              </div>
              <div className="font-mono text-[10px] text-[#5a7090]">{j.lastRun}</div>
              <div className="font-mono text-[10px] text-[#5a7090]">{j.nextRun}</div>
              <div className="flex gap-1.5">
                <span
                  className={`px-2 py-0.5 rounded-sm font-mono text-[9px] font-bold uppercase tracking-wide ${
                    j.status === "ok" ? "bg-[rgba(0,229,160,0.10)] text-[#00e5a0]" : "bg-[rgba(245,166,35,0.10)] text-[#f5a623]"
                  }`}
                >
                  {j.status}
                </span>
                <button className="px-1.5 py-0.5 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[8px] font-semibold hover:bg-[#1a2230] hover:text-[#e8edf3] transition-all">
                  ▶
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Feature flags */}
      <div className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40] flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#8fa3b8]">Feature Flags</div>
          <div className="flex gap-1.5">
            {["prod", "staging", "dev"].map((e) => (
              <button
                key={e}
                className={`px-2 py-0.5 rounded border font-mono text-[8px] font-semibold uppercase tracking-wide transition-all ${
                  envFilter === e
                    ? "bg-[rgba(61,157,243,0.10)] text-[#3d9df3] border-[rgba(61,157,243,0.3)]"
                    : "border-[#1e2d40] bg-transparent text-[#8fa3b8] hover:bg-[#1a2230] hover:text-[#e8edf3]"
                }`}
                onClick={() => setEnvFilter(e)}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <div>
          {FEATURE_FLAGS.map((f) => (
            <div key={f.key} className="px-3.5 py-2.5 border-b border-[#1e2d40] last:border-b-0 flex items-center justify-between">
              <div>
                <div className="font-mono text-[11px] text-[#e8edf3] font-medium">{f.name}</div>
                <div className="font-mono text-[9px] text-[#5a7090] mt-0.5">{f.desc}</div>
              </div>
              <div className="flex items-center gap-3.5">
                <div className="flex gap-1.5 mr-3.5">
                  {["prod", "staging", "dev"].map((e) => (
                    <span
                      key={e}
                      className="px-2 py-0.5 rounded-sm font-mono text-[8px] font-semibold uppercase tracking-wide border transition-opacity"
                      style={{
                        background: f[e as keyof typeof f] ? "rgba(0,229,160,0.10)" : "#1a2230",
                        color: f[e as keyof typeof f] ? "#00e5a0" : "#5a7090",
                        borderColor: f[e as keyof typeof f] ? "rgba(0,229,160,0.2)" : "#1e2d40",
                        opacity: envFilter === e ? 1 : 0.4,
                      }}
                    >
                      {e}
                    </span>
                  ))}
                </div>
                <Toggle checked={f[envFilter as keyof typeof f] as boolean} onChange={() => setDirty(true)} />
              </div>
            </div>
          ))}
        </div>
        {dirty && (
          <div className="px-4 py-2.5 border-t border-[#1e2d40] flex gap-2 justify-end bg-[#131920]">
            <button
              onClick={handleDiscard}
              className="px-3 py-1.5 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] hover:border-[#253550] transition-all"
            >
              Discard Changes
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1.5 rounded border bg-[rgba(255,215,0,0.10)] text-[#FFD700] border-[rgba(255,215,0,0.3)] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#FFD700] hover:text-black transition-all"
            >
              Save Changes
            </button>
          </div>
        )}
      </div>
    </div>
  );
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

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative w-9 h-5 flex-shrink-0 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="opacity-0 w-0 h-0" />
      <span
        className={`absolute inset-0 rounded-full border transition-all duration-200 ${
          checked ? "bg-[rgba(255,215,0,0.10)] border-[rgba(255,215,0,0.4)]" : "bg-[#1a2230] border-[#253550]"
        }`}
      >
        <span
          className={`absolute h-3.5 w-3.5 rounded-full transition-all duration-200 left-0.5 top-0.5 ${
            checked ? "translate-x-4 bg-[#FFD700]" : "translate-x-0 bg-[#5a7090]"
          }`}
        />
      </span>
    </label>
  );
}
