"use client";

import { useState } from "react";
import Image from "next/image";
import { DotPatternBackground } from "@/components/DotPatternBackground";
import { Footer } from "@/components/Footer";

// ─── Stella Onboarding Wizard ────────────────────────────────────────────────
// Matches the exact dark-theme design language of the Stella admin panel.
// Steps: KYC → Plan → Connect Exchange → Allocate Capital
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, key: "kyc",      label: "Identity" },
  { id: 2, key: "plan",     label: "Choose Plan" },
  { id: 3, key: "exchange", label: "Connect Exchange" },
  { id: 4, key: "capital",  label: "Allocate Capital" },
];

const TIERS = [
  {
    key: "stella_one",
    name: "Stella One",
    price: "$0",
    sub: "/ mo",
    fee: "20% performance fee",
    accent: "#4ADE80",
    features: [
      { label: "Max Bots",    value: "1" },
      { label: "Capital",     value: "Stella-seeded" },
      { label: "Exchanges",   value: "2" },
      { label: "Strategies",  value: "Core only" },
      { label: "API Access",  value: false },
      { label: "Support",     value: "Email" },
    ],
    description: "Zero-cost access. Stella provides the capital — we share the upside.",
  },
  {
    key: "stella_unum",
    name: "Stella Unum",
    price: "$49",
    sub: "/ mo",
    fee: "15% performance fee",
    accent: "#00E5A0",
    badge: "POPULAR",
    features: [
      { label: "Max Bots",    value: "3" },
      { label: "Capital",     value: "Your own" },
      { label: "Exchanges",   value: "3" },
      { label: "Strategies",  value: "Core + 2 custom" },
      { label: "API Access",  value: false },
      { label: "Support",     value: "Priority Email" },
    ],
    description: "Guided access with structured risk controls for growing traders.",
  },
  {
    key: "stella_eon",
    name: "Stella Eon",
    price: "$199",
    sub: "/ mo",
    fee: "10% performance fee",
    accent: "#F59E0B",
    features: [
      { label: "Max Bots",    value: "10" },
      { label: "Capital",     value: "Your own" },
      { label: "Exchanges",   value: "5" },
      { label: "Strategies",  value: "Unlimited" },
      { label: "API Access",  value: true },
      { label: "Support",     value: "Dedicated" },
    ],
    description: "Advanced execution with bespoke risk profiles for sophisticated allocators.",
  },
];

const EXCHANGES = [
  { id: "binance",      name: "Binance",      type: "API Key + Secret",   status: "active",   logo: "B" },
  { id: "alpaca",       name: "Alpaca",        type: "API Key + Secret",   status: "active",   logo: "A" },
  { id: "hyperliquid",  name: "Hyperliquid",   type: "WalletConnect",      status: "active",   logo: "H" },
  { id: "robinhood",    name: "Robinhood",     type: "OAuth 2.0",          status: "active",   logo: "R" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={className}
      style={{
        fontFamily: "var(--font-open-sans), monospace",
        fontSize: "10px",
        letterSpacing: "0.12em",
        color: "#8FA3B8",
        textTransform: "uppercase",
        fontWeight: 500,
      }}
    >
      {children}
    </span>
  );
}

function FieldRow({ label, value, highlight }: { label: string; value: string; highlight?: "green" | "amber" | "muted" }) {
  const color = highlight === "green" ? "#00E5A0"
    : highlight === "amber" ? "#F59E0B"
    : highlight === "muted" ? "#3D4560"
    : "#C8CDE0";
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "9px 0",
      borderBottom: "1px solid #161B28",
    }}>
      <Label>{label}</Label>
      <span style={{
        fontFamily: "var(--font-open-sans), monospace",
        fontSize: "12px",
        color,
        letterSpacing: "0.04em",
      }}>
        {value}
      </span>
    </div>
  );
}

function Input({ label, placeholder, value, onChange, hint, type = "text" }: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
  hint?: string;
  type?: string
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Label>{label}</Label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-[#0E111A] border border-[#1C2338] rounded px-[14px] py-[10px] text-[#C8CDE0] text-[13px] outline-none w-full transition-colors focus:border-primary"
      />
      {hint && (
        <span style={{
          fontFamily: "var(--font-open-sans), monospace",
          fontSize: "10px",
          color: "#3D4560",
          letterSpacing: "0.04em",
        }}>{hint}</span>
      )}
    </div>
  );
}

function Select({ label, value, onChange, options, hint }: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: Array<{ value: string; label: string }>;
  hint?: string
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Label>{label}</Label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-[#0E111A] border border-[#1C2338] rounded px-[14px] py-[10px] text-[#C8CDE0] text-[13px] outline-none w-full cursor-pointer appearance-none bg-no-repeat bg-right-[14px] bg-center"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' viewBox='0 0 24 24'%3E%3Cpath stroke='%234A5578' stroke-width='2' d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {hint && (
        <span style={{
          fontFamily: "var(--font-open-sans), monospace",
          fontSize: "10px",
          color: "#3D4560",
          letterSpacing: "0.04em",
        }}>{hint}</span>
      )}
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, fullWidth }: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="border-none rounded px-6 py-[11px] text-[11px] tracking-[0.1em] uppercase font-bold cursor-pointer transition-all disabled:cursor-not-allowed"
      style={{
        background: disabled ? "#1A2030" : "#00E5A0",
        color: disabled ? "#3D4560" : "#0A0D14",
        width: fullWidth ? "100%" : "auto",
      }}
    >
      {children}
    </button>
  );
}

function GhostButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-transparent text-[#4A5578] border border-[#1C2338] rounded px-6 py-[11px] text-[11px] tracking-[0.1em] uppercase font-semibold cursor-pointer transition-all"
    >
      {children}
    </button>
  );
}

// ─── Step 1: KYC ─────────────────────────────────────────────────────────────

const KYC_SUBSTEPS = ["Identity", "Document", "Selfie", "Review"];

function StepKYC({ onNext }: { onNext: () => void }) {
  const [sub, setSub] = useState(0);
  const [form, setForm] = useState({
    firstName: "", lastName: "", dob: "",
    country: "UG", docType: "passport",
    docNumber: "", docExpiry: "",
  });

  const countries = [
    { value: "UG", label: "Uganda" },
    { value: "KE", label: "Kenya" },
    { value: "TZ", label: "Tanzania" },
    { value: "NG", label: "Nigeria" },
    { value: "GH", label: "Ghana" },
    { value: "ZA", label: "South Africa" },
    { value: "US", label: "United States" },
    { value: "GB", label: "United Kingdom" },
  ];
  const docTypes = [
    { value: "passport",        label: "Passport" },
    { value: "national_id",     label: "National ID" },
    { value: "drivers_license", label: "Driver's Licence" },
  ];

  const set = (key: string) => (val: string) => setForm(f => ({ ...f, [key]: val }));

  const canProceed = sub === 0
    ? form.firstName && form.lastName && form.dob
    : sub === 1
    ? form.docNumber && form.docExpiry
    : true;

  return (
    <div>
      {/* Substep progress */}
      <div style={{ display: "flex", gap: 0, marginBottom: 32 }}>
        {KYC_SUBSTEPS.map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center", flex: i < KYC_SUBSTEPS.length - 1 ? 1 : "auto" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: i < sub ? "#00E5A0" : i === sub ? "transparent" : "transparent",
                border: i < sub ? "none" : i === sub ? "2px solid #00E5A0" : "2px solid #1C2338",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.25s",
              }}>
                {i < sub
                  ? <span style={{ color: "#0A0D14", fontSize: 12, fontWeight: 700 }}>✓</span>
                  : <span style={{ color: i === sub ? "#00E5A0" : "#2A3050", fontFamily: "var(--font-open-sans), monospace", fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
                }
              </div>
              <Label style={{ whiteSpace: "nowrap" }}>{s}</Label>
            </div>
            {i < KYC_SUBSTEPS.length - 1 && (
              <div style={{
                flex: 1,
                height: 1,
                background: i < sub ? "#00E5A0" : "#1C2338",
                margin: "0 8px",
                marginBottom: 22,
                transition: "background 0.3s",
              }} />
            )}
          </div>
        ))}
      </div>

      {/* Substep content */}
      {sub === 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <SectionHeader title="Personal Information" sub="Matches your government-issued ID exactly." />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Input label="First Name" placeholder="As on ID" value={form.firstName} onChange={set("firstName")} />
            <Input label="Last Name" placeholder="As on ID" value={form.lastName} onChange={set("lastName")} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Input label="Date of Birth" type="date" placeholder="YYYY-MM-DD" value={form.dob} onChange={set("dob")} />
            <Select label="Country of Residence" value={form.country} onChange={set("country")} options={countries} />
          </div>
          <InfoBox text="Your details are encrypted end-to-end and shared only with our KYC provider for verification." />
        </div>
      )}

      {sub === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <SectionHeader title="Document Details" sub="Provide the document you will upload for verification." />
          <Select label="Document Type" value={form.docType} onChange={set("docType")} options={docTypes} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Input label="Document Number" placeholder="e.g. A1234567" value={form.docNumber} onChange={set("docNumber")} />
            <Input label="Expiry Date" type="date" value={form.docExpiry} onChange={set("docExpiry")} />
          </div>
          <UploadZone label="DOCUMENT SCAN" hint="Front + back if applicable. JPG, PNG, or PDF under 10MB." />
        </div>
      )}

      {sub === 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <SectionHeader title="Identity Selfie" sub="A live photo matching the face on your document." />
          <UploadZone label="SELFIE PHOTO" hint="Clear face, no sunglasses. JPG or PNG under 5MB." tall />
          <InfoBox text="Your selfie is compared against your document automatically. It is never stored beyond the verification window." />
        </div>
      )}

      {sub === 3 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <SectionHeader title="Review & Submit" sub="Check your details before submitting for verification." />
          <div style={{ background: "#0E111A", border: "1px solid #1C2338", borderRadius: 4, padding: "4px 16px" }}>
            <FieldRow label="Full Name"     value={`${form.firstName} ${form.lastName}` || "—"} />
            <FieldRow label="Date of Birth" value={form.dob || "—"} />
            <FieldRow label="Country"       value={countries.find(c => c.value === form.country)?.label || ""} />
            <FieldRow label="Document"      value={docTypes.find(d => d.value === form.docType)?.label || ""} />
            <FieldRow label="Doc Number"    value={form.docNumber || "—"} />
            <FieldRow label="Doc Expiry"    value={form.docExpiry || "—"} />
            <FieldRow label="Status"        value="PENDING REVIEW" highlight="amber" />
          </div>
          <InfoBox text="Review typically completes within 2–5 minutes. You'll be notified by email and can continue setup while we verify." />
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32 }}>
        {sub > 0
          ? <GhostButton onClick={() => setSub(s => s - 1)}>← Back</GhostButton>
          : <div />
        }
        {sub < KYC_SUBSTEPS.length - 1
          ? <PrimaryButton onClick={() => setSub(s => s + 1)} disabled={!canProceed}>Continue →</PrimaryButton>
          : <PrimaryButton onClick={onNext}>Submit for Review →</PrimaryButton>
        }
      </div>
    </div>
  );
}

// ─── Step 2: Plan ─────────────────────────────────────────────────────────────

function StepPlan({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [selected, setSelected] = useState("stella_unum");

  return (
    <div>
      <SectionHeader title="Choose Your Plan" sub="You can change your plan at any time after onboarding." />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 24 }}>
        {TIERS.map(tier => {
          const active = selected === tier.key;
          return (
            <div
              key={tier.key}
              onClick={() => setSelected(tier.key)}
              style={{
                background: "#0E111A",
                border: `1px solid ${active ? tier.accent : "#1C2338"}`,
                borderTop: `3px solid ${active ? tier.accent : "#1C2338"}`,
                borderRadius: 4,
                padding: "20px 18px",
                cursor: "pointer",
                transition: "all 0.2s",
                position: "relative",
              }}
            >
              {tier.badge && (
                <div style={{
                  position: "absolute", top: -1, right: 16,
                  background: tier.accent, color: "#0A0D14",
                  fontFamily: "var(--font-open-sans), monospace",
                  fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em",
                  padding: "2px 8px", borderRadius: "0 0 3px 3px",
                }}>
                  {tier.badge}
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <span style={{ color: tier.accent, fontFamily: "var(--font-open-sans), monospace", fontSize: 13, fontWeight: 700, letterSpacing: "0.05em" }}>
                    {tier.name}
                  </span>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ color: "#C8CDE0", fontFamily: "var(--font-open-sans), monospace", fontSize: 18, fontWeight: 700 }}>{tier.price}</span>
                    <span style={{ color: "#4A5578", fontFamily: "var(--font-open-sans), monospace", fontSize: 10 }}>{tier.sub}</span>
                  </div>
                </div>
                <span style={{ color: "#4A5578", fontFamily: "var(--font-open-sans), monospace", fontSize: 10, letterSpacing: "0.04em" }}>{tier.fee}</span>
              </div>

              <div style={{ borderTop: "1px solid #161B28", paddingTop: 12, marginBottom: 14 }}>
                {tier.features.map(f => (
                  <div key={f.label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0" }}>
                    <Label>{f.label}</Label>
                    {typeof f.value === "boolean"
                      ? <span style={{ fontFamily: "var(--font-open-sans), monospace", fontSize: 11, color: f.value ? "#00E5A0" : "#3D4560" }}>
                          {f.value ? "✓ Yes" : "× No"}
                        </span>
                      : <span style={{ fontFamily: "var(--font-open-sans), monospace", fontSize: 11, color: "#C8CDE0" }}>{f.value}</span>
                    }
                  </div>
                ))}
              </div>

              <p style={{ color: "#8FA3B8", fontSize: 11, lineHeight: 1.5, fontFamily: "var(--font-open-sans), monospace", margin: 0 }}>
                {tier.description}
              </p>

              <div style={{
                marginTop: 16,
                height: 1,
                background: active ? `${tier.accent}30` : "transparent",
              }} />
              {active && (
                <div style={{
                  marginTop: 12,
                  padding: "6px 10px",
                  background: `${tier.accent}15`,
                  border: `1px solid ${tier.accent}40`,
                  borderRadius: 3,
                  textAlign: "center",
                  fontFamily: "var(--font-open-sans), monospace",
                  fontSize: "10px",
                  color: tier.accent,
                  letterSpacing: "0.1em",
                  fontWeight: 700,
                }}>
                  SELECTED
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28 }}>
        <GhostButton onClick={onBack}>← Back</GhostButton>
        <PrimaryButton onClick={onNext}>Continue with {TIERS.find(t => t.key === selected)?.name} →</PrimaryButton>
      </div>
    </div>
  );
}

// ─── Step 3: Connect Exchange ─────────────────────────────────────────────────

function StepExchange({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [configured, setConfigured] = useState<Record<string, { apiKey: string; apiSecret: string }>>({});
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [validating, setValidating] = useState(false);

  const logoColors: Record<string, string> = { B: "#F0B90B", A: "#FF5733", H: "#6C63FF", R: "#00C805" };

  const handleValidate = () => {
    if (!apiKey || !apiSecret || !selected) return;
    setValidating(true);
    setTimeout(() => {
      setValidating(false);
      setConfigured(c => ({ ...c, [selected]: { apiKey, apiSecret } }));
    }, 1600);
  };

  const hasAny = Object.keys(configured).length > 0;

  return (
    <div>
      <SectionHeader title="Connect Your Exchange" sub="Your keys never leave our encrypted vault. Read + trade permissions only — never withdrawal." />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 24 }}>
        {EXCHANGES.map(ex => {
          const done = !!configured[ex.id];
          const active = selected === ex.id;
          return (
            <div
              key={ex.id}
              onClick={() => { setSelected(ex.id); setApiKey(""); setApiSecret(""); }}
              style={{
                background: "#0E111A",
                border: `1px solid ${done ? "#00E5A040" : active ? "#1C2338" : "#1C2338"}`,
                borderLeft: `3px solid ${done ? "#00E5A0" : active ? "#00E5A0" : "#1C2338"}`,
                borderRadius: 4,
                padding: "14px 16px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 14,
                transition: "all 0.15s",
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 4,
                background: `${logoColors[ex.logo]}20`,
                border: `1px solid ${logoColors[ex.logo]}30`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-open-sans), monospace",
                fontSize: 14, fontWeight: 700,
                color: logoColors[ex.logo],
                flexShrink: 0,
              }}>
                {ex.logo}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#C8CDE0", fontFamily: "var(--font-open-sans), monospace", fontSize: 13, fontWeight: 600 }}>{ex.name}</div>
                <Label>{ex.type}</Label>
              </div>
              {done && (
                <div style={{
                  background: "#00E5A015",
                  border: "1px solid #00E5A040",
                  borderRadius: 3,
                  padding: "3px 8px",
                  fontFamily: "var(--font-open-sans), monospace",
                  fontSize: "9px",
                  color: "#00E5A0",
                  letterSpacing: "0.1em",
                  flexShrink: 0,
                }}>CONNECTED</div>
              )}
            </div>
          );
        })}
      </div>

      {selected && !configured[selected] && (
        <div style={{
          background: "#0E111A",
          border: "1px solid #1C2338",
          borderRadius: 4,
          padding: 20,
          marginTop: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <div style={{
              background: "#1C2338",
              border: "1px solid #252D42",
              borderRadius: 3,
              padding: "4px 10px",
              fontFamily: "var(--font-open-sans), monospace",
              fontSize: "10px",
              color: "#C8CDE0",
              letterSpacing: "0.06em",
            }}>
              {EXCHANGES.find(e => e.id === selected)?.name}
            </div>
            <span style={{ color: "#3D4560", fontSize: 12 }}>→</span>
            <Label>API Credentials</Label>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Input
              label="API Key"
              placeholder="Paste your API key"
              value={apiKey}
              onChange={setApiKey}
              hint="Enable read + trade permissions. Do NOT enable withdrawal."
            />
            <Input
              label="API Secret"
              type="password"
              placeholder="Paste your API secret"
              value={apiSecret}
              onChange={setApiSecret}
              hint="Encrypted immediately on submission. Never stored in plaintext."
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <PrimaryButton onClick={handleValidate} disabled={!apiKey || !apiSecret || validating}>
              {validating ? "Validating..." : "Validate & Connect"}
            </PrimaryButton>
          </div>
        </div>
      )}

      {selected && configured[selected] && (
        <div style={{
          background: "#0A120E",
          border: "1px solid #00E5A030",
          borderRadius: 4,
          padding: "14px 18px",
          marginTop: 16,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}>
          <span style={{ color: "#00E5A0", fontSize: 18 }}>✓</span>
          <div>
            <div style={{ color: "#00E5A0", fontFamily: "var(--font-open-sans), monospace", fontSize: 12, fontWeight: 700 }}>
              {EXCHANGES.find(e => e.id === selected)?.name} connected successfully
            </div>
            <Label>Read + trade permissions verified. IP whitelist recommended.</Label>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28 }}>
        <GhostButton onClick={onBack}>← Back</GhostButton>
        <PrimaryButton onClick={onNext} disabled={!hasAny}>
          Continue →
        </PrimaryButton>
      </div>
    </div>
  );
}

// ─── Step 4: Allocate Capital ─────────────────────────────────────────────────

function StepCapital({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [allocation, setAllocation] = useState(500);
  const maxBalance = 12400;
  const pct = Math.round((allocation / maxBalance) * 100);

  const sliderPct = (allocation / maxBalance) * 100;

  return (
    <div>
      <SectionHeader title="Allocate Trading Capital" sub="Set the maximum balance your bots can trade with. Your funds stay on your exchange at all times." />

      <div style={{ background: "#0E111A", border: "1px solid #1C2338", borderRadius: 4, padding: "4px 16px", marginTop: 24, marginBottom: 20 }}>
        <FieldRow label="Exchange"          value="Binance" />
        <FieldRow label="Total Balance"     value="$12,400.00" />
        <FieldRow label="Allocated"         value={`$${allocation.toLocaleString()}`} highlight="green" />
        <FieldRow label="Unallocated"       value={`$${(maxBalance - allocation).toLocaleString()}`} />
        <FieldRow label="Allocation"        value={`${pct}%`} />
      </div>

      <div style={{ background: "#0E111A", border: "1px solid #1C2338", borderRadius: 4, padding: 20, marginBottom: 20 }}>
        <Label>Allocation Amount (USD)</Label>
        <div style={{ marginTop: 16, marginBottom: 12 }}>
          <div style={{ position: "relative", height: 4, background: "#1C2338", borderRadius: 2 }}>
            <div style={{
              position: "absolute", left: 0, top: 0, bottom: 0,
              width: `${sliderPct}%`,
              background: "linear-gradient(90deg, #00B87A, #00E5A0)",
              borderRadius: 2,
              transition: "width 0.1s",
            }} />
            <input
              type="range"
              min={100}
              max={maxBalance}
              step={100}
              value={allocation}
              onChange={e => setAllocation(Number(e.target.value))}
              className="absolute top-1/2 -translate-y-1/2 left-0 right-0 w-full appearance-none bg-transparent m-0 p-0 h-5 cursor-pointer"
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <Label>$100</Label>
            <Label>${maxBalance.toLocaleString()}</Label>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "flex-end" }}>
          <Input
            label="Custom Amount"
            type="number"
            placeholder="Enter amount"
            value={allocation.toString()}
            onChange={v => setAllocation(Math.min(maxBalance, Math.max(100, Number(v))))}
            hint="Minimum $100. Funds remain on Binance — this is a budget ceiling only."
          />
          <div style={{ display: "flex", gap: 8, paddingBottom: 26 }}>
            {[25, 50, 75].map(p => (
              <button
                key={p}
                onClick={() => setAllocation(Math.round(maxBalance * p / 100))}
                className="bg-[#0B0E16] border border-[#1C2338] rounded px-[10px] py-2 text-[#4A5578] text-[10px] tracking-wider cursor-pointer transition-all whitespace-nowrap hover:border-primary hover:text-primary"
              >
                {p}%
              </button>
            ))}
          </div>
        </div>
      </div>

      <InfoBox text="Your bots will never trade beyond this allocation, even if your exchange balance grows. You can adjust this at any time from Capital Management." />

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28 }}>
        <GhostButton onClick={onBack}>← Back</GhostButton>
        <PrimaryButton onClick={onNext}>Activate Portal →</PrimaryButton>
      </div>
    </div>
  );
}

// ─── Complete Screen ──────────────────────────────────────────────────────────

function StepComplete() {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px" }}>
      <div style={{
        width: 64, height: 64, borderRadius: "50%",
        background: "#00E5A015",
        border: "2px solid #00E5A060",
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 24px",
        fontSize: 28,
      }}>
        ✓
      </div>
      <h2 style={{
        color: "#00E5A0",
        fontFamily: "var(--font-open-sans), monospace",
        fontSize: 18, fontWeight: 700,
        letterSpacing: "0.08em",
        margin: "0 0 10px",
      }}>
        ACCOUNT ACTIVE
      </h2>
      <p style={{ color: "#8FA3B8", fontFamily: "var(--font-open-sans), monospace", fontSize: 12, lineHeight: 1.7, margin: "0 0 36px" }}>
        Your identity is under review. In the meantime,<br />
        explore strategies and configure your first bot.
      </p>
      <div style={{ background: "#0E111A", border: "1px solid #1C2338", borderRadius: 4, padding: "4px 20px", marginBottom: 28, textAlign: "left" }}>
        <FieldRow label="KYC Status"   value="UNDER REVIEW" highlight="amber" />
        <FieldRow label="Exchange"     value="Binance — Connected" highlight="green" />
        <FieldRow label="Allocation"   value="$500.00 ready" highlight="green" />
        <FieldRow label="Plan"         value="Stella Unum" highlight="green" />
      </div>
      <PrimaryButton onClick={() => {}}>Go to Dashboard →</PrimaryButton>
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <h3 style={{
        color: "#C8CDE0",
        fontFamily: "var(--font-open-sans), monospace",
        fontSize: 15, fontWeight: 700,
        letterSpacing: "0.04em",
        margin: "0 0 6px",
      }}>{title}</h3>
      <p style={{
        color: "#8FA3B8",
        fontFamily: "var(--font-open-sans), monospace",
        fontSize: 11, margin: 0, lineHeight: 1.5,
      }}>{sub}</p>
    </div>
  );
}

function InfoBox({ text }: { text: string }) {
  return (
    <div style={{
      background: "#0A0F1A",
      border: "1px solid #1C2338",
      borderLeft: "3px solid #00E5A040",
      borderRadius: 4,
      padding: "11px 14px",
      fontFamily: "var(--font-open-sans), monospace",
      fontSize: 11, color: "#8FA3B8", lineHeight: 1.6,
    }}>
      {text}
    </div>
  );
}

function UploadZone({ label, hint, tall }: { label: string; hint: string; tall?: boolean }) {
  const [dragging, setDragging] = useState(false);
  const [uploaded, setUploaded] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Label>{label}</Label>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); setUploaded(true); }}
        onClick={() => setUploaded(true)}
        style={{
          background: dragging ? "#00E5A008" : "#0B0E16",
          border: `2px dashed ${uploaded ? "#00E5A050" : dragging ? "#00E5A080" : "#1C2338"}`,
          borderRadius: 4,
          minHeight: tall ? 160 : 100,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          cursor: "pointer",
          transition: "all 0.15s",
        }}
      >
        {uploaded ? (
          <>
            <span style={{ color: "#00E5A0", fontSize: 22 }}>✓</span>
            <Label style={{ color: "#00E5A0" }}>File uploaded</Label>
          </>
        ) : (
          <>
            <span style={{ color: "#2A3050", fontSize: 22 }}>⬆</span>
            <Label>Drag & drop or click to upload</Label>
            <span style={{ color: "#2A3050", fontFamily: "var(--font-open-sans), monospace", fontSize: 10 }}>{hint}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Root Wizard ──────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const next = () => setStep(s => Math.min(s + 1, 5));
  const back = () => setStep(s => Math.max(s - 1, 1));

  return (
    <>
      <style jsx global>{`
        input[type=range]::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #00E5A0;
          border: 2px solid #0A0D14;
          box-shadow: 0 0 8px #00E5A060;
          cursor: pointer;
        }
        input[type=range]::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #00E5A0;
          border: 2px solid #0A0D14;
          cursor: pointer;
        }
        select option {
          background: #12151C;
        }
      `}</style>

      <DotPatternBackground />

      <div style={{
        minHeight: "100vh",
        background: "transparent",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "32px 16px 64px",
        position: "relative",
        zIndex: 1,
      }}>

        {/* Logo */}
        <div style={{ marginBottom: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Image
            src="/stella.svg"
            alt="Stella Logo"
            width={160}
            height={42}
            className="h-8 w-auto"
          />
        </div>

        {/* Main card */}
        <div style={{
          width: "100%",
          maxWidth: 780,
          background: "#12151C",
          border: "1px solid #1C2338",
          borderRadius: 6,
          overflow: "hidden",
        }}>

          {/* Header bar */}
          <div style={{
            padding: "18px 28px",
            borderBottom: "1px solid #161B28",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <div>
              <h1 style={{
                color: "#C8CDE0",
                fontFamily: "var(--font-open-sans), monospace",
                fontSize: 15, fontWeight: 700, letterSpacing: "0.06em",
                margin: "0 0 3px",
              }}>
                {step <= 4 ? "Account Setup" : "Setup Complete"}
              </h1>
              <p style={{ color: "#8FA3B8", fontFamily: "var(--font-open-sans), monospace", fontSize: 10, letterSpacing: "0.06em" }}>
                {step <= 4 ? `Step ${step} of 4 — ${STEPS[step - 1].label}` : "Your portal is ready"}
              </p>
            </div>

            {/* Step pills */}
            {step <= 4 && (
              <div style={{ display: "flex", gap: 6 }}>
                {STEPS.map(s => (
                  <div key={s.id} style={{
                    width: 28, height: 4, borderRadius: 2,
                    background: s.id <= step ? "#00E5A0" : "#1C2338",
                    transition: "background 0.3s",
                  }} />
                ))}
              </div>
            )}
          </div>

          {/* Step content */}
          <div style={{ padding: 28 }}>
            {step === 1 && <StepKYC onNext={next} />}
            {step === 2 && <StepPlan onNext={next} onBack={back} />}
            {step === 3 && <StepExchange onNext={next} onBack={back} />}
            {step === 4 && <StepCapital onNext={next} onBack={back} />}
            {step === 5 && <StepComplete />}
          </div>
        </div>

        {/* Footer */}
        <Footer variant="minimal" showLogo={false} className="mt-8" />
      </div>
    </>
  );
}
