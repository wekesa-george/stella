"use client";

import { useState } from "react";
import { createStrategy } from "@/lib/tradingEngineApi";
import type { Strategy, StrategyType } from "@/lib/types/strategy";

interface CreateStrategyModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (strategy: Strategy) => void;
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

export function CreateStrategyModal({ open, onClose, onCreated }: CreateStrategyModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<StrategyType>("core_momentum");
  const [timeframe, setTimeframe] = useState("");
  const [isCore, setIsCore] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [isBacktestEnabled, setIsBacktestEnabled] = useState(true);
  const [isLiveEnabled, setIsLiveEnabled] = useState(false);
  const [stopLossPct, setStopLossPct] = useState("");
  const [takeProfitPct, setTakeProfitPct] = useState("");
  const [maxPositionSizePct, setMaxPositionSizePct] = useState("");
  const [supportedPairs, setSupportedPairs] = useState("");
  const [supportedExchanges, setSupportedExchanges] = useState("");
  const [configJson, setConfigJson] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setDescription("");
    setType("core_momentum");
    setTimeframe("");
    setIsCore(false);
    setIsPublic(false);
    setIsBacktestEnabled(true);
    setIsLiveEnabled(false);
    setStopLossPct("");
    setTakeProfitPct("");
    setMaxPositionSizePct("");
    setSupportedPairs("");
    setSupportedExchanges("");
    setConfigJson("");
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Strategy name is required");
      return;
    }

    // Parse config JSON if provided
    let config: Record<string, any> = {};
    if (configJson.trim()) {
      try {
        config = JSON.parse(configJson);
      } catch {
        setError("Invalid JSON in config field");
        return;
      }
    }

    setError(null);
    setSubmitting(true);

    try {
      const payload: Record<string, any> = {
        name: name.trim(),
        type,
        status: "draft",
        is_core: isCore,
        is_public: isPublic,
        is_backtest_enabled: isBacktestEnabled,
        is_live_enabled: isLiveEnabled,
      };

      if (description.trim()) payload.description = description.trim();
      if (timeframe.trim()) payload.timeframe = timeframe.trim();
      if (stopLossPct) payload.stop_loss_pct = Number(stopLossPct);
      if (takeProfitPct) payload.take_profit_pct = Number(takeProfitPct);
      if (maxPositionSizePct) payload.max_position_size_pct = Number(maxPositionSizePct);
      if (supportedPairs.trim()) {
        payload.supported_pairs = supportedPairs.split(",").map((s) => s.trim()).filter(Boolean);
      }
      if (supportedExchanges.trim()) {
        payload.supported_exchanges = supportedExchanges.split(",").map((s) => s.trim()).filter(Boolean);
      }
      if (Object.keys(config).length > 0) payload.config = config;

      const result = await createStrategy(payload);

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.data) {
        onCreated(result.data as Strategy);
        handleClose();
      }
    } catch {
      setError("Failed to create strategy");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-dark rounded-lg w-full max-w-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-dark flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Create Strategy</h2>
            <p className="text-[10px] text-[#5a7090] mt-0.5">Define a new trading strategy</p>
          </div>
          <button onClick={handleClose} className="text-[#5a7090] hover:text-foreground transition-colors text-lg leading-none">
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0 space-y-4">
          {/* Name */}
          <div>
            <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1.5">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Physics Impulse"
              className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the strategy..."
              rows={2}
              className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2 resize-none"
            />
          </div>

          {/* Type + Timeframe row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1.5">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as StrategyType)}
                className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground focus:outline-none focus:border-dark-2"
              >
                {STRATEGY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1.5">Timeframe</label>
              <input
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                placeholder="e.g. 1h, 4h, 1d"
                className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
              />
            </div>
          </div>

          {/* Boolean toggles */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {[
              { label: "Core Strategy", value: isCore, set: setIsCore },
              { label: "Public", value: isPublic, set: setIsPublic },
              { label: "Backtest Enabled", value: isBacktestEnabled, set: setIsBacktestEnabled },
              { label: "Live Enabled", value: isLiveEnabled, set: setIsLiveEnabled },
            ].map(({ label, value, set }) => (
              <label key={label} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => set(e.target.checked)}
                  className="accent-[#00e5a0]"
                />
                <span className="text-[10px] text-[#8fa3b8]">{label}</span>
              </label>
            ))}
          </div>

          {/* Risk parameters */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1.5">Stop Loss %</label>
              <input
                value={stopLossPct}
                onChange={(e) => setStopLossPct(e.target.value)}
                placeholder="2.0"
                type="number"
                step="0.1"
                min="0"
                className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground font-mono placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
              />
            </div>
            <div>
              <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1.5">Take Profit %</label>
              <input
                value={takeProfitPct}
                onChange={(e) => setTakeProfitPct(e.target.value)}
                placeholder="5.0"
                type="number"
                step="0.1"
                min="0"
                className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground font-mono placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
              />
            </div>
            <div>
              <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1.5">Max Pos %</label>
              <input
                value={maxPositionSizePct}
                onChange={(e) => setMaxPositionSizePct(e.target.value)}
                placeholder="10"
                type="number"
                step="0.1"
                min="0"
                className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground font-mono placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
              />
            </div>
          </div>

          {/* Supported pairs */}
          <div>
            <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1.5">Supported Pairs (comma-separated)</label>
            <input
              value={supportedPairs}
              onChange={(e) => setSupportedPairs(e.target.value)}
              placeholder="BTC/USDT, ETH/USDT, SOL/USDT"
              className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
            />
          </div>

          {/* Supported exchanges */}
          <div>
            <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1.5">Supported Exchanges (comma-separated)</label>
            <input
              value={supportedExchanges}
              onChange={(e) => setSupportedExchanges(e.target.value)}
              placeholder="binance, bybit"
              className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2"
            />
          </div>

          {/* Config JSON */}
          <div>
            <label className="text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1.5">Config (JSON, optional)</label>
            <textarea
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
              placeholder='{"lookback_period": 14, "threshold": 0.5}'
              rows={3}
              className="w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground font-mono placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2 resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="text-xs text-[#ff4757] bg-[rgba(255,71,87,0.08)] border border-[rgba(255,71,87,0.2)] rounded-sm px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-dark flex gap-2.5 justify-end shrink-0">
          <button
            onClick={handleClose}
            disabled={submitting}
            className="px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider bg-transparent text-[#8fa3b8] border border-dark hover:border-dark-2 hover:text-foreground transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !name.trim()}
            className="px-5 py-2 rounded-sm text-xs font-bold uppercase tracking-wider bg-[#00e5a0] text-black hover:bg-[#00ffb2] transition-all disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Strategy"}
          </button>
        </div>
      </div>
    </div>
  );
}
