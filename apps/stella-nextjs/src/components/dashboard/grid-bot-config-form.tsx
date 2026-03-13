"use client";

import { useState, useEffect, useMemo } from "react";

// ── Types ────────────────────────────────────────────────────────
export interface GridConfigValues {
  upper_price: number;
  lower_price: number;
  grid_levels: number;
  grid_type: "arithmetic" | "geometric";
  total_investment: number;
  quantity_per_grid: number;
  stop_loss_price: number | null;
  take_profit_price: number | null;
  max_open_orders: number;
  fee_rate: number;
  leverage: number;
}

interface GridBotConfigFormProps {
  values: GridConfigValues;
  onChange: (values: GridConfigValues) => void;
  /** Current market price for the selected pair — used for validation hints */
  currentPrice?: number;
  /** Whether the form is in a disabled/read-only state */
  disabled?: boolean;
  /** Market type — leverage only shown for futures */
  marketType?: string;
}

// ── Helpers ──────────────────────────────────────────────────────
function computeGridSpacing(lower: number, upper: number, levels: number, type: string): number {
  if (levels < 2 || upper <= lower) return 0;
  if (type === "geometric") {
    return (Math.pow(upper / lower, 1 / levels) - 1) * 100;
  }
  return ((upper - lower) / levels / lower) * 100;
}

function computeProfitPerGrid(spacingPct: number, feeRate: number): number {
  return spacingPct - feeRate * 2 * 100;
}

function computeGridLevels(lower: number, upper: number, n: number, type: string): number[] {
  if (n < 2 || upper <= lower) return [];
  const levels: number[] = [];
  if (type === "geometric") {
    const ratio = Math.pow(upper / lower, 1 / n);
    for (let i = 0; i <= n; i++) levels.push(lower * Math.pow(ratio, i));
  } else {
    const step = (upper - lower) / n;
    for (let i = 0; i <= n; i++) levels.push(lower + step * i);
  }
  return levels;
}

// ── Defaults ─────────────────────────────────────────────────────
const DEFAULT_VALUES: GridConfigValues = {
  upper_price: 0,
  lower_price: 0,
  grid_levels: 20,
  grid_type: "geometric",
  total_investment: 1000,
  quantity_per_grid: 0,
  stop_loss_price: null,
  take_profit_price: null,
  max_open_orders: 20,
  fee_rate: 0.001,
  leverage: 1,
};

// ── Component ────────────────────────────────────────────────────
export function GridBotConfigForm({ values, onChange, currentPrice, disabled, marketType }: GridBotConfigFormProps) {
  const v = { ...DEFAULT_VALUES, ...values };

  const update = (patch: Partial<GridConfigValues>) => {
    onChange({ ...v, ...patch });
  };

  // ── Computed metrics ──
  const spacing = useMemo(
    () => computeGridSpacing(v.lower_price, v.upper_price, v.grid_levels, v.grid_type),
    [v.lower_price, v.upper_price, v.grid_levels, v.grid_type]
  );

  const profitPerGrid = useMemo(() => computeProfitPerGrid(spacing, v.fee_rate), [spacing, v.fee_rate]);

  const investmentPerGrid = v.grid_levels > 0 ? v.total_investment / v.grid_levels : 0;

  const gridRange = v.upper_price > 0 && v.lower_price > 0
    ? ((v.upper_price - v.lower_price) / v.lower_price * 100)
    : 0;

  // ── Fee validation ──
  const isFeeValid = spacing > 0 && profitPerGrid > 0;
  const feeWarning = spacing > 0 && !isFeeValid
    ? `Grid spacing (${spacing.toFixed(3)}%) is less than 2x round-trip fees (${(v.fee_rate * 2 * 100).toFixed(2)}%). Every trade will lose money.`
    : null;

  // ── Range validation ──
  const rangeWarning = currentPrice && v.upper_price > 0 && v.lower_price > 0
    ? (currentPrice < v.lower_price
      ? "Current price is BELOW grid range — no buy orders will be placed."
      : currentPrice > v.upper_price
      ? "Current price is ABOVE grid range — no sell orders will be placed."
      : null)
    : null;

  // ── Styles ──
  const label = "text-[9px] text-[#5a7090] uppercase tracking-widest block mb-1.5";
  const input = "w-full bg-dark-elevated border border-dark rounded-sm px-3 py-2 text-xs text-foreground font-mono placeholder:text-[#5a7090] focus:outline-none focus:border-dark-2 disabled:opacity-50";
  const sectionTitle = "text-[10px] text-[#8fa3b8] uppercase tracking-widest font-bold mb-2 mt-4";

  return (
    <div className="space-y-3">
      {/* ── Section: Grid Range ── */}
      <div className={sectionTitle}>Grid Range</div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Lower Price *</label>
          <input
            type="number"
            value={v.lower_price || ""}
            onChange={(e) => update({ lower_price: Number(e.target.value) })}
            placeholder="e.g. 60000"
            step="any"
            min="0"
            className={input}
            disabled={disabled}
          />
        </div>
        <div>
          <label className={label}>Upper Price *</label>
          <input
            type="number"
            value={v.upper_price || ""}
            onChange={(e) => update({ upper_price: Number(e.target.value) })}
            placeholder="e.g. 80000"
            step="any"
            min="0"
            className={input}
            disabled={disabled}
          />
        </div>
      </div>

      {currentPrice && currentPrice > 0 && (
        <div className="text-[10px] text-[#5a7090]">
          Current price: <span className="text-foreground font-mono">${currentPrice.toLocaleString()}</span>
          {gridRange > 0 && (
            <span className="ml-2">
              | Range: <span className="text-foreground font-mono">{gridRange.toFixed(1)}%</span>
            </span>
          )}
        </div>
      )}

      {rangeWarning && (
        <div className="text-[10px] text-[#ffaa00] bg-[rgba(255,170,0,0.06)] border border-[rgba(255,170,0,0.15)] rounded-sm px-2.5 py-1.5">
          {rangeWarning}
        </div>
      )}

      {/* ── Section: Grid Structure ── */}
      <div className={sectionTitle}>Grid Structure</div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Grid Levels</label>
          <input
            type="number"
            value={v.grid_levels}
            onChange={(e) => update({ grid_levels: Math.max(2, parseInt(e.target.value) || 2) })}
            min="2"
            max="500"
            className={input}
            disabled={disabled}
          />
        </div>
        <div>
          <label className={label}>Grid Type</label>
          <select
            value={v.grid_type}
            onChange={(e) => update({ grid_type: e.target.value as "arithmetic" | "geometric" })}
            className={input}
            disabled={disabled}
          >
            <option value="arithmetic">Arithmetic (equal $)</option>
            <option value="geometric">Geometric (equal %)</option>
          </select>
        </div>
      </div>

      {/* ── Computed metrics panel ── */}
      {spacing > 0 && (
        <div className="bg-dark-elevated border border-dark rounded-sm px-3 py-2.5 space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-[#5a7090]">Grid spacing</span>
            <span className="text-foreground font-mono">{spacing.toFixed(3)}%</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-[#5a7090]">Net profit per grid (after fees)</span>
            <span className={`font-mono ${profitPerGrid > 0 ? "text-[#00d4aa]" : "text-[#ff4757]"}`}>
              {profitPerGrid.toFixed(3)}%
            </span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-[#5a7090]">Investment per grid</span>
            <span className="text-foreground font-mono">${investmentPerGrid.toFixed(2)}</span>
          </div>
        </div>
      )}

      {feeWarning && (
        <div className="text-[10px] text-[#ff4757] bg-[rgba(255,71,87,0.06)] border border-[rgba(255,71,87,0.15)] rounded-sm px-2.5 py-1.5">
          {feeWarning}
        </div>
      )}

      {/* ── Section: Capital ── */}
      <div className={sectionTitle}>Capital Allocation</div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Total Investment (USD) *</label>
          <input
            type="number"
            value={v.total_investment || ""}
            onChange={(e) => update({ total_investment: Number(e.target.value) })}
            placeholder="1000"
            step="any"
            min="0"
            className={input}
            disabled={disabled}
          />
        </div>
        <div>
          <label className={label}>Qty Per Grid (0 = auto)</label>
          <input
            type="number"
            value={v.quantity_per_grid || ""}
            onChange={(e) => update({ quantity_per_grid: Number(e.target.value) })}
            placeholder="0 (auto-calculate)"
            step="any"
            min="0"
            className={input}
            disabled={disabled}
          />
          <p className="text-[9px] text-[#5a7090] mt-0.5">Leave 0 to auto-calculate from total investment</p>
        </div>
      </div>

      {/* ── Section: Risk Management ── */}
      <div className={sectionTitle}>Risk Management</div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Stop Loss Price</label>
          <input
            type="number"
            value={v.stop_loss_price ?? ""}
            onChange={(e) => update({ stop_loss_price: e.target.value ? Number(e.target.value) : null })}
            placeholder="Optional — below grid floor"
            step="any"
            min="0"
            className={input}
            disabled={disabled}
          />
          {v.lower_price > 0 && (
            <p className="text-[9px] text-[#5a7090] mt-0.5">
              Grid floor: ${v.lower_price.toLocaleString()}
              {v.stop_loss_price && v.stop_loss_price > 0 && (
                <span> | SL at {((1 - v.stop_loss_price / v.lower_price) * 100).toFixed(1)}% below</span>
              )}
            </p>
          )}
        </div>
        <div>
          <label className={label}>Take Profit Price</label>
          <input
            type="number"
            value={v.take_profit_price ?? ""}
            onChange={(e) => update({ take_profit_price: e.target.value ? Number(e.target.value) : null })}
            placeholder="Optional — above grid ceiling"
            step="any"
            min="0"
            className={input}
            disabled={disabled}
          />
          {v.upper_price > 0 && (
            <p className="text-[9px] text-[#5a7090] mt-0.5">
              Grid ceiling: ${v.upper_price.toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {/* ── Section: Execution ── */}
      <div className={sectionTitle}>Execution</div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Max Open Orders</label>
          <input
            type="number"
            value={v.max_open_orders}
            onChange={(e) => update({ max_open_orders: Math.max(1, parseInt(e.target.value) || 20) })}
            min="1"
            max="200"
            className={input}
            disabled={disabled}
          />
        </div>
        <div>
          <label className={label}>Fee Rate (per side)</label>
          <input
            type="number"
            value={v.fee_rate}
            onChange={(e) => update({ fee_rate: Number(e.target.value) })}
            step="0.0001"
            min="0"
            max="0.01"
            className={input}
            disabled={disabled}
          />
          <p className="text-[9px] text-[#5a7090] mt-0.5">
            0.001 = 0.1% (Binance spot maker)
          </p>
        </div>
      </div>

      {/* ── Section: Leverage (futures only) ── */}
      {(marketType === "usds_futures" || marketType === "coinm_futures") && (
        <>
          <div className={sectionTitle}>Leverage</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Leverage Multiplier</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  value={v.leverage}
                  onChange={(e) => update({ leverage: Math.max(1, Math.min(125, parseInt(e.target.value) || 1)) })}
                  min="1"
                  max="125"
                  step="1"
                  className="flex-1 accent-[#3d9df3]"
                  disabled={disabled}
                />
                <input
                  type="number"
                  value={v.leverage}
                  onChange={(e) => update({ leverage: Math.max(1, Math.min(125, parseInt(e.target.value) || 1)) })}
                  min="1"
                  max="125"
                  className={`${input} !w-16 text-center`}
                  disabled={disabled}
                />
                <span className="text-xs text-foreground font-mono">x</span>
              </div>
              {v.leverage > 10 && (
                <p className="text-[9px] text-[#ffaa00] mt-1">
                  High leverage increases liquidation risk. Platform max is enforced server-side.
                </p>
              )}
              {v.leverage > 1 && v.total_investment > 0 && (
                <p className="text-[9px] text-[#5a7090] mt-0.5">
                  Effective capital: <span className="text-foreground font-mono">${(v.total_investment * v.leverage).toLocaleString()}</span>
                  {" "}({v.leverage}x of ${v.total_investment.toLocaleString()})
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export { DEFAULT_VALUES as GRID_BOT_DEFAULTS };
