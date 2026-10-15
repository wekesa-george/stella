"use client";

import { useState } from "react";

export default function NotificationsPage() {
  const [dirty, setDirty] = useState(false);

  const channels = [
    { key: "slack", icon: "💬", name: "Slack", active: true, hasWebhook: true },
    { key: "pagerduty", icon: "🚨", name: "PagerDuty", active: true, hasWebhook: true },
    { key: "email", icon: "📧", name: "Email", active: true, hasWebhook: false },
    { key: "sms", icon: "📱", name: "SMS", active: false, hasWebhook: false },
  ];

  const severities = [
    { key: "critical", col: "#ff4757", label: "Critical" },
    { key: "warning", col: "#f5a623", label: "Warning" },
    { key: "info", col: "#3d9df3", label: "Info" },
  ];

  const [routing, setRouting] = useState({
    slack: { critical: true, warning: true, info: false },
    pagerduty: { critical: true, warning: false, info: false },
    email: { critical: true, warning: true, info: true },
    sms: { critical: true, warning: false, info: false },
  });

  const alerts = [
    { key: "circuit_breaker", label: "Circuit breaker triggered", default_sev: "critical" },
    { key: "bot_killed", label: "Bot killed (manual or auto)", default_sev: "warning" },
    { key: "drawdown_approach", label: "Drawdown approaching threshold", default_sev: "warning" },
    { key: "kyc_manual_review", label: "KYC applicant needs manual review", default_sev: "info" },
    { key: "exchange_degraded", label: "Exchange connection degraded", default_sev: "warning" },
    { key: "infra_cpu_high", label: "Infrastructure CPU > 70%", default_sev: "warning" },
    { key: "shift_handoff", label: "Shift handoff due", default_sev: "info" },
    { key: "failed_payment", label: "User payment failed", default_sev: "info" },
  ];

  const [alertEnabled, setAlertEnabled] = useState(Object.fromEntries(alerts.map((a) => [a.key, true])));
  const [dedupWindow, setDedupWindow] = useState(5);

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
        <div className="font-mono text-[11px] md:text-[13px] font-semibold text-[#e8edf3] tracking-wider mb-1">Notifications & Alerts</div>
        <div className="font-mono text-[10px] text-[#5a7090]">
          Configure where alerts go and under what conditions. Changes apply to future alerts immediately.
        </div>
      </div>

      {/* Channels */}
      <div className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#8fa3b8]">Channel Configuration</div>
        </div>
        <div className="flex flex-col gap-0 p-0">
          {channels.map((ch, idx) => (
            <div
              key={ch.key}
              className="bg-[#131920] border border-[#1e2d40] rounded overflow-hidden mx-4.5"
              style={{ marginBottom: 10, marginTop: idx === 0 ? 18 : 0 }}
            >
              <div className="px-3.5 py-2.5 flex items-center gap-2.5 border-b border-[#1e2d40]">
                <span className="text-base w-6 text-center">{ch.icon}</span>
                <span className="font-mono text-[11px] font-semibold text-[#e8edf3] flex-1">{ch.name}</span>
                <Toggle checked={ch.active} onChange={() => setDirty(true)} />
              </div>
              {ch.active && (
                <div className="px-3.5 py-3 flex flex-col gap-2.5">
                  {ch.hasWebhook && (
                    <Field label="Webhook URL">
                      <input
                        className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                        defaultValue={
                          ch.key === "slack"
                            ? "https://hooks.slack.com/services/T0••••/B0••••/x••••"
                            : "https://events.pagerduty.com/v2/enqueue/••••"
                        }
                      />
                    </Field>
                  )}
                  {ch.key === "email" && (
                    <Field label="Recipients (comma-separated)">
                      <input
                        className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                        defaultValue="ops@stella.io, alerts@stella.io"
                      />
                    </Field>
                  )}
                  {ch.key === "sms" && (
                    <Field label="Phone Numbers (E.164 format, comma-separated)">
                      <input
                        className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                        placeholder="+256700000000, +254700000000"
                      />
                    </Field>
                  )}
                  <div>
                    <div className="font-mono text-[9px] text-[#5a7090] text-transform uppercase tracking-wider mb-2">
                      Route Severities
                    </div>
                    {severities.map((s) => (
                      <div key={s.key} className="flex items-center gap-2 mb-1.5 last:mb-0">
                        <span className="font-mono text-[9px] uppercase tracking-wider w-[70px] flex-shrink-0" style={{ color: s.col }}>
                          {s.label}
                        </span>
                        <Toggle
                          checked={routing[ch.key as keyof typeof routing][s.key as keyof (typeof routing)["slack"]]}
                          onChange={(v) => {
                            setRouting((p) => ({
                              ...p,
                              [ch.key]: { ...p[ch.key as keyof typeof routing], [s.key]: v },
                            }));
                            setDirty(true);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          <div className="px-4.5 pb-4.5">
            <RangeField
              label="Alert Deduplication Window"
              value={dedupWindow}
              min={1}
              max={60}
              step={1}
              unit="min"
              hint="Suppress repeated identical alerts within this window. Prevents alert storms."
              onChange={(v) => {
                setDedupWindow(v);
                setDirty(true);
              }}
            />
          </div>
        </div>
      </div>

      {/* Per-alert toggles */}
      <div className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#8fa3b8]">Alert Types</div>
          <div className="text-[11px] text-[#5a7090] mt-0.5">Enable or disable individual alert events</div>
        </div>
        <div className="p-0 overflow-x-auto">
          <table className="w-full border-collapse min-w-[600px]">
            <thead>
              <tr>
                <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3.5 py-2 text-left border-b border-[#1e2d40] bg-[#131920] font-medium whitespace-nowrap">
                  Alert Event
                </th>
                <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3.5 py-2 text-left border-b border-[#1e2d40] bg-[#131920] font-medium whitespace-nowrap">
                  Default Severity
                </th>
                <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3.5 py-2 text-left border-b border-[#1e2d40] bg-[#131920] font-medium whitespace-nowrap">
                  Enabled
                </th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.key} className="hover:bg-[#131920]">
                  <td className="px-3.5 py-2.5 border-b border-[#1e2d40] last:border-b-0 font-mono text-[10px] text-[#8fa3b8]">
                    {a.label}
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-[#1e2d40] last:border-b-0">
                    <span
                      className={`px-2 py-0.5 rounded-sm font-mono text-[9px] font-bold uppercase tracking-wide ${
                        a.default_sev === "critical"
                          ? "bg-[rgba(255,71,87,0.10)] text-[#ff4757]"
                          : a.default_sev === "warning"
                          ? "bg-[rgba(245,166,35,0.10)] text-[#f5a623]"
                          : "bg-[rgba(61,157,243,0.10)] text-[#3d9df3]"
                      }`}
                    >
                      {a.default_sev}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-[#1e2d40] last:border-b-0">
                    <Toggle
                      checked={alertEnabled[a.key]}
                      onChange={(v) => {
                        setAlertEnabled((p) => ({ ...p, [a.key]: v }));
                        setDirty(true);
                      }}
                    />
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

function RangeField({
  label,
  value,
  min,
  max,
  step,
  unit,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  hint: string;
  onChange: (v: number) => void;
}) {
  const thumbColor = "#FFD700";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-baseline">
        <span className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090]">{label}</span>
        <span>
          <span className="font-mono text-[14px] font-semibold text-[#e8edf3]">{value}</span>
          <span className="font-mono text-[9px] text-[#5a7090] ml-0.5">{unit}</span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 bg-[#1a2230] rounded-sm outline-none cursor-pointer appearance-none"
        style={{
          background: `linear-gradient(to right, ${thumbColor} 0%, ${thumbColor} ${
            ((value - min) / (max - min)) * 100
          }%, #1a2230 ${((value - min) / (max - min)) * 100}%, #1a2230 100%)`,
        }}
      />
      <style jsx>{`
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: ${thumbColor};
          border: 2px solid #0d1117;
          cursor: pointer;
          transition: transform 0.1s;
        }
        input[type="range"]::-webkit-slider-thumb:hover {
          transform: scale(1.2);
        }
        input[type="range"]::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: ${thumbColor};
          border: 2px solid #0d1117;
          cursor: pointer;
          transition: transform 0.1s;
        }
        input[type="range"]::-moz-range-thumb:hover {
          transform: scale(1.2);
        }
      `}</style>
      {hint && <div className="font-mono text-[9px] text-[#3a5068]">{hint}</div>}
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
