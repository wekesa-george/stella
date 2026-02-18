"use client";

import { useState } from "react";

const AUDIT_EVENTS = [
  {
    type: "override",
    icon: "⚑",
    iconBg: "rgba(245,166,35,0.15)",
    color: "#f5a623",
    actor: "admin@stella.io",
    msg: "Manually approved applicant",
    target: "KYC-1003",
    time: "2 min ago",
  },
  {
    type: "credential",
    icon: "🔑",
    iconBg: "rgba(61,157,243,0.15)",
    color: "#3d9df3",
    actor: "ops@stella.io",
    msg: "Rotated API key for provider",
    target: "SumSub",
    time: "18 min ago",
  },
  {
    type: "region",
    icon: "🗺",
    iconBg: "rgba(0,229,160,0.12)",
    color: "#00e5a0",
    actor: "ops@stella.io",
    msg: "Added West Africa region mapped to",
    target: "SumSub → standard-kyc",
    time: "1h ago",
  },
  {
    type: "override",
    icon: "✕",
    iconBg: "rgba(255,71,87,0.15)",
    color: "#ff4757",
    actor: "admin@stella.io",
    msg: "Manually declined applicant",
    target: "KYC-1009",
    time: "3h ago",
  },
  {
    type: "provider",
    icon: "⚡",
    iconBg: "rgba(167,139,250,0.15)",
    color: "#a78bfa",
    actor: "system",
    msg: "Degraded health detected for provider",
    target: "Onfido",
    time: "5h ago",
  },
  {
    type: "region",
    icon: "🗺",
    iconBg: "rgba(0,229,160,0.12)",
    color: "#00e5a0",
    actor: "ops@stella.io",
    msg: "Switched EU routing from Onfido to",
    target: "Persona → global-standard",
    time: "1d ago",
  },
  {
    type: "credential",
    icon: "🔑",
    iconBg: "rgba(61,157,243,0.15)",
    color: "#3d9df3",
    actor: "ops@stella.io",
    msg: "Connected new provider",
    target: "Persona",
    time: "2d ago",
  },
  {
    type: "override",
    icon: "↺",
    iconBg: "rgba(34,211,238,0.12)",
    color: "#22d3ee",
    actor: "admin@stella.io",
    msg: "Triggered re-verification for",
    target: "KYC-1005",
    time: "3d ago",
  },
];

export default function AuditPage() {
  const [typeFilter, setTypeFilter] = useState("all");
  const filtered = typeFilter === "all" ? AUDIT_EVENTS : AUDIT_EVENTS.filter((e) => e.type === typeFilter);

  return (
    <div className="p-6">
      <div className="bg-[#131920] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40] flex items-center justify-between">
          <div className="font-mono text-xs font-semibold text-[#e8edf3]">Audit Log</div>
          <div className="flex gap-2">
            {[
              ["all", "All"],
              ["override", "Decisions"],
              ["credential", "Credentials"],
              ["region", "Routing"],
              ["provider", "Providers"],
            ].map(([k, l]) => (
              <button
                key={k}
                className={`px-3 py-1 rounded-sm font-mono text-[10px] font-semibold uppercase tracking-wide transition-all ${
                  typeFilter === k
                    ? "bg-[rgba(0,229,160,0.10)] text-[#00e5a0] border border-[rgba(0,229,160,0.3)]"
                    : "bg-transparent text-[#5a7090] border border-[#1e2d40] hover:bg-[#1a2230] hover:text-[#e8edf3] hover:border-[#253550]"
                }`}
                onClick={() => setTypeFilter(k)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          {filtered.map((e, i) => (
            <div
              key={i}
              className="px-4 py-3 border-b border-[#1e2d40] flex gap-4 items-start hover:bg-[#0d1117] transition-colors"
            >
              <div
                className="w-7 h-7 rounded flex items-center justify-center text-xs flex-shrink-0"
                style={{ background: e.iconBg, color: e.color }}
              >
                {e.icon}
              </div>
              <div className="flex-1">
                <div className="text-xs text-[#8fa3b8] leading-relaxed">
                  <span className="font-mono text-[10px] font-semibold text-[#3d9df3]">{e.actor}</span> {e.msg}{" "}
                  <span className="font-mono text-[10px] text-[#e8edf3]">{e.target}</span>
                </div>
              </div>
              <div className="font-mono text-[9px] text-[#5a7090] whitespace-nowrap pt-0.5">{e.time}</div>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-[#1e2d40] flex justify-between items-center">
          <span className="font-mono text-[9px] text-[#5a7090]">
            Showing {filtered.length} events · Audit records are immutable and retained for 7 years per regulatory
            requirement.
          </span>
          <button className="px-3 py-1 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[8px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] hover:border-[#253550] transition-all">
            Export CSV
          </button>
        </div>
      </div>
    </div>
  );
}
