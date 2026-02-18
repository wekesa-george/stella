"use client";

import { useState, useMemo } from "react";

// Types and Constants
const PROVIDERS = {
  sumsub: { name: "SumSub", color: "#0BA8E0", bg: "#0BA8E020", docs: "https://developers.sumsub.com" },
  onfido: { name: "Onfido", color: "#3B46FF", bg: "#3B46FF20", docs: "https://documentation.onfido.com" },
  persona: { name: "Persona", color: "#7C5CFC", bg: "#7C5CFC20", docs: "https://docs.withpersona.com" },
};

const STATUS_META = {
  approved: { label: "Approved", color: "#00e5a0", dot: "#00e5a0", icon: "✓" },
  pending: { label: "Pending", color: "#3d9df3", dot: "#3d9df3", icon: "◷" },
  review: { label: "Manual Review", color: "#f5a623", dot: "#f5a623", icon: "⚑" },
  declined: { label: "Declined", color: "#ff4757", dot: "#ff4757", icon: "✕" },
  expiring: { label: "Expiring Soon", color: "#a78bfa", dot: "#a78bfa", icon: "⏰" },
  "re-verify": { label: "Re-Verify", color: "#22d3ee", dot: "#22d3ee", icon: "↺" },
};

const ROLES = { COMPLIANCE: "Compliance Officer", PLATFORM: "Platform Admin" };

// Seed Data
const NAMES = [
  "Amara Nwosu",
  "David Kiptoo",
  "Fatima Al-Rashid",
  "Jorge Mendes",
  "Sarah Chen",
  "Ivan Popov",
  "Aiko Tanaka",
  "Elena Vasquez",
  "Omar Farouk",
  "Lena Schmidt",
  "Kwame Asante",
  "Priya Sharma",
  "Max Thornton",
  "Zara Ahmed",
  "Carlos Reyes",
];

const COUNTRIES = ["UG", "KE", "ZA", "NG", "GH", "DE", "US", "TZ", "FR", "ZM"];
const DOC_TYPES = ["Passport", "National ID", "Driver's Licence", "Residence Permit"];
const PROVIDERS_LIST = ["sumsub", "sumsub", "sumsub", "onfido", "persona"];
const STATUSES = ["approved", "approved", "approved", "approved", "pending", "review", "declined", "expiring", "re-verify"];

const REGIONS_CONFIG = [
  { name: "East Africa", countries: ["UG", "KE", "TZ", "RW", "ET"] },
  { name: "Southern Africa", countries: ["ZA", "ZM", "ZW", "BW", "MZ"] },
  { name: "West Africa", countries: ["NG", "GH", "SN", "CI"] },
  { name: "European Union", countries: ["DE", "FR", "NL", "ES", "IT", "SE", "PL"] },
  { name: "United States", countries: ["US"] },
  { name: "Rest of World", countries: ["*"] },
];

function getRegionForCountry(cc: string) {
  const r = REGIONS_CONFIG.find((r) => r.countries.includes(cc) || r.countries.includes("*"));
  return r?.name || "Unknown";
}

function randDate(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * daysAgo));
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const RISK_SCORE_COLOR = (s: number) => (s >= 80 ? "#00e5a0" : s >= 50 ? "#f5a623" : "#ff4757");
const RISK_SCORE_BG = (s: number) => (s >= 80 ? "rgba(0,229,160,0.10)" : s >= 50 ? "rgba(245,166,35,0.10)" : "rgba(255,71,87,0.10)");

// Generate applicants
const APPLICANTS = NAMES.map((name, i) => {
  const country = COUNTRIES[i % COUNTRIES.length];
  const status = STATUSES[i % STATUSES.length];
  const provider = PROVIDERS_LIST[i % PROVIDERS_LIST.length];
  const riskScore =
    status === "approved" || status === "expiring"
      ? Math.floor(Math.random() * 20) + 78
      : status === "review"
      ? Math.floor(Math.random() * 30) + 40
      : status === "declined"
      ? Math.floor(Math.random() * 30) + 10
      : Math.floor(Math.random() * 50) + 50;

  return {
    id: `KYC-${String(i + 1001).padStart(4, "0")}`,
    name,
    email: `${name.split(" ")[0].toLowerCase()}@example.com`,
    country,
    region: getRegionForCountry(country),
    provider,
    status,
    riskScore,
    docType: DOC_TYPES[i % DOC_TYPES.length],
    submittedAt: randDate(60),
    updatedAt: randDate(14),
    expiresAt: status === "expiring" ? randDate(-20) : randDate(-180),
    watchlistHit: status === "declined" || (status === "review" && Math.random() > 0.6),
    faceMatch: riskScore > 60 ? Math.floor(Math.random() * 15) + 85 : Math.floor(Math.random() * 30) + 50,
    docAuth: riskScore > 60 ? Math.floor(Math.random() * 10) + 88 : Math.floor(Math.random() * 35) + 45,
    rejectionReasons: status === "declined" ? ["Document expired", "Face match below threshold"] : [],
    tier: ["Standard", "Enhanced", "Accredited"][i % 3],
    notes: [],
    applicantId: `${provider.toUpperCase()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
  };
});

type Applicant = typeof APPLICANTS[0];

// Components
function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status as keyof typeof STATUS_META] || STATUS_META.pending;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm font-mono text-[9px] font-bold uppercase tracking-wide`}
      style={{ background: m.color + "1A", color: m.color }}
    >
      <span className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ background: m.dot }} />
      {m.label}
    </span>
  );
}

function ProviderPill({ prov }: { prov: string }) {
  const p = PROVIDERS[prov as keyof typeof PROVIDERS];
  if (!p) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm font-mono text-[9px] font-semibold"
      style={{ background: p.bg, border: `1px solid ${p.color}33`, color: p.color }}
    >
      {p.name}
    </span>
  );
}

function ScorePill({ score }: { score: number }) {
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-sm font-mono text-[10px] font-semibold"
      style={{ background: RISK_SCORE_BG(score), color: RISK_SCORE_COLOR(score) }}
    >
      {score}
    </span>
  );
}

function MiniBar({ val, max = 100 }: { val: number; max?: number }) {
  return (
    <div className="h-[3px] bg-[#1a2230] rounded-sm overflow-hidden mt-1">
      <div className="h-full rounded-sm" style={{ width: `${Math.min(100, (val / max) * 100)}%`, background: RISK_SCORE_COLOR(val) }} />
    </div>
  );
}

// Applicant Modal
function ApplicantModal({
  applicant,
  role,
  onClose,
  onAction,
}: {
  applicant: Applicant;
  role: string;
  onClose: () => void;
  onAction: (action: string, applicant: Applicant) => void;
}) {
  const [note, setNote] = useState("");
  const [view, setView] = useState<"data" | "documents">("data");
  const p = PROVIDERS[applicant.provider as keyof typeof PROVIDERS];
  const isCompliance = role === ROLES.COMPLIANCE;

  const riskFlags = [
    {
      ok: !applicant.watchlistHit,
      warn: applicant.watchlistHit,
      label: applicant.watchlistHit ? "Watchlist match detected — requires manual review" : "No watchlist hits",
      danger: applicant.watchlistHit,
    },
    {
      ok: applicant.faceMatch >= 80,
      label: `Face match confidence: ${applicant.faceMatch}%`,
      warn: applicant.faceMatch < 80 && applicant.faceMatch >= 60,
      danger: applicant.faceMatch < 60,
    },
    {
      ok: applicant.docAuth >= 85,
      label: `Document authenticity score: ${applicant.docAuth}%`,
      warn: applicant.docAuth < 85 && applicant.docAuth >= 65,
      danger: applicant.docAuth < 65,
    },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur flex items-center justify-center z-[1000] p-5"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#0d1117] border border-[#253550] rounded-md w-full max-w-[820px] max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#1e2d40] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="font-mono text-[10px] text-[#5a7090]">{applicant.id}</div>
            <div className="font-mono text-xs font-semibold text-[#e8edf3] tracking-wide">{applicant.name}</div>
            <StatusBadge status={applicant.status} />
            <ProviderPill prov={applicant.provider} />
          </div>
          <button className="text-[#5a7090] text-lg hover:text-[#e8edf3] cursor-pointer p-1 leading-none" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* View toggle */}
        <div className="px-5 border-b border-[#1e2d40] flex gap-0.5">
          {(["data", "documents"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="px-4 py-2 border-b-2 font-mono text-[10px] uppercase tracking-wider cursor-pointer transition-all"
              style={{
                borderBottomColor: view === v ? "#00e5a0" : "transparent",
                color: view === v ? "#00e5a0" : "#5a7090",
                background: "none",
                borderTop: "none",
                borderLeft: "none",
                borderRight: "none",
              }}
            >
              {v === "data" ? "KYC Data" : "Documents (Provider)"}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {view === "data" ? (
            <div className="flex flex-col gap-4">
              {/* Core details */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Full Name", applicant.name],
                  ["Email", applicant.email],
                  ["Country", applicant.country],
                  ["Region", applicant.region],
                  ["Document Type", applicant.docType],
                  ["Provider ID", applicant.applicantId],
                  ["Submitted", applicant.submittedAt],
                  ["Last Updated", applicant.updatedAt],
                  ["Doc Expiry", applicant.expiresAt],
                  ["Account Tier", applicant.tier],
                ].map(([l, v]) => (
                  <div className="bg-[#131920] border border-[#1e2d40] rounded p-3" key={l}>
                    <div className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-1">{l}</div>
                    <div className="font-mono text-[11px] text-[#e8edf3]">{v}</div>
                  </div>
                ))}
              </div>

              {/* Risk signals */}
              <div>
                <div className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] pb-2 border-b border-[#1e2d40] mb-3">Risk Signals</div>
                <div className="flex gap-2 mb-3">
                  <div className="flex-1">
                    <div className="font-mono text-[9px] text-[#5a7090] mb-1">RISK SCORE</div>
                    <div className="font-mono text-[22px] font-semibold" style={{ color: RISK_SCORE_COLOR(applicant.riskScore) }}>
                      {applicant.riskScore}
                    </div>
                  </div>
                  <div className="flex-[2]">
                    {[
                      ["Face Match", applicant.faceMatch],
                      ["Doc Auth", applicant.docAuth],
                    ].map(([l, v]) => (
                      <div key={l} className="mb-2">
                        <div className="flex justify-between font-mono text-[9px] text-[#5a7090] mb-1">
                          <span>{l}</span>
                          <span style={{ color: RISK_SCORE_COLOR(v as number) }}>{v}%</span>
                        </div>
                        <MiniBar val={v as number} />
                      </div>
                    ))}
                  </div>
                </div>
                {riskFlags.map((f, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 px-3 py-2 rounded border mb-2 ${
                      f.danger ? "bg-[rgba(255,71,87,0.10)] border-[rgba(255,71,87,0.25)]" : f.warn ? "bg-[rgba(245,166,35,0.10)] border-[rgba(245,166,35,0.25)]" : "bg-[rgba(0,229,160,0.10)] border-[rgba(0,229,160,0.2)]"
                    }`}
                  >
                    <span className="text-xs flex-shrink-0">{f.danger ? "⚠" : f.warn ? "⚑" : "✓"}</span>
                    <span
                      className="font-mono text-[10px] flex-1"
                      style={{ color: f.danger ? "#ff4757" : f.warn ? "#f5a623" : "#00e5a0" }}
                    >
                      {f.label}
                    </span>
                  </div>
                ))}
                {applicant.rejectionReasons.length > 0 && (
                  <div className="mt-2">
                    <div className="font-mono text-[9px] text-[#5a7090] mb-2">REJECTION REASONS</div>
                    {applicant.rejectionReasons.map((r, i) => (
                      <div key={i} className="font-mono text-[10px] text-[#ff4757] py-1 border-b border-[#1e2d40]">
                        ✕ {r}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Compliance note */}
              {isCompliance && (
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] pb-2 border-b border-[#1e2d40] mb-2">
                    Compliance Note{" "}
                    <span className="text-[#3a5068] font-normal">(required for manual decisions)</span>
                  </div>
                  <textarea
                    className="w-full bg-[#131920] border border-[#1e2d40] rounded text-[#e8edf3] font-sans text-xs p-3 resize-vertical min-h-[80px] outline-none leading-relaxed"
                    placeholder="Document your decision rationale here. This is stored in the audit log and cannot be deleted."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    style={{ colorScheme: "dark" }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="bg-[#131920] border border-[#1e2d40] rounded min-h-[320px] flex flex-col items-center justify-center gap-3 p-5 text-center">
                <div className="text-[32px] opacity-50">🪪</div>
                <div className="font-mono text-[13px] font-semibold text-[#e8edf3]">{p?.name} Document Review</div>
                <div className="font-mono text-[11px] text-[#5a7090]">Applicant ID: {applicant.applicantId}</div>
                <div className="text-[11px] text-[#3a5068] max-w-[320px] leading-relaxed">
                  The provider's document review UI renders here in an authenticated iframe. This gives access to the scanned document, liveness
                  video, face match overlay, and provider-side signals — without leaving the admin context.
                </div>
                <div className="flex gap-2 mt-2">
                  <button className="px-3 py-1 rounded border bg-[rgba(61,157,243,0.10)] text-[#3d9df3] border-[rgba(61,157,243,0.3)] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#3d9df3] hover:text-white transition-all">
                    Open in {p?.name} Portal ↗
                  </button>
                </div>
              </div>
              <div className="mt-3 px-3 py-2 bg-[#131920] border border-[#1e2d40] rounded font-mono text-[9px] text-[#5a7090]">
                ℹ The iframe is loaded with a short-lived session token scoped to this applicant. The token expires after 15 minutes and cannot be
                shared. All access is logged.
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {isCompliance && (
          <div className="px-5 py-4 border-t border-[#1e2d40] flex gap-2 justify-end flex-shrink-0">
            <button
              className="px-3 py-1 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] transition-all"
              onClick={onClose}
            >
              Close
            </button>
            <button
              className="px-3 py-1 rounded border bg-[rgba(61,157,243,0.10)] text-[#3d9df3] border-[rgba(61,157,243,0.3)] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#3d9df3] hover:text-white transition-all"
              onClick={() => {
                onAction("re-verify", applicant);
                onClose();
              }}
            >
              Trigger Re-Verify
            </button>
            <button
              className="px-3 py-1 rounded border bg-[rgba(255,71,87,0.10)] text-[#ff4757] border-[rgba(255,71,87,0.3)] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#ff4757] hover:text-white transition-all disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-[rgba(255,71,87,0.10)] disabled:hover:text-[#ff4757]"
              disabled={!note.trim()}
              onClick={() => {
                onAction("decline", applicant);
                onClose();
              }}
              title={!note.trim() ? "Add a compliance note first" : ""}
            >
              Decline
            </button>
            <button
              className="px-3 py-1 rounded border bg-[rgba(0,229,160,0.10)] text-[#00e5a0] border-[rgba(0,229,160,0.3)] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#00e5a0] hover:text-black transition-all disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-[rgba(0,229,160,0.10)] disabled:hover:text-[#00e5a0]"
              disabled={!note.trim()}
              onClick={() => {
                onAction("approve", applicant);
                onClose();
              }}
              title={!note.trim() ? "Add a compliance note first" : ""}
            >
              Approve
            </button>
          </div>
        )}
        {!isCompliance && (
          <div className="px-5 py-4 border-t border-[#1e2d40] flex gap-2 justify-between items-center flex-shrink-0">
            <span className="font-mono text-[9px] text-[#5a7090] flex-1">Manual decisions require Compliance Officer role.</span>
            <button
              className="px-3 py-1 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] transition-all"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Main Applicants Tab
export default function ApplicantsPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [provFilter, setProvFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Applicant | null>(null);
  const [applicants, setApplicants] = useState(APPLICANTS);
  const [role] = useState(ROLES.COMPLIANCE); // Would come from context/auth

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    applicants.forEach((a) => {
      c[a.status] = (c[a.status] || 0) + 1;
    });
    return c;
  }, [applicants]);

  const filtered = useMemo(
    () =>
      applicants.filter((a) => {
        if (statusFilter !== "all" && a.status !== statusFilter) return false;
        if (provFilter !== "all" && a.provider !== provFilter) return false;
        if (regionFilter !== "all" && a.region !== regionFilter) return false;
        if (
          search &&
          !a.name.toLowerCase().includes(search.toLowerCase()) &&
          !a.email.toLowerCase().includes(search.toLowerCase()) &&
          !a.id.toLowerCase().includes(search.toLowerCase())
        )
          return false;
        return true;
      }),
    [applicants, statusFilter, provFilter, regionFilter, search]
  );

  function handleAction(action: string, appl: Applicant) {
    setApplicants((prev) =>
      prev.map((a) => {
        if (a.id !== appl.id) return a;
        const newStatus = action === "approve" ? "approved" : action === "decline" ? "declined" : "re-verify";
        return { ...a, status: newStatus };
      })
    );
  }

  const uniqueRegions = [...new Set(APPLICANTS.map((a) => a.region))];

  return (
    <div className="p-6 flex flex-col gap-5">
      {/* KPIs */}
      <div className="grid grid-cols-6 gap-3">
        {Object.entries(STATUS_META).map(([key, m]) => (
          <div
            key={key}
            className="bg-[#0d1117] border border-[#1e2d40] rounded p-3 cursor-pointer transition-all hover:border-[#253550]"
            style={{ borderTop: `2px solid ${m.dot}` }}
            onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
          >
            <div className="font-mono text-[8px] uppercase tracking-wider text-[#5a7090] mb-1">{m.label}</div>
            <div className="font-mono text-xl font-semibold" style={{ color: m.color }}>
              {statusCounts[key] || 0}
            </div>
          </div>
        ))}
      </div>

      {/* Work queue highlight */}
      {(statusCounts["review"] || 0) > 0 && (
        <div className="px-4 py-3 bg-[rgba(245,166,35,0.08)] border border-[rgba(245,166,35,0.25)] rounded flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-base">⚑</span>
            <span className="font-mono text-[11px] text-[#f5a623] font-semibold">
              {statusCounts["review"]} applicant{statusCounts["review"] > 1 ? "s" : ""} awaiting manual review
            </span>
            <span className="font-mono text-[10px] text-[#5a7090]">
              These cannot be auto-resolved and require a compliance officer decision.
            </span>
          </div>
          <button
            className="px-3 py-1 rounded border bg-[rgba(245,166,35,0.10)] text-[#f5a623] border-[rgba(245,166,35,0.3)] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#f5a623] hover:text-black transition-all"
            onClick={() => setStatusFilter("review")}
          >
            View Queue
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-[#0d1117] border border-[#1e2d40] rounded">
        <div className="p-4 flex gap-3 flex-wrap items-center">
          <input
            className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[10px] px-3 py-1 rounded outline-none min-w-[200px] placeholder-[#3a5068]"
            placeholder="Search name, email, KYC ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex gap-2 flex-wrap items-center">
            <button
              className={`px-3 py-1 rounded border font-mono text-[9px] uppercase tracking-wider cursor-pointer transition-all ${
                statusFilter === "all"
                  ? "bg-[#1a2230] text-[#e8edf3] border-[#253550]"
                  : "bg-transparent border-[#1e2d40] text-[#5a7090] hover:border-[#253550] hover:text-[#8fa3b8]"
              }`}
              onClick={() => setStatusFilter("all")}
            >
              All Status
            </button>
            {Object.entries(STATUS_META).map(([k, m]) => (
              <button
                key={k}
                className={`px-3 py-1 rounded border font-mono text-[9px] uppercase tracking-wider cursor-pointer transition-all`}
                style={{
                  borderColor: statusFilter === k ? `${m.dot}66` : "#1e2d40",
                  color: statusFilter === k ? m.color : "#5a7090",
                  background: statusFilter === k ? "#1a2230" : "transparent",
                }}
                onClick={() => setStatusFilter(statusFilter === k ? "all" : k)}
              >
                {m.label} ({statusCounts[k] || 0})
              </button>
            ))}
          </div>
          <div className="flex gap-2 ml-auto">
            <select
              className="bg-[#131920] border border-[#1e2d40] text-[#8fa3b8] font-mono text-[9px] px-2 py-1 rounded"
              value={provFilter}
              onChange={(e) => setProvFilter(e.target.value)}
            >
              <option value="all">All Providers</option>
              {Object.keys(PROVIDERS).map((k) => (
                <option key={k} value={k}>
                  {PROVIDERS[k as keyof typeof PROVIDERS].name}
                </option>
              ))}
            </select>
            <select
              className="bg-[#131920] border border-[#1e2d40] text-[#8fa3b8] font-mono text-[9px] px-2 py-1 rounded"
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
            >
              <option value="all">All Regions</option>
              {uniqueRegions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40] flex items-center justify-between">
          <div className="font-mono text-[11px] uppercase tracking-wider text-[#8fa3b8] flex items-center gap-2">
            Applicants{" "}
            <span className="font-mono text-[9px] font-bold px-2 py-0.5 rounded-sm bg-[#1a2230]">{filtered.length}</span>
          </div>
          <div className="font-mono text-[9px] text-[#5a7090]">Click row to open detail review</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[#1e2d40]">
                <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-2 text-left bg-[#131920] whitespace-nowrap font-medium">
                  KYC ID
                </th>
                <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-2 text-left bg-[#131920] whitespace-nowrap font-medium">
                  Name
                </th>
                <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-2 text-left bg-[#131920] whitespace-nowrap font-medium">
                  Region
                </th>
                <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-2 text-left bg-[#131920] whitespace-nowrap font-medium">
                  Provider
                </th>
                <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-2 text-left bg-[#131920] whitespace-nowrap font-medium">
                  Status
                </th>
                <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-2 text-left bg-[#131920] whitespace-nowrap font-medium">
                  Risk Score
                </th>
                <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-2 text-left bg-[#131920] whitespace-nowrap font-medium">
                  Face Match
                </th>
                <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-2 text-left bg-[#131920] whitespace-nowrap font-medium">
                  Doc Auth
                </th>
                <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-2 text-left bg-[#131920] whitespace-nowrap font-medium">
                  Watchlist
                </th>
                <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-2 text-left bg-[#131920] whitespace-nowrap font-medium">
                  Submitted
                </th>
                <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-2 text-left bg-[#131920] whitespace-nowrap font-medium">
                  Updated
                </th>
                <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3 py-2 text-left bg-[#131920] whitespace-nowrap font-medium">
                  Tier
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-[#1e2d40] hover:bg-[#131920] cursor-pointer transition-colors" onClick={() => setSelected(a)}>
                  <td className="px-3 py-2 font-mono text-[10px] text-[#3d9df3] font-semibold">{a.id}</td>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-xs text-[#e8edf3]">{a.name}</div>
                    <div className="font-mono text-[9px] text-[#5a7090]">{a.email}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-mono text-[10px] text-[#8fa3b8]">{a.region}</div>
                    <div className="font-mono text-[9px] text-[#5a7090]">{a.country}</div>
                  </td>
                  <td className="px-3 py-2">
                    <ProviderPill prov={a.provider} />
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-3 py-2">
                    <ScorePill score={a.riskScore} />
                    <MiniBar val={a.riskScore} />
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px]" style={{ color: RISK_SCORE_COLOR(a.faceMatch) }}>
                    {a.faceMatch}%
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px]" style={{ color: RISK_SCORE_COLOR(a.docAuth) }}>
                    {a.docAuth}%
                  </td>
                  <td className="px-3 py-2">
                    {a.watchlistHit ? (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm font-mono text-[9px] font-bold uppercase tracking-wide"
                        style={{ background: "rgba(255,71,87,0.10)", color: "#ff4757" }}
                      >
                        <span className="w-[5px] h-[5px] rounded-full" style={{ background: "#ff4757" }} />
                        Hit
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm font-mono text-[9px] font-bold uppercase tracking-wide"
                        style={{ background: "rgba(0,229,160,0.10)", color: "#00e5a0" }}
                      >
                        <span className="w-[5px] h-[5px] rounded-full" style={{ background: "#00e5a0" }} />
                        Clear
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-[#5a7090]">{a.submittedAt}</td>
                  <td className="px-3 py-2 font-mono text-[10px] text-[#5a7090]">{a.updatedAt}</td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 bg-[#1a2230] border border-[#253550] rounded-sm font-mono text-[9px] text-[#8fa3b8]">{a.tier}</span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-6 py-6 text-center text-[#5a7090] font-mono text-[11px]">
                    No applicants match current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <ApplicantModal applicant={selected} role={role} onClose={() => setSelected(null)} onAction={handleAction} />}
    </div>
  );
}
