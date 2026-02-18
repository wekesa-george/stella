"use client";

import { useState } from "react";

export default function CompliancePage() {
  const [c, setC] = useState({
    amlThreshold: 5000000,
    amlCurrency: "UGX",
    sanctionsLists: "OFAC,UN,EU",
    tradeReportThreshold: 10000000,
    dataRetentionYears: 7,
    gdprEnabled: true,
    autoSuspendOnAmlHit: true,
    requireReasonForOverride: true,
    sanctionsRefreshDays: 1,
  });

  const [dirty, setDirty] = useState(false);

  const set = (k: string, v: any) => {
    setC((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };

  const restrictions = [
    { country: "Iran (IR)", reason: "OFAC sanctions", status: "blocked" },
    { country: "North Korea (KP)", reason: "OFAC sanctions", status: "blocked" },
    { country: "Russia (RU)", reason: "EU/US sanctions — restricted products only", status: "restricted" },
    { country: "Belarus (BY)", reason: "EU sanctions", status: "restricted" },
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
        <div className="font-mono text-[11px] md:text-[13px] font-semibold text-[#e8edf3] tracking-wider mb-1">Compliance & Regulatory</div>
        <div className="font-mono text-[10px] text-[#5a7090]">
          AML thresholds, sanctions screening, data retention, and jurisdiction restrictions.
        </div>
      </div>

      {/* AML Transaction Monitoring */}
      <div className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#8fa3b8]">AML Transaction Monitoring</div>
        </div>
        <div className="px-4 py-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Field label="AML Flag Threshold" hint="Transactions above this value are flagged for compliance review.">
              <div className="flex gap-1.5">
                <input
                  className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none flex-1 transition-all focus:border-[#253550]"
                  type="number"
                  value={c.amlThreshold}
                  onChange={(e) => set("amlThreshold", +e.target.value)}
                />
                <select
                  className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-[100px] cursor-pointer"
                  value={c.amlCurrency}
                  onChange={(e) => set("amlCurrency", e.target.value)}
                >
                  <option>UGX</option>
                  <option>USD</option>
                  <option>KES</option>
                  <option>ZAR</option>
                </select>
              </div>
            </Field>
            <Field
              label="Regulatory Report Threshold"
              hint="Transactions above this value are automatically included in regulatory reports."
            >
              <input
                className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                type="number"
                value={c.tradeReportThreshold}
                onChange={(e) => set("tradeReportThreshold", +e.target.value)}
              />
            </Field>
            <Field label="Sanctions Lists" hint="Comma-separated. OFAC, UN, EU, HMT supported.">
              <input
                className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                value={c.sanctionsLists}
                onChange={(e) => set("sanctionsLists", e.target.value)}
              />
            </Field>
            <Field label="Sanctions Refresh Interval (days)" hint="How often to re-screen all users against updated lists.">
              <input
                className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                type="number"
                value={c.sanctionsRefreshDays}
                onChange={(e) => set("sanctionsRefreshDays", +e.target.value)}
              />
            </Field>
          </div>
          <div className="h-px bg-[#1e2d40] my-3.5" />
          <ToggleRow
            label="Auto-suspend on AML watchlist hit"
            sub="Immediately suspend account and flag for manual review on any sanctions match."
            checked={c.autoSuspendOnAmlHit}
            onChange={(v) => set("autoSuspendOnAmlHit", v)}
          />
          <ToggleRow
            label="Require written reason for compliance overrides"
            sub="Compliance officers must provide a documented reason for all manual approvals/declines."
            checked={c.requireReasonForOverride}
            onChange={(v) => set("requireReasonForOverride", v)}
          />
          <ToggleRow
            label="Enable GDPR data subject request handling"
            sub="Allow users to submit data export and deletion requests from the user portal."
            checked={c.gdprEnabled}
            onChange={(v) => set("gdprEnabled", v)}
          />
        </div>
      </div>

      {/* Data Retention Policy */}
      <div className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#8fa3b8]">Data Retention Policy</div>
        </div>
        <div className="px-4 py-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[
              ["Trade History Retention (years)", "tradeRetention", 7],
              ["User Data Retention (years)", "userRetention", 7],
              ["Audit Log Retention (years)", "auditRetention", 7],
              ["KYC Document Retention (years)", "kycRetention", 10],
            ].map(([label, key, def]) => (
              <Field key={key as string} label={label as string} hint="Minimum 7 years required by most financial regulations.">
                <input
                  className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                  type="number"
                  defaultValue={def}
                  onChange={() => setDirty(true)}
                />
              </Field>
            ))}
          </div>
          <div className="px-3 py-2 rounded bg-[rgba(61,157,243,0.10)] border border-[rgba(61,157,243,0.25)] font-mono text-[10px] text-[#3d9df3] flex items-start gap-2 leading-relaxed mt-3.5">
            <span>ℹ</span>
            <span>
              All retention periods are enforced by automated cleanup jobs. Records flagged for active investigation are exempt from
              automated deletion.
            </span>
          </div>
        </div>
      </div>

      {/* Jurisdiction Restrictions */}
      <div className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40] flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#8fa3b8]">Jurisdiction Restrictions</div>
          <button className="px-3 py-1.5 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] hover:border-[#253550] transition-all">
            + Add Restriction
          </button>
        </div>
        <div className="p-0 overflow-x-auto">
          <table className="w-full border-collapse min-w-[600px]">
            <thead>
              <tr>
                <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3.5 py-2 text-left border-b border-[#1e2d40] bg-[#131920] font-medium whitespace-nowrap">
                  Country
                </th>
                <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3.5 py-2 text-left border-b border-[#1e2d40] bg-[#131920] font-medium whitespace-nowrap">
                  Reason
                </th>
                <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3.5 py-2 text-left border-b border-[#1e2d40] bg-[#131920] font-medium whitespace-nowrap">
                  Status
                </th>
                <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3.5 py-2 text-left border-b border-[#1e2d40] bg-[#131920] font-medium whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody>
              {restrictions.map((r, i) => (
                <tr key={i} className="hover:bg-[#131920]">
                  <td className="px-3.5 py-2.5 border-b border-[#1e2d40] last:border-b-0 font-semibold text-[#e8edf3]">
                    {r.country}
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-[#1e2d40] last:border-b-0 text-[#5a7090] text-[11px]">{r.reason}</td>
                  <td className="px-3.5 py-2.5 border-b border-[#1e2d40] last:border-b-0">
                    <span
                      className={`px-2 py-0.5 rounded-sm font-mono text-[9px] font-bold uppercase tracking-wide ${
                        r.status === "blocked"
                          ? "bg-[rgba(255,71,87,0.10)] text-[#ff4757]"
                          : "bg-[rgba(245,166,35,0.10)] text-[#f5a623]"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-[#1e2d40] last:border-b-0">
                    <button className="px-2 py-1 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[8px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] transition-all">
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
              className="px-3 py-1.5 rounded border bg-[rgba(0,229,160,0.10)] text-[#00e5a0] border-[rgba(0,229,160,0.3)] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#00e5a0] hover:text-black transition-all"
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
          checked ? "bg-[rgba(0,229,160,0.10)] border-[rgba(0,229,160,0.4)]" : "bg-[#1a2230] border-[#253550]"
        }`}
      >
        <span
          className={`absolute h-3.5 w-3.5 rounded-full transition-all duration-200 left-0.5 top-0.5 ${
            checked ? "translate-x-4 bg-[#00e5a0]" : "translate-x-0 bg-[#5a7090]"
          }`}
        />
      </span>
    </label>
  );
}
