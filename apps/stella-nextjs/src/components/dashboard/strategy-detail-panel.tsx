"use client";

import { useState } from "react";
import { updateStrategy } from "@/lib/tradingEngineApi";
import type { Strategy, StrategyType, StrategyStatus } from "@/lib/types/strategy";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface StrategyDetailPanelProps {
  strategy: Strategy;
  onClose: () => void;
  onUpdate: (updated: Strategy) => void;
}

const STRATEGY_TYPES: { value: StrategyType; label: string }[] = [
  { value: "core_momentum", label: "Core Momentum" },
  { value: "core_grid", label: "Core Grid" },
  { value: "core_dca", label: "Core DCA" },
  { value: "core_mean_reversion", label: "Core Mean Reversion" },
  { value: "core_trend_following", label: "Core Trend Following" },
  { value: "core_arbitrage", label: "Core Arbitrage" },
  { value: "custom_rule_based", label: "Custom Rule Based" },
  { value: "custom_config", label: "Custom Config" },
];

export function StrategyDetailPanel({ strategy, onClose, onUpdate }: StrategyDetailPanelProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Editable fields
  const [name, setName] = useState(strategy.name);
  const [description, setDescription] = useState(strategy.description || "");
  const [type, setType] = useState(strategy.type);
  const [status, setStatus] = useState(strategy.status);
  const [timeframe, setTimeframe] = useState(strategy.timeframe || "");
  const [isCore, setIsCore] = useState(strategy.is_core);
  const [isPublic, setIsPublic] = useState(strategy.is_public);
  const [isBacktestEnabled, setIsBacktestEnabled] = useState(strategy.is_backtest_enabled);
  const [isLiveEnabled, setIsLiveEnabled] = useState(strategy.is_live_enabled);
  const [stopLossPct, setStopLossPct] = useState(String(strategy.stop_loss_pct ?? ""));
  const [takeProfitPct, setTakeProfitPct] = useState(String(strategy.take_profit_pct ?? ""));
  const [maxPositionSizePct, setMaxPositionSizePct] = useState(String(strategy.max_position_size_pct ?? ""));

  // Tag inputs
  const [pairs, setPairs] = useState<string[]>(strategy.supported_pairs || []);
  const [pairInput, setPairInput] = useState("");
  const [exchanges, setExchanges] = useState<string[]>(strategy.supported_exchanges || []);
  const [exchangeInput, setExchangeInput] = useState("");

  // JSON fields
  const [configJson, setConfigJson] = useState(JSON.stringify(strategy.config || {}, null, 2));
  const [entryJson, setEntryJson] = useState(JSON.stringify(strategy.entry_conditions || {}, null, 2));
  const [exitJson, setExitJson] = useState(JSON.stringify(strategy.exit_conditions || {}, null, 2));
  const [positionSizingJson, setPositionSizingJson] = useState(JSON.stringify(strategy.position_sizing || {}, null, 2));
  const [indicatorsJson, setIndicatorsJson] = useState(JSON.stringify(strategy.indicators || {}, null, 2));

  const resetEdits = () => {
    setName(strategy.name);
    setDescription(strategy.description || "");
    setType(strategy.type);
    setStatus(strategy.status);
    setTimeframe(strategy.timeframe || "");
    setIsCore(strategy.is_core);
    setIsPublic(strategy.is_public);
    setIsBacktestEnabled(strategy.is_backtest_enabled);
    setIsLiveEnabled(strategy.is_live_enabled);
    setStopLossPct(String(strategy.stop_loss_pct ?? ""));
    setTakeProfitPct(String(strategy.take_profit_pct ?? ""));
    setMaxPositionSizePct(String(strategy.max_position_size_pct ?? ""));
    setPairs(strategy.supported_pairs || []);
    setExchanges(strategy.supported_exchanges || []);
    setConfigJson(JSON.stringify(strategy.config || {}, null, 2));
    setEntryJson(JSON.stringify(strategy.entry_conditions || {}, null, 2));
    setExitJson(JSON.stringify(strategy.exit_conditions || {}, null, 2));
    setPositionSizingJson(JSON.stringify(strategy.position_sizing || {}, null, 2));
    setIndicatorsJson(JSON.stringify(strategy.indicators || {}, null, 2));
    setError(null);
  };

  const handleCancel = () => {
    resetEdits();
    setEditing(false);
  };

  const parseJsonSafe = (s: string): Record<string, any> | null => {
    if (!s.trim() || s.trim() === "{}") return {};
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    const config = parseJsonSafe(configJson);
    if (config === null) { setError("Invalid JSON in config"); return; }
    const entry = parseJsonSafe(entryJson);
    if (entry === null) { setError("Invalid JSON in entry conditions"); return; }
    const exit = parseJsonSafe(exitJson);
    if (exit === null) { setError("Invalid JSON in exit conditions"); return; }
    const posSizing = parseJsonSafe(positionSizingJson);
    if (posSizing === null) { setError("Invalid JSON in position sizing"); return; }
    const ind = parseJsonSafe(indicatorsJson);
    if (ind === null) { setError("Invalid JSON in indicators"); return; }

    setError(null);
    setSaving(true);

    try {
      const attrs: Record<string, any> = {
        name: name.trim(),
        description: description.trim() || null,
        type,
        status,
        timeframe: timeframe.trim() || null,
        is_core: isCore,
        is_public: isPublic,
        is_backtest_enabled: isBacktestEnabled,
        is_live_enabled: isLiveEnabled,
        stop_loss_pct: stopLossPct ? Number(stopLossPct) : null,
        take_profit_pct: takeProfitPct ? Number(takeProfitPct) : null,
        max_position_size_pct: maxPositionSizePct ? Number(maxPositionSizePct) : null,
        supported_pairs: pairs,
        supported_exchanges: exchanges,
        config,
        entry_conditions: entry,
        exit_conditions: exit,
        position_sizing: posSizing,
        indicators: ind,
      };

      const result = await updateStrategy(strategy.id, attrs);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.data) {
        onUpdate(result.data as Strategy);
        setEditing(false);
      }
    } catch {
      setError("Failed to save strategy");
    } finally {
      setSaving(false);
    }
  };

  const addPair = () => {
    const val = pairInput.trim().toUpperCase();
    if (val && !pairs.includes(val)) {
      setPairs([...pairs, val]);
    }
    setPairInput("");
  };

  const addExchange = () => {
    const val = exchangeInput.trim().toLowerCase();
    if (val && !exchanges.includes(val)) {
      setExchanges([...exchanges, val]);
    }
    setExchangeInput("");
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleString();
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[450px] bg-card border-l border-dark shadow-2xl z-40 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-dark flex items-center justify-between shrink-0">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-foreground truncate">{strategy.name}</h3>
          <p className="text-[10px] text-[#5a7090] font-mono mt-0.5">
            v{strategy.version} &middot; {formatDate(strategy.updated_at)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[rgba(0,229,160,0.12)] text-[#00e5a0] hover:bg-[rgba(0,229,160,0.2)] transition-all"
            >
              Edit
            </button>
          )}
          <button onClick={onClose} className="text-[#5a7090] hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* General */}
        <Section title="General">
          {editing ? (
            <div className="space-y-3">
              <Field label="Name">
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Description">
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={cn(inputClass, "resize-none")} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <select value={type} onChange={(e) => setType(e.target.value as StrategyType)} className={inputClass}>
                    {STRATEGY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select value={status} onChange={(e) => setStatus(e.target.value as StrategyStatus)} className={inputClass}>
                    {["draft","backtesting","validated","active","paused","archived"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Timeframe">
                <input value={timeframe} onChange={(e) => setTimeframe(e.target.value)} placeholder="e.g. 1h" className={inputClass} />
              </Field>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <Toggle label="Core" checked={isCore} onChange={setIsCore} />
                <Toggle label="Public" checked={isPublic} onChange={setIsPublic} />
                <Toggle label="Backtest" checked={isBacktestEnabled} onChange={setIsBacktestEnabled} />
                <Toggle label="Live" checked={isLiveEnabled} onChange={setIsLiveEnabled} />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <InfoRow label="Name" value={strategy.name} />
              <InfoRow label="Description" value={strategy.description || "—"} />
              <InfoRow label="Type" value={strategy.type} />
              <InfoRow label="Status" value={strategy.status} />
              <InfoRow label="Timeframe" value={strategy.timeframe || "—"} />
              <InfoRow label="Version" value={String(strategy.version)} />
              <InfoRow label="Created" value={formatDate(strategy.inserted_at)} />
              <div className="flex gap-2 pt-1">
                {strategy.is_core && <FlagPill label="CORE" color="#3d9df3" />}
                {strategy.is_live_enabled && <FlagPill label="LIVE" color="#00e5a0" />}
                {strategy.is_public && <FlagPill label="PUBLIC" color="#f5a623" />}
                {strategy.is_backtest_enabled && <FlagPill label="BACKTEST" color="#a855f7" />}
              </div>
            </div>
          )}
        </Section>

        {/* Risk Parameters */}
        <Section title="Risk Parameters">
          {editing ? (
            <div className="grid grid-cols-3 gap-3">
              <Field label="SL %"><input value={stopLossPct} onChange={(e) => setStopLossPct(e.target.value)} type="number" step="0.1" className={cn(inputClass, "font-mono")} /></Field>
              <Field label="TP %"><input value={takeProfitPct} onChange={(e) => setTakeProfitPct(e.target.value)} type="number" step="0.1" className={cn(inputClass, "font-mono")} /></Field>
              <Field label="Max Pos %"><input value={maxPositionSizePct} onChange={(e) => setMaxPositionSizePct(e.target.value)} type="number" step="0.1" className={cn(inputClass, "font-mono")} /></Field>
            </div>
          ) : (
            <div className="space-y-2">
              <InfoRow label="Stop Loss" value={strategy.stop_loss_pct != null ? `${strategy.stop_loss_pct}%` : "—"} />
              <InfoRow label="Take Profit" value={strategy.take_profit_pct != null ? `${strategy.take_profit_pct}%` : "—"} />
              <InfoRow label="Max Position" value={strategy.max_position_size_pct != null ? `${strategy.max_position_size_pct}%` : "—"} />
            </div>
          )}
        </Section>

        {/* Supported Pairs */}
        <Section title="Supported Pairs">
          {editing ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  value={pairInput}
                  onChange={(e) => setPairInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPair())}
                  placeholder="BTC/USDT"
                  className={cn(inputClass, "flex-1")}
                />
                <button onClick={addPair} className="px-3 py-1.5 rounded-sm text-[10px] font-bold bg-[#1a2230] text-[#8fa3b8] border border-[#1e2d40] hover:border-dark-2">Add</button>
              </div>
              <TagList items={pairs} onRemove={(item) => setPairs(pairs.filter((p) => p !== item))} />
            </div>
          ) : (
            <TagList items={strategy.supported_pairs || []} />
          )}
        </Section>

        {/* Supported Exchanges */}
        <Section title="Supported Exchanges">
          {editing ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  value={exchangeInput}
                  onChange={(e) => setExchangeInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addExchange())}
                  placeholder="binance"
                  className={cn(inputClass, "flex-1")}
                />
                <button onClick={addExchange} className="px-3 py-1.5 rounded-sm text-[10px] font-bold bg-[#1a2230] text-[#8fa3b8] border border-[#1e2d40] hover:border-dark-2">Add</button>
              </div>
              <TagList items={exchanges} onRemove={(item) => setExchanges(exchanges.filter((e) => e !== item))} />
            </div>
          ) : (
            <TagList items={strategy.supported_exchanges || []} />
          )}
        </Section>

        {/* Config */}
        <Section title="Config">
          {editing ? (
            <textarea value={configJson} onChange={(e) => setConfigJson(e.target.value)} rows={6} className={cn(inputClass, "font-mono resize-none")} />
          ) : (
            <pre className="text-[10px] text-[#8fa3b8] font-mono bg-[#0d1117] rounded-sm p-2.5 overflow-x-auto max-h-48 whitespace-pre-wrap">
              {JSON.stringify(strategy.config || {}, null, 2)}
            </pre>
          )}
        </Section>

        {/* Advanced (collapsed) */}
        <div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-[9px] font-bold uppercase tracking-widest text-[#5a7090] hover:text-foreground transition-colors"
          >
            {showAdvanced ? "- Hide" : "+ Show"} Advanced
          </button>
          {showAdvanced && (
            <div className="mt-3 space-y-4">
              <Section title="Entry Conditions">
                {editing ? (
                  <textarea value={entryJson} onChange={(e) => setEntryJson(e.target.value)} rows={4} className={cn(inputClass, "font-mono resize-none")} />
                ) : (
                  <JsonPreview data={strategy.entry_conditions} />
                )}
              </Section>
              <Section title="Exit Conditions">
                {editing ? (
                  <textarea value={exitJson} onChange={(e) => setExitJson(e.target.value)} rows={4} className={cn(inputClass, "font-mono resize-none")} />
                ) : (
                  <JsonPreview data={strategy.exit_conditions} />
                )}
              </Section>
              <Section title="Position Sizing">
                {editing ? (
                  <textarea value={positionSizingJson} onChange={(e) => setPositionSizingJson(e.target.value)} rows={4} className={cn(inputClass, "font-mono resize-none")} />
                ) : (
                  <JsonPreview data={strategy.position_sizing} />
                )}
              </Section>
              <Section title="Indicators">
                {editing ? (
                  <textarea value={indicatorsJson} onChange={(e) => setIndicatorsJson(e.target.value)} rows={4} className={cn(inputClass, "font-mono resize-none")} />
                ) : (
                  <JsonPreview data={strategy.indicators} />
                )}
              </Section>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="text-xs text-[#ff4757] bg-[rgba(255,71,87,0.08)] border border-[rgba(255,71,87,0.2)] rounded-sm px-3 py-2">
            {error}
          </div>
        )}
      </div>

      {/* Footer (edit mode only) */}
      {editing && (
        <div className="px-4 py-3 border-t border-dark flex gap-2.5 justify-end shrink-0">
          <button
            onClick={handleCancel}
            disabled={saving}
            className="px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider bg-transparent text-[#8fa3b8] border border-dark hover:border-dark-2 hover:text-foreground transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-sm text-xs font-bold uppercase tracking-wider bg-[#00e5a0] text-black hover:bg-[#00ffb2] transition-all disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Shared sub-components ──────────────────────────────────────

const inputClass = "w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[9px] font-bold uppercase tracking-widest text-[#5a7090] mb-2">{title}</h4>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1">{label}</label>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-[10px] text-[#5a7090] uppercase tracking-wider shrink-0">{label}</span>
      <span className="text-[11px] text-foreground text-right break-words">{value}</span>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} className="accent-[#00e5a0]" />
      <span className="text-[10px] text-[#8fa3b8]">{label}</span>
    </label>
  );
}

function FlagPill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm"
      style={{ color, backgroundColor: `${color}1a` }}
    >
      {label}
    </span>
  );
}

function TagList({ items: rawItems, onRemove }: { items: string[]; onRemove?: (item: string) => void }) {
  const items = Array.isArray(rawItems) ? rawItems : [];
  if (items.length === 0) return <span className="text-[10px] text-[#5a7090]">None</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span key={item} className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-[#1a2230] text-[#8fa3b8] border border-[#1e2d40]">
          {item}
          {onRemove && (
            <button onClick={() => onRemove(item)} className="text-[#5a7090] hover:text-[#ff4757] transition-colors leading-none">&times;</button>
          )}
        </span>
      ))}
    </div>
  );
}

function JsonPreview({ data }: { data: Record<string, any> | null }) {
  if (!data || Object.keys(data).length === 0) return <span className="text-[10px] text-[#5a7090]">None</span>;
  return (
    <pre className="text-[10px] text-[#8fa3b8] font-mono bg-[#0d1117] rounded-sm p-2.5 overflow-x-auto max-h-48 whitespace-pre-wrap">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
