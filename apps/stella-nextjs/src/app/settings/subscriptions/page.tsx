"use client";

import { useState } from "react";

export default function SubscriptionsPage() {
  const [dirty, setDirty] = useState(false);

  const tiers = [
    { key: "basic", name: "Basic", price: "$29/mo", color: "#5a7090", bots: 2, aum: "$10,000", exchanges: 2, strategies: 2, api: false, support: "Email" },
    { key: "pro", name: "Pro", price: "$99/mo", color: "#FFD700", bots: 10, aum: "$100,000", exchanges: 5, strategies: "All", api: true, support: "Priority Email" },
    { key: "enterprise", name: "Enterprise", price: "Custom", color: "#f5a623", bots: "Unlimited", aum: "Unlimited", exchanges: "All", strategies: "All", api: true, support: "Dedicated" },
  ];

  const LIMIT_ROWS: [string, string][] = [
    ["Max Bots", "bots"],
    ["Max AUM", "aum"],
    ["Exchanges", "exchanges"],
    ["Strategies", "strategies"],
    ["API Access", "api"],
    ["Support", "support"],
  ];

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
        <div className="font-mono text-[11px] md:text-[13px] font-semibold text-[#e8edf3] tracking-wider mb-1">Users & Subscriptions</div>
        <div className="font-mono text-[10px] text-[#5a7090]">Tier definitions, limits, and upgrade policy.</div>
      </div>

      {/* Tier cards */}
      <div className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40] flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#8fa3b8]">Subscription Tiers</div>
          <button className="px-3 py-1.5 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] hover:border-[#253550] transition-all">
            + Add Tier
          </button>
        </div>
        <div className="px-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {tiers.map((t) => (
              <div
                key={t.key}
                className="bg-[#131920] border border-[#1e2d40] rounded p-3.5 relative overflow-hidden"
                style={{ borderTop: `2px solid ${t.color}` }}
              >
                <div className="flex justify-between mb-3">
                  <div className="font-mono text-[12px] font-semibold" style={{ color: t.color }}>
                    {t.name}
                  </div>
                  <div className="font-mono text-[12px] font-semibold text-[#e8edf3]">{t.price}</div>
                </div>
                {LIMIT_ROWS.map(([label, key]) => (
                  <div
                    key={key}
                    className="flex justify-between py-1.5 border-b border-[#1e2d40] last:border-b-0 last:pb-0 font-mono text-[10px]"
                  >
                    <span className="text-[#5a7090]">{label}</span>
                    <span className="font-semibold" style={{ color: t.color }}>
                      {typeof t[key as keyof typeof t] === "boolean"
                        ? t[key as keyof typeof t]
                          ? "✓ Yes"
                          : "✕ No"
                        : t[key as keyof typeof t]}
                    </span>
                  </div>
                ))}
                <button className="mt-2.5 w-full px-3 py-1.5 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] transition-all flex items-center justify-center">
                  Edit Tier
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Upgrade flow */}
      <div className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#8fa3b8]">Upgrade Policy</div>
        </div>
        <div className="px-4 py-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="flex flex-col gap-3.5">
              <Field label="Tier Upgrade Method" hint="How users move to a higher tier.">
                <select className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full cursor-pointer">
                  <option>Automatic on payment</option>
                  <option>Manual approval required</option>
                  <option>Automatic with KYC gate</option>
                </select>
              </Field>
              <Field label="Trial Period (days)" hint="Days of Pro access before requiring payment.">
                <input
                  className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                  type="number"
                  defaultValue={14}
                />
              </Field>
              <Field label="Grace Period on Failed Payment" hint="Days before bots are suspended after a failed billing attempt.">
                <input
                  className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                  type="number"
                  defaultValue={3}
                />
              </Field>
            </div>
            <div className="flex flex-col gap-3.5">
              <Field label="Enhanced KYC AUM Threshold (UGX)" hint="Trigger re-verification when user AUM crosses this.">
                <input
                  className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                  type="number"
                  defaultValue={10000000}
                />
              </Field>
              <Field label="Referral Commission (%)" hint="Percentage of referred user's monthly fee paid to referrer.">
                <input
                  className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                  type="number"
                  defaultValue={10}
                />
              </Field>
            </div>
          </div>
          <div className="h-px bg-[#1e2d40] my-3.5" />
          <ToggleRow
            label="Enable trial period"
            sub="New users automatically get trial Pro access."
            checked={true}
            onChange={() => setDirty(true)}
          />
          <ToggleRow
            label="Enable referral programme"
            sub="Users can generate referral codes and earn commission."
            checked={false}
            onChange={() => setDirty(true)}
          />
          <ToggleRow
            label="Require KYC before trading"
            sub="Users cannot activate bots until KYC is approved."
            checked={true}
            onChange={() => setDirty(true)}
          />
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

function ToggleRow({
  label,
  sub,
  checked,
  onChange,
}: {
  label: string;
  sub: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[#1e2d40] last:border-b-0 last:pb-0">
      <div>
        <div className="text-[12px] text-[#e8edf3] font-medium">{label}</div>
        <div className="font-mono text-[9px] text-[#5a7090] mt-0.5">{sub}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} />
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
