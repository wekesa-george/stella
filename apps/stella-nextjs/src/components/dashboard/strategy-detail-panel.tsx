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

  // Structured config fields (read from / write to config JSONB)
  const cfg = strategy.config || {};
  const [minConfLong, setMinConfLong] = useState(String(cfg.min_confidence_long ?? ""));
  const [minConfShort, setMinConfShort] = useState(String(cfg.min_confidence_short ?? ""));
  const [targetProfitUsd, setTargetProfitUsd] = useState(String(cfg.target_profit_usd ?? ""));
  const [minImpulsePct, setMinImpulsePct] = useState(String(cfg.min_impulse_pct ?? ""));
  const [maxHoldMinutes, setMaxHoldMinutes] = useState(String(cfg.max_hold_minutes ?? ""));
  const [minNotional, setMinNotional] = useState(String(cfg.min_notional ?? ""));
  const [minMomentum, setMinMomentum] = useState(String(cfg.min_momentum ?? ""));
  const [minTrajectoryAngle, setMinTrajectoryAngle] = useState(String(cfg.min_trajectory_angle ?? ""));
  const [minKineticEnergy, setMinKineticEnergy] = useState(String(cfg.min_kinetic_energy ?? ""));
  const [velReversalThreshold, setVelReversalThreshold] = useState(String(cfg.velocity_reversal_threshold ?? ""));
  const [energyExhaustionThreshold, setEnergyExhaustionThreshold] = useState(String(cfg.energy_exhaustion_threshold ?? ""));
  const [maxHoldTimeMultiplier, setMaxHoldTimeMultiplier] = useState(String(cfg.max_hold_time_multiplier ?? ""));
  const [riskPercentPerTrade, setRiskPercentPerTrade] = useState(String(cfg.risk_percent_per_trade ?? ""));
  const [executeOnExchange, setExecuteOnExchange] = useState<boolean>(cfg.execute_on_exchange ?? true);
  const [useAssetTiers, setUseAssetTiers] = useState<boolean>(cfg.use_asset_tiers ?? true);
  const [useVirtualBalance, setUseVirtualBalance] = useState<boolean>(cfg.use_virtual_balance ?? true);
  const [cfgMaxPositions, setCfgMaxPositions] = useState(String(cfg.max_positions_per_user ?? ""));
  const [minAccountBalance, setMinAccountBalance] = useState(String(cfg.min_account_balance ?? ""));
  const [showRawJson, setShowRawJson] = useState(false);

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
    const c = strategy.config || {};
    setMinConfLong(String(c.min_confidence_long ?? ""));
    setMinConfShort(String(c.min_confidence_short ?? ""));
    setTargetProfitUsd(String(c.target_profit_usd ?? ""));
    setMinImpulsePct(String(c.min_impulse_pct ?? ""));
    setMaxHoldMinutes(String(c.max_hold_minutes ?? ""));
    setMinNotional(String(c.min_notional ?? ""));
    setMinMomentum(String(c.min_momentum ?? ""));
    setMinTrajectoryAngle(String(c.min_trajectory_angle ?? ""));
    setMinKineticEnergy(String(c.min_kinetic_energy ?? ""));
    setVelReversalThreshold(String(c.velocity_reversal_threshold ?? ""));
    setEnergyExhaustionThreshold(String(c.energy_exhaustion_threshold ?? ""));
    setMaxHoldTimeMultiplier(String(c.max_hold_time_multiplier ?? ""));
    setRiskPercentPerTrade(String(c.risk_percent_per_trade ?? ""));
    setExecuteOnExchange(c.execute_on_exchange ?? true);
    setUseAssetTiers(c.use_asset_tiers ?? true);
    setUseVirtualBalance(c.use_virtual_balance ?? true);
    setCfgMaxPositions(String(c.max_positions_per_user ?? ""));
    setMinAccountBalance(String(c.min_account_balance ?? ""));
    setShowRawJson(false);
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

    // Build config from structured fields (or raw JSON if in raw mode)
    let config: Record<string, any> | null;
    if (showRawJson) {
      config = parseJsonSafe(configJson);
      if (config === null) { setError("Invalid JSON in config"); return; }
    } else {
      const existing = parseJsonSafe(configJson) || {};
      config = { ...existing };
      // Signal params
      if (minConfLong) config.min_confidence_long = Number(minConfLong);
      if (minConfShort) config.min_confidence_short = Number(minConfShort);
      if (targetProfitUsd) config.target_profit_usd = Number(targetProfitUsd);
      if (minImpulsePct) config.min_impulse_pct = Number(minImpulsePct);
      if (maxHoldMinutes) config.max_hold_minutes = Number(maxHoldMinutes);
      if (minNotional) config.min_notional = Number(minNotional);
      // Physics params
      if (minMomentum) config.min_momentum = Number(minMomentum);
      if (minTrajectoryAngle) config.min_trajectory_angle = Number(minTrajectoryAngle);
      if (minKineticEnergy) config.min_kinetic_energy = Number(minKineticEnergy);
      if (velReversalThreshold) config.velocity_reversal_threshold = Number(velReversalThreshold);
      if (energyExhaustionThreshold) config.energy_exhaustion_threshold = Number(energyExhaustionThreshold);
      if (maxHoldTimeMultiplier) config.max_hold_time_multiplier = Number(maxHoldTimeMultiplier);
      if (riskPercentPerTrade) config.risk_percent_per_trade = Number(riskPercentPerTrade);
      // Feature toggles
      config.execute_on_exchange = executeOnExchange;
      config.use_asset_tiers = useAssetTiers;
      config.use_virtual_balance = useVirtualBalance;
      // Position limits
      if (cfgMaxPositions) config.max_positions_per_user = Number(cfgMaxPositions);
      if (minAccountBalance) config.min_account_balance = Number(minAccountBalance);
    }
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
              className="px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[rgba(255,215,0,0.12)] text-[#FFD700] hover:bg-[rgba(255,215,0,0.2)] transition-all"
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

        {/* Config — Structured Fields */}
        <Section title="Trading Parameters">
          {editing ? (
            <div className="space-y-3">
              {/* Signal Parameters */}
              <div className="text-[8px] text-[#5a7090] font-bold uppercase tracking-widest pt-1">Signal Parameters</div>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Min Conf Long"><input value={minConfLong} onChange={(e) => setMinConfLong(e.target.value)} type="number" placeholder="55" className={cn(inputClass, "font-mono")} /></Field>
                <Field label="Min Conf Short"><input value={minConfShort} onChange={(e) => setMinConfShort(e.target.value)} type="number" placeholder="60" className={cn(inputClass, "font-mono")} /></Field>
                <Field label="Target Profit $"><input value={targetProfitUsd} onChange={(e) => setTargetProfitUsd(e.target.value)} type="number" step="0.1" placeholder="0.50" className={cn(inputClass, "font-mono")} /></Field>
                <Field label="Min Impulse %"><input value={minImpulsePct} onChange={(e) => setMinImpulsePct(e.target.value)} type="number" step="0.001" placeholder="0.001" className={cn(inputClass, "font-mono")} /></Field>
                <Field label="Max Hold Min"><input value={maxHoldMinutes} onChange={(e) => setMaxHoldMinutes(e.target.value)} type="number" placeholder="5" className={cn(inputClass, "font-mono")} /></Field>
                <Field label="Min Notional $"><input value={minNotional} onChange={(e) => setMinNotional(e.target.value)} type="number" placeholder="10" className={cn(inputClass, "font-mono")} /></Field>
              </div>

              {/* Physics (show for core_momentum) */}
              {(type === "core_momentum" || type === "custom_config") && (
                <>
                  <div className="text-[8px] text-[#5a7090] font-bold uppercase tracking-widest pt-2">Physics Parameters</div>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Min Momentum"><input value={minMomentum} onChange={(e) => setMinMomentum(e.target.value)} type="number" step="0.001" placeholder="0.001" className={cn(inputClass, "font-mono")} /></Field>
                    <Field label="Min Angle"><input value={minTrajectoryAngle} onChange={(e) => setMinTrajectoryAngle(e.target.value)} type="number" placeholder="18" className={cn(inputClass, "font-mono")} /></Field>
                    <Field label="Min Energy"><input value={minKineticEnergy} onChange={(e) => setMinKineticEnergy(e.target.value)} type="number" step="0.1" placeholder="0.3" className={cn(inputClass, "font-mono")} /></Field>
                    <Field label="Vel Reversal"><input value={velReversalThreshold} onChange={(e) => setVelReversalThreshold(e.target.value)} type="number" step="0.001" placeholder="-0.001" className={cn(inputClass, "font-mono")} /></Field>
                    <Field label="Energy Exhaust"><input value={energyExhaustionThreshold} onChange={(e) => setEnergyExhaustionThreshold(e.target.value)} type="number" step="0.1" placeholder="0.2" className={cn(inputClass, "font-mono")} /></Field>
                    <Field label="Hold Mult"><input value={maxHoldTimeMultiplier} onChange={(e) => setMaxHoldTimeMultiplier(e.target.value)} type="number" step="0.1" placeholder="1.2" className={cn(inputClass, "font-mono")} /></Field>
                    <Field label="Risk %/Trade"><input value={riskPercentPerTrade} onChange={(e) => setRiskPercentPerTrade(e.target.value)} type="number" step="0.01" placeholder="0.02" className={cn(inputClass, "font-mono")} /></Field>
                  </div>
                </>
              )}

              {/* Feature Toggles */}
              <div className="text-[8px] text-[#5a7090] font-bold uppercase tracking-widest pt-2">Feature Toggles</div>
              <div className="grid grid-cols-3 gap-x-4 gap-y-2">
                <Toggle label="Execute on Exchange" checked={executeOnExchange} onChange={setExecuteOnExchange} />
                <Toggle label="Use Asset Tiers" checked={useAssetTiers} onChange={setUseAssetTiers} />
                <Toggle label="Use Virtual Balance" checked={useVirtualBalance} onChange={setUseVirtualBalance} />
              </div>

              {/* Position Limits */}
              <div className="text-[8px] text-[#5a7090] font-bold uppercase tracking-widest pt-2">Position Limits</div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Max Positions/User"><input value={cfgMaxPositions} onChange={(e) => setCfgMaxPositions(e.target.value)} type="number" placeholder="3" className={cn(inputClass, "font-mono")} /></Field>
                <Field label="Min Balance $"><input value={minAccountBalance} onChange={(e) => setMinAccountBalance(e.target.value)} type="number" placeholder="100" className={cn(inputClass, "font-mono")} /></Field>
              </div>

              {/* Raw JSON Toggle */}
              <button
                onClick={() => setShowRawJson(!showRawJson)}
                className="text-[8px] font-bold uppercase tracking-widest text-[#5a7090] hover:text-[#e8edf3] transition-colors pt-1"
              >
                {showRawJson ? "- Hide" : "+ Show"} Raw JSON
              </button>
              {showRawJson && (
                <textarea value={configJson} onChange={(e) => setConfigJson(e.target.value)} rows={6} className={cn(inputClass, "font-mono resize-none")} />
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {cfg.min_confidence_long != null && <InfoRow label="Min Conf Long" value={String(cfg.min_confidence_long)} />}
              {cfg.min_confidence_short != null && <InfoRow label="Min Conf Short" value={String(cfg.min_confidence_short)} />}
              {cfg.target_profit_usd != null && <InfoRow label="Target Profit" value={`$${cfg.target_profit_usd}`} />}
              {cfg.max_hold_minutes != null && <InfoRow label="Max Hold" value={`${cfg.max_hold_minutes}m`} />}
              {cfg.max_positions_per_user != null && <InfoRow label="Max Positions" value={String(cfg.max_positions_per_user)} />}
              {cfg.execute_on_exchange != null && <InfoRow label="Exchange Exec" value={cfg.execute_on_exchange ? "ON" : "OFF"} />}
              {cfg.use_asset_tiers != null && <InfoRow label="Asset Tiers" value={cfg.use_asset_tiers ? "ON" : "OFF"} />}
              {Object.keys(cfg).length === 0 && <span className="text-[10px] text-[#5a7090]">No config overrides (using defaults)</span>}
              <pre className="text-[10px] text-[#8fa3b8] font-mono bg-[#0d1117] rounded-sm p-2.5 overflow-x-auto max-h-32 whitespace-pre-wrap mt-2">
                {JSON.stringify(strategy.config || {}, null, 2)}
              </pre>
            </div>
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
            className="px-5 py-2 rounded-sm text-xs font-bold uppercase tracking-wider bg-[#FFD700] text-black hover:bg-[#FFE44D] transition-all disabled:opacity-50"
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
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} className="accent-[#FFD700]" />
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
