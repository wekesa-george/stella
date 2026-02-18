"use client";

import { useState } from "react";

export default function RiskControlsPage() {
  const [r, setR] = useState({
    maxDrawdown: 10,
    dailyLossLimit: 5,
    maxPositionSize: 8,
    maxConcurrentPositions: 20,
    circuitBreakerPct: 15,
    circuitBreakerWindow: 4,
    maxLeverage: 5,
    maxBotsPerUser: 10,
    forceLimit: true,
    autoHaltOnCircuit: true,
    notifyOnDrawdown: true,
    allowMarketOrders: true,
    requireStopLoss: false,
    maxSlippage: 0.5,
  });

  const [dirty, setDirty] = useState(false);

  const set = (k: string, v: any) => {
    setR((p) => ({ ...p, [k]: v }));
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
        <div className="font-mono text-[11px] md:text-[11px] md:text-[13px] font-semibold text-[#e8edf3] tracking-wider mb-1">Risk Controls</div>
        <div className="font-mono text-[9px] md:text-[10px] text-[#5a7090]">
          Platform-wide guardrails. These override all strategy-level configurations and cannot be bypassed per-bot.
        </div>
      </div>

      {/* Warning Alert */}
      <div className="px-3 py-2 rounded bg-[rgba(245,166,35,0.10)] border border-[rgba(245,166,35,0.25)] font-mono text-[10px] text-[#f5a623] flex items-start gap-2 leading-relaxed">
        <span>⚠</span>
        <span>
          Changes to risk controls take effect immediately and apply to all running bots. Lowering thresholds may trigger
          automatic halts on currently open positions.
        </span>
      </div>

      {/* Drawdown & Loss Limits */}
      <div className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#8fa3b8]">Drawdown & Loss Limits</div>
          <div className="text-[11px] text-[#5a7090] mt-0.5">Maximum acceptable losses before automatic intervention</div>
        </div>
        <div className="px-4 py-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="flex flex-col gap-5">
              <RangeField
                label="Max Platform Drawdown"
                value={r.maxDrawdown}
                min={1}
                max={30}
                step={0.5}
                unit="%"
                color="amber"
                hint="When platform equity drops this % from peak, all bots pause and an alert fires."
                onChange={(v) => set("maxDrawdown", v)}
              />
              <RangeField
                label="Daily Loss Limit (per user)"
                value={r.dailyLossLimit}
                min={1}
                max={20}
                step={0.5}
                unit="%"
                color="amber"
                hint="If a user's portfolio loses more than this in a calendar day, their bots auto-pause."
                onChange={(v) => set("dailyLossLimit", v)}
              />
              <RangeField
                label="Circuit Breaker Threshold"
                value={r.circuitBreakerPct}
                min={5}
                max={50}
                step={1}
                unit="%"
                color="red"
                hint="Emergency halt: kills ALL bots platform-wide if this % loss occurs."
                onChange={(v) => set("circuitBreakerPct", v)}
              />
            </div>

            {/* Right Column */}
            <div className="flex flex-col gap-5">
              <RangeField
                label="Circuit Breaker Window"
                value={r.circuitBreakerWindow}
                min={1}
                max={24}
                step={1}
                unit="h"
                color="default"
                hint="How many hours the circuit breaker looks back when calculating loss."
                onChange={(v) => set("circuitBreakerWindow", v)}
              />
              <RangeField
                label="Max Slippage Tolerance"
                value={r.maxSlippage}
                min={0.05}
                max={3}
                step={0.05}
                unit="%"
                color="amber"
                hint="Orders with expected slippage above this are cancelled, not executed."
                onChange={(v) => set("maxSlippage", v)}
              />
            </div>
          </div>

          <div className="h-px bg-[#1e2d40] my-3.5" />

          <ToggleRow
            label="Auto-halt on circuit breaker"
            sub="When the circuit breaker threshold is hit, automatically kill all bots without requiring manual confirmation."
            checked={r.autoHaltOnCircuit}
            onChange={(v) => set("autoHaltOnCircuit", v)}
          />
          <ToggleRow
            label="Alert on drawdown approach"
            sub="Send a warning alert when platform drawdown reaches 80% of the configured limit."
            checked={r.notifyOnDrawdown}
            onChange={(v) => set("notifyOnDrawdown", v)}
          />
        </div>
      </div>

      {/* Position & Exposure Limits */}
      <div className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#8fa3b8]">Position & Exposure Limits</div>
          <div className="text-[11px] text-[#5a7090] mt-0.5">Controls on individual position sizing and leverage</div>
        </div>
        <div className="px-4 py-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="flex flex-col gap-5">
              <RangeField
                label="Max Position Size"
                value={r.maxPositionSize}
                min={1}
                max={50}
                step={0.5}
                unit="% of user equity"
                color="amber"
                hint="No single position can exceed this percentage of the user's total equity."
                onChange={(v) => set("maxPositionSize", v)}
              />
              <RangeField
                label="Max Concurrent Positions"
                value={r.maxConcurrentPositions}
                min={1}
                max={100}
                step={1}
                unit="positions"
                color="default"
                hint="Maximum open positions per bot at any one time."
                onChange={(v) => set("maxConcurrentPositions", v)}
              />
            </div>

            {/* Right Column */}
            <div className="flex flex-col gap-5">
              <RangeField
                label="Maximum Leverage"
                value={r.maxLeverage}
                min={1}
                max={125}
                step={1}
                unit="x"
                color="red"
                hint="Hard ceiling on leverage regardless of what the exchange allows."
                onChange={(v) => set("maxLeverage", v)}
              />
              <RangeField
                label="Max Bots Per User"
                value={r.maxBotsPerUser}
                min={1}
                max={50}
                step={1}
                unit="bots"
                color="default"
                hint="Platform-wide ceiling. Subscription tier limits apply within this."
                onChange={(v) => set("maxBotsPerUser", v)}
              />
            </div>
          </div>

          <div className="h-px bg-[#1e2d40] my-3.5" />

          <ToggleRow
            label="Force limit orders only"
            sub="Disallow market orders platform-wide. All orders must be placed as limit orders."
            checked={r.forceLimit}
            onChange={(v) => set("forceLimit", v)}
          />
          <ToggleRow
            label="Allow market orders"
            sub="Permit market orders. Overridden by 'Force limit orders only' above."
            checked={r.allowMarketOrders}
            onChange={(v) => set("allowMarketOrders", v)}
            disabled={r.forceLimit}
          />
          <ToggleRow
            label="Require stop-loss on all positions"
            sub="Bots cannot open a position without a configured stop-loss level."
            checked={r.requireStopLoss}
            onChange={(v) => set("requireStopLoss", v)}
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

function RangeField({
  label,
  value,
  min,
  max,
  step,
  unit,
  hint,
  color,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  hint: string;
  color: string;
  onChange: (v: number) => void;
}) {
  const thumbColor =
    color === "red" ? "#ff4757" : color === "amber" ? "#f5a623" : "#00e5a0";

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

function ToggleRow({
  label,
  sub,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  sub: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between py-2.5 border-b border-[#1e2d40] last:border-b-0 last:pb-0"
      style={{ opacity: disabled ? 0.45 : 1 }}
    >
      <div>
        <div className="text-[12px] text-[#e8edf3] font-medium">{label}</div>
        <div className="font-mono text-[9px] text-[#5a7090] mt-0.5">{sub}</div>
      </div>
      <Toggle checked={checked} onChange={disabled ? () => {} : onChange} />
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative w-9 h-5 flex-shrink-0 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="opacity-0 w-0 h-0" />
      <span
        className={`absolute inset-0 rounded-full border transition-all duration-200 ${
          checked
            ? "bg-[rgba(0,229,160,0.10)] border-[rgba(0,229,160,0.4)]"
            : "bg-[#1a2230] border-[#253550]"
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
