"use client";

import { useState } from "react";
import Image from "next/image";

// Provider configuration
const PROVIDERS = {
  sumsub: {
    name: "SumSub",
    color: "#0BA8E0",
    bg: "#0BA8E020",
    abbr: "SS",
    logo: "sumsub.png",
    docs: "https://developers.sumsub.com",
    workflows: ["standard-kyc", "enhanced-due-diligence", "poa-check", "liveness-only"],
    regions: ["East Africa", "Southern Africa"],
  },
  onfido: {
    name: "Onfido",
    color: "#3B46FF",
    bg: "#3B46FF20",
    abbr: "ON",
    logo: "Onfido.png",
    docs: "https://documentation.onfido.com",
    workflows: ["us-standard", "us-enhanced", "us-accredited-investor"],
    regions: ["United States"],
  },
  persona: {
    name: "Persona",
    color: "#7C5CFC",
    bg: "#7C5CFC20",
    abbr: "PS",
    logo: "persona.jpg",
    docs: "https://docs.withpersona.com",
    workflows: ["global-standard", "aml-enhanced"],
    regions: ["European Union", "Rest of World"],
  },
};

export default function ProvidersPage() {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [tested, setTested] = useState<Record<string, boolean>>({});
  const [role] = useState("Platform Admin"); // Would come from context/auth

  const isAdmin = role === "Platform Admin";

  function testConnection(key: string) {
    setTesting((p) => ({ ...p, [key]: true }));
    setTimeout(() => {
      setTesting((p) => ({ ...p, [key]: false }));
      setTested((p) => ({ ...p, [key]: true }));
    }, 1400);
  }

  const connectionStatus: Record<string, "connected" | "degraded" | "disconnected"> = {
    sumsub: "connected",
    onfido: "connected",
    persona: "degraded",
  };

  return (
    <div className="p-6 flex flex-col gap-5">
      {/* Info banner for non-admins */}
      {!isAdmin && (
        <div className="px-3 py-2 bg-[rgba(61,157,243,0.10)] border border-[rgba(61,157,243,0.2)] rounded font-mono text-[10px] text-[#3d9df3]">
          ℹ Provider credentials are managed by Platform Admins. You can view connection status but cannot modify credentials.
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Connected Providers" value="3" sub="SumSub · Onfido · Persona" />
        <Stat label="Regions Covered" value="6" sub="46 countries + Rest of World fallback" />
        <Stat label="Avg Response Time" value="1.4s" accent="amber" delta={0} deltaLabel="stable" sub="Across all providers" />
        <Stat label="Webhook Success Rate" value="99.7%" accent="blue" sub="Last 24 hours" />
      </div>

      {/* Provider cards */}
      <div className="grid grid-cols-3 gap-3">
        {Object.entries(PROVIDERS).map(([key, p]) => {
          const status = connectionStatus[key];
          const statusCol = status === "connected" ? "#00e5a0" : status === "degraded" ? "#f5a623" : "#ff4757";

          return (
            <div key={key} className="bg-[#131920] border border-[#1e2d40] rounded overflow-hidden" style={{ borderTop: `2px solid ${p.color}` }}>
              {/* Header */}
              <div className="px-4 py-3 border-b border-[#1e2d40] flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0 overflow-hidden relative"
                  style={{ background: p.bg }}
                >
                  <Image
                    src={`/kyc-providers/${p.logo}`}
                    alt={`${p.name} logo`}
                    width={32}
                    height={32}
                    className="object-contain"
                    onError={(e) => {
                      // Fallback to initials if logo not found
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const parent = target.parentElement;
                      if (parent) {
                        parent.innerHTML = `<span class="font-mono text-[11px] font-bold" style="color: ${p.color}">${p.abbr}</span>`;
                      }
                    }}
                  />
                </div>
                <div className="flex-1">
                  <div className="font-mono text-xs font-semibold text-[#e8edf3]">{p.name}</div>
                  <div className="font-mono text-[9px] text-[#5a7090] mt-0.5">{p.regions.join(" · ")}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-[7px] h-[7px] rounded-full" style={{ background: statusCol }} />
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm font-mono text-[9px] font-bold uppercase tracking-wide ${
                      status === "connected"
                        ? "bg-[rgba(0,229,160,0.10)] text-[#00e5a0]"
                        : status === "degraded"
                        ? "bg-[rgba(245,166,35,0.10)] text-[#f5a623]"
                        : "bg-[rgba(255,71,87,0.10)] text-[#ff4757]"
                    }`}
                  >
                    {status}
                  </span>
                </div>
              </div>

              {/* Body */}
              <div className="px-4 py-3 flex flex-col gap-3">
                {/* Credential fields */}
                {[
                  ["App Token / Client ID", "••••••••••••••••••••••••3f2a"],
                  ["Secret Key", "sk_••••••••••••••••••••••••••••••9c1d"],
                ].map(([label, masked]) => (
                  <div key={label}>
                    <div className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-1">{label}</div>
                    <div className="flex gap-2">
                      <div className="flex items-center gap-2 bg-[#080c10] border border-[#1e2d40] rounded px-2 py-1 flex-1">
                        <span className="font-mono text-[10px] text-[#5a7090] flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                          {revealed[`${key}-${label}`] ? `live-actual-key-would-show-here` : masked}
                        </span>
                      </div>
                      {isAdmin && (
                        <button
                          className="px-2 py-1 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] hover:border-[#253550] transition-all"
                          onClick={() => setRevealed((r) => ({ ...r, [`${key}-${label}`]: !r[`${key}-${label}`] }))}
                        >
                          {revealed[`${key}-${label}`] ? "Hide" : "Show"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Other details */}
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090]">Webhook URL</span>
                  <span className="font-mono text-[9px] text-[#8fa3b8] text-right overflow-hidden text-ellipsis">
                    https://api.stella.io/webhooks/{key}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090]">Workflows</span>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {p.workflows.slice(0, 2).map((w) => (
                      <span key={w} className="px-2 py-0.5 bg-[#1a2230] border border-[#253550] rounded-sm font-mono text-[9px] text-[#8fa3b8]">
                        {w}
                      </span>
                    ))}
                    {p.workflows.length > 2 && (
                      <span className="px-2 py-0.5 bg-[#1a2230] border border-[#253550] rounded-sm font-mono text-[9px] text-[#8fa3b8]">
                        +{p.workflows.length - 2}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090]">Last checked</span>
                  <span className="font-mono text-[10px] text-[#8fa3b8]">2 min ago</span>
                </div>
              </div>

              {/* Actions */}
              <div className="px-4 py-2 border-t border-[#1e2d40] flex gap-2">
                {isAdmin && (
                  <button
                    className="px-3 py-1 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] hover:border-[#253550] transition-all"
                    onClick={() => testConnection(key)}
                  >
                    {testing[key] ? "Testing…" : tested[key] ? "✓ Healthy" : "Test Connection"}
                  </button>
                )}
                <button
                  className="px-3 py-1 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] hover:border-[#253550] transition-all"
                  onClick={() => window.open(p.docs)}
                >
                  Docs ↗
                </button>
                {isAdmin && (
                  <button className="px-3 py-1 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] hover:border-[#253550] transition-all ml-auto">
                    Rotate Keys
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add provider CTA */}
      {isAdmin && (
        <div className="border border-dashed border-[#253550] rounded p-5 flex items-center justify-center gap-3">
          <span className="font-mono text-[11px] text-[#5a7090]">Add another KYC provider — Veriff, Jumio, Smile Identity…</span>
          <button className="px-3 py-1 rounded border bg-[rgba(0,229,160,0.10)] text-[#00e5a0] border-[rgba(0,229,160,0.3)] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#00e5a0] hover:text-black transition-all">
            + Connect Provider
          </button>
        </div>
      )}
    </div>
  );
}

// Stat card component
function Stat({
  label,
  value,
  sub,
  accent,
  delta,
  deltaLabel,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  delta?: number;
  deltaLabel?: string;
}) {
  const accentColors: Record<string, string> = {
    green: "#00e5a0",
    amber: "#f5a623",
    red: "#ff4757",
    blue: "#3d9df3",
  };

  const accentColor = accent ? accentColors[accent] : accentColors.green;

  return (
    <div className="bg-[#0d1117] border border-[#1e2d40] rounded p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: accentColor }} />
      <div className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-2">{label}</div>
      <div className="font-mono text-2xl font-semibold text-[#e8edf3] leading-none mb-2">{value}</div>
      {delta !== undefined && (
        <span
          className={`inline-flex items-center gap-1 font-mono text-[9px] font-semibold px-2 py-0.5 rounded-sm ${
            delta > 0
              ? "bg-[rgba(0,229,160,0.10)] text-[#00e5a0]"
              : delta < 0
              ? "bg-[rgba(255,71,87,0.10)] text-[#ff4757]"
              : "bg-[rgba(245,166,35,0.10)] text-[#f5a623]"
          }`}
        >
          {delta > 0 ? "▲" : delta < 0 ? "▼" : "—"} {deltaLabel || `${Math.abs(delta)}%`}
        </span>
      )}
      {sub && <div className="font-mono text-[9px] text-[#5a7090] mt-2">{sub}</div>}
    </div>
  );
}
