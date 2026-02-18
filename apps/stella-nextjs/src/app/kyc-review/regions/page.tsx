"use client";

import { useState } from "react";

// Provider configuration
const PROVIDERS = {
  sumsub: {
    name: "SumSub",
    color: "#0BA8E0",
    bg: "#0BA8E020",
    abbr: "SS",
    docs: "https://developers.sumsub.com",
    workflows: ["standard-kyc", "enhanced-due-diligence", "poa-check", "liveness-only"],
    regions: ["East Africa", "Southern Africa"],
  },
  onfido: {
    name: "Onfido",
    color: "#3B46FF",
    bg: "#3B46FF20",
    abbr: "ON",
    docs: "https://documentation.onfido.com",
    workflows: ["us-standard", "us-enhanced", "us-accredited-investor"],
    regions: ["United States"],
  },
  persona: {
    name: "Persona",
    color: "#7C5CFC",
    bg: "#7C5CFC20",
    abbr: "PS",
    docs: "https://docs.withpersona.com",
    workflows: ["global-standard", "aml-enhanced"],
    regions: ["European Union", "Rest of World"],
  },
};

const REGIONS_CONFIG = [
  { name: "East Africa", countries: ["UG", "KE", "TZ", "RW", "ET"], provider: "sumsub", workflow: "standard-kyc", active: true },
  { name: "Southern Africa", countries: ["ZA", "ZM", "ZW", "BW", "MZ"], provider: "sumsub", workflow: "enhanced-due-diligence", active: true },
  { name: "West Africa", countries: ["NG", "GH", "SN", "CI"], provider: "sumsub", workflow: "standard-kyc", active: true },
  { name: "European Union", countries: ["DE", "FR", "NL", "ES", "IT", "SE", "PL"], provider: "persona", workflow: "global-standard", active: true },
  { name: "United States", countries: ["US"], provider: "onfido", workflow: "us-standard", active: true },
  { name: "Rest of World", countries: ["*"], provider: "persona", workflow: "aml-enhanced", active: true },
];

const ROLES = { COMPLIANCE: "Compliance Officer", PLATFORM: "Platform Admin" };

export default function RegionsPage() {
  const [regions] = useState(REGIONS_CONFIG);
  const [role] = useState(ROLES.PLATFORM); // Would come from context/auth

  const isAdmin = role === ROLES.PLATFORM;

  return (
    <div className="p-6 flex flex-col gap-5">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Regions Defined" value={regions.length} sub="Named routing groups" />
        <Stat label="Countries Covered" value="30+" sub="Explicit + fallback" />
        <Stat label="Fallback Provider" value="Persona" accent="blue" sub="Catches unmapped countries" />
        <Stat label="Unmapped Countries" value="0" accent="green" sub="Full coverage confirmed" />
      </div>

      {/* Routing table */}
      <div className="bg-[#131920] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40] flex items-center justify-between">
          <div className="font-mono text-xs font-semibold text-[#e8edf3]">Region → Provider Routing</div>
          {isAdmin && (
            <button className="px-3 py-1 rounded border bg-[rgba(0,229,160,0.10)] text-[#00e5a0] border-[rgba(0,229,160,0.3)] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#00e5a0] hover:text-black transition-all">
              + Add Region
            </button>
          )}
        </div>
        <div>
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_1.8fr_1fr_1.2fr_80px] bg-[#0d1117] border-b border-[#1e2d40]">
            {["Region", "Countries", "Provider", "Workflow", ""].map((h) => (
              <div key={h} className="px-3 py-2 font-mono text-[9px] uppercase tracking-wider text-[#5a7090]">
                {h}
              </div>
            ))}
          </div>
          {/* Rows */}
          {regions.map((r, i) => {
            const prov = PROVIDERS[r.provider as keyof typeof PROVIDERS];
            return (
              <div
                key={i}
                className="grid grid-cols-[1fr_1.8fr_1fr_1.2fr_80px] items-center border-b border-[#1e2d40] hover:bg-[#0d1117] transition-colors"
              >
                <div className="px-3 py-3">
                  <div className="font-mono text-[11px] font-semibold text-[#e8edf3]">{r.name}</div>
                  <div className="font-mono text-[9px] mt-1" style={{ color: r.active ? "#00e5a0" : "#ff4757" }}>
                    {r.active ? "● Active" : "○ Inactive"}
                  </div>
                </div>
                <div className="px-3 py-3">
                  {r.countries[0] === "*" ? (
                    <span className="font-mono text-[10px] text-[#5a7090] italic">All unmapped countries</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {r.countries.map((c) => (
                        <span
                          key={c}
                          className="px-2 py-0.5 bg-[#1a2230] border border-[#253550] rounded-sm font-mono text-[9px] text-[#8fa3b8]"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="px-3 py-3">
                  <ProviderPill prov={r.provider} />
                </div>
                <div className="px-3 py-3">
                  <span className="px-2 py-0.5 bg-[#1a2230] border border-[#253550] rounded-sm font-mono text-[9px] text-[#8fa3b8]">
                    {r.workflow}
                  </span>
                </div>
                <div className="px-3 py-3">
                  {isAdmin && (
                    <button className="px-2 py-1 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[8px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] hover:border-[#253550] transition-all">
                      Edit
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Coverage map placeholder */}
      <div className="bg-[#131920] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40] flex items-center justify-between">
          <div className="font-mono text-xs font-semibold text-[#e8edf3]">Coverage Visualisation</div>
          <div className="font-mono text-[9px] text-[#5a7090]">Countries coloured by assigned provider</div>
        </div>
        <div className="px-4 py-8 flex flex-col items-center justify-center gap-3" style={{ minHeight: 180 }}>
          <div className="text-4xl opacity-35">🗺</div>
          <div className="font-mono text-[11px] text-[#5a7090]">World coverage map renders here</div>
          <div className="font-mono text-[9px] text-[#5a7090] text-center max-w-xs">
            Each country shaded by its assigned provider. Unmapped countries shown in red. Hover for region details and routing info.
          </div>
          {/* Provider legend */}
          <div className="flex gap-4 mt-2">
            {Object.entries(PROVIDERS).map(([key, p]) => (
              <div key={key} className="flex items-center gap-2 font-mono text-[9px] text-[#8fa3b8]">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />
                {p.name}
              </div>
            ))}
            <div className="flex items-center gap-2 font-mono text-[9px] text-[#8fa3b8]">
              <div className="w-2.5 h-2.5 rounded-sm bg-[#ff4757]" />
              Unmapped
            </div>
          </div>
        </div>
      </div>

      {/* Re-verification rules */}
      <div className="bg-[#131920] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40] flex items-center justify-between">
          <div className="font-mono text-xs font-semibold text-[#e8edf3]">Re-Verification Rules</div>
          {isAdmin && (
            <button className="px-3 py-1 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] hover:border-[#253550] transition-all">
              + Add Rule
            </button>
          )}
        </div>
        <div className="px-4 py-3">
          {[
            {
              trigger: "Document expiry",
              threshold: "30 days before",
              action: "Flag as expiring-soon, notify user",
              provider: "Same provider as original KYC",
            },
            {
              trigger: "Tier upgrade request",
              threshold: "Standard → Enhanced or Accredited",
              action: "Trigger enhanced-due-diligence workflow",
              provider: "Original region's provider",
            },
            {
              trigger: "AML watchlist match",
              threshold: "Any hit on refresh scan",
              action: "Suspend account, flag for manual review",
              provider: "Same provider, new check",
            },
          ].map((rule, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_1fr_1.5fr_1fr] gap-3 items-center py-3"
              style={{ borderBottom: i < 2 ? "1px solid #1e2d40" : "none" }}
            >
              <div>
                <div className="font-mono text-[9px] text-[#5a7090] mb-1">TRIGGER</div>
                <div className="font-mono text-[10px] font-semibold text-[#e8edf3]">{rule.trigger}</div>
              </div>
              <div>
                <div className="font-mono text-[9px] text-[#5a7090] mb-1">THRESHOLD</div>
                <div className="font-mono text-[10px] text-[#f5a623]">{rule.threshold}</div>
              </div>
              <div>
                <div className="font-mono text-[9px] text-[#5a7090] mb-1">ACTION</div>
                <div className="text-[11px] text-[#8fa3b8]">{rule.action}</div>
              </div>
              <div>
                <div className="font-mono text-[9px] text-[#5a7090] mb-1">PROVIDER</div>
                <div className="font-mono text-[10px] text-[#8fa3b8]">{rule.provider}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Provider pill component
function ProviderPill({ prov }: { prov: string }) {
  const p = PROVIDERS[prov as keyof typeof PROVIDERS];
  if (!p) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm font-mono text-[9px] font-semibold"
      style={{ background: p.bg, color: p.color, border: `1px solid ${p.color}33` }}
    >
      {p.name}
    </span>
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
