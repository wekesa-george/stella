"use client";

import { useState } from "react";

export default function BillingPage() {
  const [f, setF] = useState({
    perfFee: 20,
    calcMethod: "monthly",
    paymentGateway: "stripe",
    invoicePrefix: "STLA",
    invoiceFooter: "Stella Financial Technologies Ltd.",
    vatRate: 18,
    vatEnabled: true,
  });

  const [dirty, setDirty] = useState(false);

  const set = (k: string, v: any) => {
    setF((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };

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
        <div className="font-mono text-[11px] md:text-[13px] font-semibold text-[#e8edf3] tracking-wider mb-1">Billing & Fees</div>
        <div className="font-mono text-[10px] text-[#5a7090]">
          Platform fee structure, payment gateway, and invoice configuration.
        </div>
      </div>

      {/* Platform Fee Structure */}
      <div className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#8fa3b8]">Platform Fee Structure</div>
        </div>
        <div className="px-4 py-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="flex flex-col gap-3.5">
              <RangeField
                label="Performance Fee"
                value={f.perfFee}
                min={0}
                max={50}
                step={0.5}
                unit="%"
                hint="Percentage of user profits charged by the platform. Applied to profitable months only."
                onChange={(v) => set("perfFee", v)}
              />
              <Field label="Fee Calculation Period">
                <select
                  className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full cursor-pointer"
                  value={f.calcMethod}
                  onChange={(e) => set("calcMethod", e.target.value)}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </Field>
              <Field label="High-Watermark Reset" hint="Performance fee is only charged on new highs above the high-watermark.">
                <select
                  className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full cursor-pointer"
                  defaultValue="annual"
                >
                  <option value="never">Never (rolling)</option>
                  <option value="annual">Annual</option>
                  <option value="monthly">Monthly</option>
                </select>
              </Field>
            </div>

            {/* Right Column */}
            <div className="flex flex-col gap-3.5">
              <Field label="Payment Gateway">
                <select
                  className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full cursor-pointer"
                  value={f.paymentGateway}
                  onChange={(e) => set("paymentGateway", e.target.value)}
                >
                  <option value="stripe">Stripe</option>
                  <option value="flutterwave">Flutterwave</option>
                  <option value="paystack">Paystack</option>
                  <option value="mtn_momo">MTN Mobile Money</option>
                </select>
              </Field>
              <Field label="VAT Rate (%)">
                <input
                  className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                  type="number"
                  value={f.vatRate}
                  onChange={(e) => set("vatRate", +e.target.value)}
                />
              </Field>
              <ToggleRow
                label="Apply VAT to subscriptions"
                sub="Adds the configured VAT rate to all subscription invoices."
                checked={f.vatEnabled}
                onChange={(v) => set("vatEnabled", v)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Invoice Configuration */}
      <div className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#8fa3b8]">Invoice Configuration</div>
        </div>
        <div className="px-4 py-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Field label="Invoice Number Prefix">
              <input
                className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                value={f.invoicePrefix}
                onChange={(e) => set("invoicePrefix", e.target.value)}
              />
            </Field>
            <Field label="Legal Entity Name (for invoice footer)">
              <input
                className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                value={f.invoiceFooter}
                onChange={(e) => set("invoiceFooter", e.target.value)}
              />
            </Field>
            <Field label="Invoice Due Days" hint="Number of days until invoice is considered overdue.">
              <input
                className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                type="number"
                defaultValue={7}
                onChange={() => setDirty(true)}
              />
            </Field>
            <Field label="Payment Failure Grace Period (days)">
              <input
                className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                type="number"
                defaultValue={3}
                onChange={() => setDirty(true)}
              />
            </Field>
          </div>
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
