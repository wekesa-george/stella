"use client";

import { useState, useEffect, useRef } from "react";
import { getBotEngineDefaults, updateBotEngineDefaults } from "@/lib/tradingEngineApi";

interface BotEngineConfig {
  heartbeatInterval: number;
  orderTimeout: number;
  retryAttempts: number;
  retryBackoff: number;
  reconcileFreq: number;
  defaultSlippage: number;
  maxOrderAge: number;
  positionPrecision: number;
  enableHeartbeatAlert: boolean;
  enableStaleOrderCancel: boolean;
  enableAutoReconcile: boolean;
  enablePartialFillContinue: boolean;
}

const DEFAULTS: BotEngineConfig = {
  heartbeatInterval: 5,
  orderTimeout: 30,
  retryAttempts: 3,
  retryBackoff: 2,
  reconcileFreq: 15,
  defaultSlippage: 0.1,
  maxOrderAge: 300,
  positionPrecision: 4,
  enableHeartbeatAlert: true,
  enableStaleOrderCancel: true,
  enableAutoReconcile: true,
  enablePartialFillContinue: true,
};

function toBool(val: any, fallback: boolean): boolean {
  if (val === undefined || val === null) return fallback;
  if (typeof val === "boolean") return val;
  return val === "true" || val === true;
}

function mapApiToLocal(api: Record<string, any>): BotEngineConfig {
  return {
    heartbeatInterval: api.heartbeat_interval_sec ?? DEFAULTS.heartbeatInterval,
    orderTimeout: api.order_timeout_sec ?? DEFAULTS.orderTimeout,
    retryAttempts: api.retry_attempts ?? DEFAULTS.retryAttempts,
    retryBackoff: Number(api.retry_backoff_multiplier ?? DEFAULTS.retryBackoff),
    reconcileFreq: api.reconcile_frequency_min ?? DEFAULTS.reconcileFreq,
    defaultSlippage: Number(api.default_slippage_pct ?? DEFAULTS.defaultSlippage),
    maxOrderAge: api.max_order_age_sec ?? DEFAULTS.maxOrderAge,
    positionPrecision: api.position_precision ?? DEFAULTS.positionPrecision,
    enableHeartbeatAlert: toBool(api.enable_heartbeat_alert, DEFAULTS.enableHeartbeatAlert),
    enableStaleOrderCancel: toBool(api.enable_stale_order_cancel, DEFAULTS.enableStaleOrderCancel),
    enableAutoReconcile: toBool(api.enable_auto_reconcile, DEFAULTS.enableAutoReconcile),
    enablePartialFillContinue: toBool(api.enable_partial_fill_continue, DEFAULTS.enablePartialFillContinue),
  };
}

function mapLocalToApi(local: BotEngineConfig): Record<string, any> {
  return {
    heartbeat_interval_sec: local.heartbeatInterval,
    order_timeout_sec: local.orderTimeout,
    retry_attempts: local.retryAttempts,
    retry_backoff_multiplier: local.retryBackoff,
    reconcile_frequency_min: local.reconcileFreq,
    default_slippage_pct: local.defaultSlippage,
    max_order_age_sec: local.maxOrderAge,
    position_precision: local.positionPrecision,
    enable_heartbeat_alert: local.enableHeartbeatAlert,
    enable_stale_order_cancel: local.enableStaleOrderCancel,
    enable_auto_reconcile: local.enableAutoReconcile,
    enable_partial_fill_continue: local.enablePartialFillContinue,
  };
}

export default function BotEngineDefaultsPage() {
  const [b, setB] = useState<BotEngineConfig>(DEFAULTS);
  const originalRef = useRef<BotEngineConfig>(DEFAULTS);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getBotEngineDefaults().then((res) => {
      if (res.data) {
        const mapped = mapApiToLocal(res.data);
        setB(mapped);
        originalRef.current = mapped;
      }
      setLoaded(true);
    });
  }, []);

  const set = (k: string, v: any) => {
    setB((p) => ({ ...p, [k]: v }));
    setDirty(true);
    setSaveError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    const result = await updateBotEngineDefaults(mapLocalToApi(b));
    if (result.error) {
      setSaveError(result.error);
    } else {
      originalRef.current = b;
      setDirty(false);
    }
    setSaving(false);
  };

  const handleDiscard = () => {
    setB(originalRef.current);
    setDirty(false);
    setSaveError(null);
  };

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-[1100px]">
      {/* Page Header */}
      <div className="mb-1">
        <div className="font-mono text-[11px] md:text-[13px] font-semibold text-[#e8edf3] tracking-wider mb-1">Bot Engine Defaults</div>
        <div className="font-mono text-[10px] text-[#5a7090]">
          Global defaults inherited by every new bot. Individual strategy configs override these where specified.
        </div>
      </div>

      {/* Timing & Retry */}
      <div className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#8fa3b8]">Timing & Retry</div>
        </div>
        <div className="px-4 py-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="flex flex-col gap-5">
              <RangeField
                label="Heartbeat Interval"
                value={b.heartbeatInterval}
                min={1}
                max={60}
                step={1}
                unit="s"
                hint="How often each bot broadcasts a status update to the platform."
                onChange={(v) => set("heartbeatInterval", v)}
              />
              <RangeField
                label="Order Timeout"
                value={b.orderTimeout}
                min={5}
                max={300}
                step={5}
                unit="s"
                hint="Time to wait for an order acknowledgement before marking it as failed."
                onChange={(v) => set("orderTimeout", v)}
              />
              <RangeField
                label="Max Order Age"
                value={b.maxOrderAge}
                min={60}
                max={3600}
                step={60}
                unit="s"
                hint="Unfilled orders older than this are automatically cancelled."
                onChange={(v) => set("maxOrderAge", v)}
              />
            </div>

            {/* Right Column */}
            <div className="flex flex-col gap-5">
              <RangeField
                label="Retry Attempts"
                value={b.retryAttempts}
                min={0}
                max={10}
                step={1}
                unit="retries"
                hint="How many times to retry a failed order before giving up."
                onChange={(v) => set("retryAttempts", v)}
              />
              <RangeField
                label="Retry Backoff Multiplier"
                value={b.retryBackoff}
                min={1}
                max={5}
                step={0.5}
                unit="x"
                hint="Each retry waits (attempt × backoff) seconds longer than the last."
                onChange={(v) => set("retryBackoff", v)}
              />
              <RangeField
                label="Reconciliation Frequency"
                value={b.reconcileFreq}
                min={1}
                max={60}
                step={1}
                unit="min"
                hint="How often each bot reconciles its state against the exchange's actual positions."
                onChange={(v) => set("reconcileFreq", v)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Order Defaults */}
      <div className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#8fa3b8]">Order Defaults</div>
        </div>
        <div className="px-4 py-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Field
              label="Default Slippage Tolerance (%)"
              hint="Bots will not execute if slippage exceeds this. Overridable per strategy."
            >
              <input
                className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                type="number"
                step="0.01"
                value={b.defaultSlippage}
                onChange={(e) => set("defaultSlippage", +e.target.value)}
              />
            </Field>
            <Field
              label="Position Size Precision (decimal places)"
              hint="Number of decimal places for position size calculations."
            >
              <input
                className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                type="number"
                value={b.positionPrecision}
                onChange={(e) => set("positionPrecision", +e.target.value)}
              />
            </Field>
          </div>
          <div className="h-px bg-[#1e2d40] my-3.5" />
          <ToggleRow
            label="Alert on missed heartbeat"
            sub="Fire a warning alert if a running bot misses 3 consecutive heartbeats."
            checked={b.enableHeartbeatAlert}
            onChange={(v) => set("enableHeartbeatAlert", v)}
          />
          <ToggleRow
            label="Auto-cancel stale orders"
            sub="Automatically cancel orders older than 'Max Order Age'."
            checked={b.enableStaleOrderCancel}
            onChange={(v) => set("enableStaleOrderCancel", v)}
          />
          <ToggleRow
            label="Auto-reconcile on discrepancy"
            sub="If reconciliation finds a position mismatch, auto-correct without manual intervention."
            checked={b.enableAutoReconcile}
            onChange={(v) => set("enableAutoReconcile", v)}
          />
          <ToggleRow
            label="Continue on partial fill"
            sub="Bot continues to next logic cycle after a partial fill rather than waiting for full fill."
            checked={b.enablePartialFillContinue}
            onChange={(v) => set("enablePartialFillContinue", v)}
          />
        </div>
        {(dirty || saveError) && (
          <div className="px-4 py-2.5 border-t border-[#1e2d40] flex items-center gap-2 justify-end bg-[#131920]">
            {saveError && (
              <span className="text-[9px] text-[#ff4757] mr-auto">{saveError}</span>
            )}
            <button
              onClick={handleDiscard}
              disabled={saving}
              className="px-3 py-1.5 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] hover:border-[#253550] transition-all disabled:opacity-50"
            >
              Discard Changes
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 rounded border bg-[rgba(0,229,160,0.10)] text-[#00e5a0] border-[rgba(0,229,160,0.3)] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#00e5a0] hover:text-black transition-all disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
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
  const thumbColor = "#00e5a0";

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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] flex items-center gap-1.5">{label}</div>
      {children}
      {hint && <div className="font-mono text-[9px] text-[#3a5068]">{hint}</div>}
    </div>
  );
}
