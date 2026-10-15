"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { createBacktest, listStrategies } from "@/lib/tradingEngineApi";
import { useAdminUser } from "@/components/AdminUserProvider";
import type { Strategy } from "@/lib/types/strategy";
import type { BacktestRun } from "@/lib/types/backtest";

interface RunBacktestModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (run: BacktestRun) => void;
  preselectedStrategyId?: string;
}

const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];

const DEFAULT_PAIRS = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
  "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "DOTUSDT", "MATICUSDT",
];

export function RunBacktestModal({ open, onClose, onCreated, preselectedStrategyId }: RunBacktestModalProps) {
  const { adminUserId } = useAdminUser();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [strategyId, setStrategyId] = useState(preselectedStrategyId || "");
  const [tradingPair, setTradingPair] = useState("BTCUSDT");
  const [exchangeCode, setExchangeCode] = useState("binance");
  const [timeframe, setTimeframe] = useState("1h");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [initialCapital, setInitialCapital] = useState("10000");
  const [feePct, setFeePct] = useState("0.1");
  const [slippagePct, setSlippagePct] = useState("0.05");

  // Load strategies
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const result = await listStrategies();
        if (result.data && Array.isArray(result.data)) {
          setStrategies(result.data as Strategy[]);
          if (preselectedStrategyId) {
            setStrategyId(preselectedStrategyId);
          } else if (result.data.length > 0 && !strategyId) {
            setStrategyId((result.data[0] as Strategy).id);
          }
        }
      } catch {}
    })();
  }, [open]);

  // Set default dates (last 30 days)
  useEffect(() => {
    if (!open) return;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    setStartDate(start.toISOString().split("T")[0]);
    setEndDate(end.toISOString().split("T")[0]);
  }, [open]);

  const handleSubmit = async () => {
    if (!strategyId || !startDate || !endDate) {
      setError("Please fill all required fields");
      return;
    }

    if (!adminUserId) {
      setError("Admin user not resolved. Please refresh the page.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await createBacktest({
        strategy_id: strategyId,
        user_id: adminUserId,
        trading_pair: tradingPair,
        exchange_code: exchangeCode,
        timeframe,
        start_date: new Date(startDate).toISOString(),
        end_date: new Date(endDate).toISOString(),
        initial_capital_usd: parseFloat(initialCapital),
        config_overrides: {
          fee_pct: parseFloat(feePct) / 100,
          slippage_pct: parseFloat(slippagePct) / 100,
        },
      });

      if (result.error) {
        setError(result.error);
      } else if (result.data) {
        onCreated(result.data as BacktestRun);
        onClose();
      }
    } catch (err) {
      setError("Failed to create backtest");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const selectedStrategy = strategies.find((s) => s.id === strategyId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-card border border-dark rounded-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Run Backtest</h2>
          <button onClick={onClose} className="text-[#5a7090] hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Strategy Select */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8fa3b8] mb-1.5">Strategy *</label>
            <select
              value={strategyId}
              onChange={(e) => setStrategyId(e.target.value)}
              className="w-full bg-dark-elevated border border-dark rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-dark-2"
            >
              <option value="">Select a strategy...</option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.type.replace("core_", "").replace("custom_", "")})
                </option>
              ))}
            </select>
            {selectedStrategy && (
              <p className="mt-1 text-[10px] text-[#5a7090]">{selectedStrategy.description}</p>
            )}
          </div>

          {/* Pair + Exchange */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8fa3b8] mb-1.5">Trading Pair *</label>
              <select
                value={tradingPair}
                onChange={(e) => setTradingPair(e.target.value)}
                className="w-full bg-dark-elevated border border-dark rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-dark-2"
              >
                {DEFAULT_PAIRS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8fa3b8] mb-1.5">Exchange *</label>
              <select
                value={exchangeCode}
                onChange={(e) => setExchangeCode(e.target.value)}
                className="w-full bg-dark-elevated border border-dark rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-dark-2"
              >
                <option value="binance">Binance</option>
                <option value="bybit">Bybit</option>
                <option value="alpaca">Alpaca</option>
              </select>
            </div>
          </div>

          {/* Timeframe */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8fa3b8] mb-1.5">Timeframe *</label>
            <div className="flex gap-1.5">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`flex-1 px-2 py-1.5 rounded text-xs font-mono font-bold uppercase transition-all ${
                    timeframe === tf
                      ? "bg-[rgba(255,215,0,0.15)] text-[#FFD700] border border-[#FFD700]"
                      : "bg-dark-elevated border border-dark text-[#5a7090] hover:text-foreground hover:border-dark-2"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8fa3b8] mb-1.5">Start Date *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-dark-elevated border border-dark rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-dark-2"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8fa3b8] mb-1.5">End Date *</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-dark-elevated border border-dark rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-dark-2"
              />
            </div>
          </div>

          {/* Capital */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8fa3b8] mb-1.5">Initial Capital (USD) *</label>
            <input
              type="number"
              value={initialCapital}
              onChange={(e) => setInitialCapital(e.target.value)}
              min="100"
              step="100"
              className="w-full bg-dark-elevated border border-dark rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-dark-2"
            />
          </div>

          {/* Config Overrides */}
          <div className="border-t border-dark pt-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#5a7090] mb-3">Config Overrides</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-[#5a7090] mb-1">Fee %</label>
                <input
                  type="number"
                  value={feePct}
                  onChange={(e) => setFeePct(e.target.value)}
                  step="0.01"
                  min="0"
                  className="w-full bg-dark-elevated border border-dark rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-dark-2"
                />
              </div>
              <div>
                <label className="block text-[10px] text-[#5a7090] mb-1">Slippage %</label>
                <input
                  type="number"
                  value={slippagePct}
                  onChange={(e) => setSlippagePct(e.target.value)}
                  step="0.01"
                  min="0"
                  className="w-full bg-dark-elevated border border-dark rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-dark-2"
                />
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="text-xs text-[#ff4757] bg-[rgba(255,71,87,0.1)] border border-[rgba(255,71,87,0.2)] rounded px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-dark">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider text-[#8fa3b8] hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !strategyId}
            className="px-4 py-2 rounded bg-[#FFD700] text-black text-xs font-bold uppercase tracking-wider hover:bg-[#FFE44D] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Submitting..." : "Run Backtest"}
          </button>
        </div>
      </div>
    </div>
  );
}
