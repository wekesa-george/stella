"""
Dual-Mode Bot Backtester — Grid + Breakout with Regime Detection.

When market is ranging (ADX < threshold): run grid bot
When market is trending (ADX > threshold): run breakout with trailing stop
Transitions require N bars of confirmed regime before switching.

Usage:
  python backtest_dual_mode.py
  python backtest_dual_mode.py --pair VIRTUALUSDT --days 14
  python backtest_dual_mode.py --pair BTCUSDT --adx-threshold 22 --confirm-bars 8
  python backtest_dual_mode.py --sweep   # parameter sweep across all pairs
"""

import argparse
import time as _time
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from enum import Enum

import numpy as np
import pandas as pd
import requests

BINANCE_URL = "https://api.binance.com/api/v3/klines"


# ═══════════════════════════════════════════════════════════════════════
# DATA
# ═══════════════════════════════════════════════════════════════════════

def fetch_candles(pair, interval, start, end):
    start_ms = int(datetime.strptime(start, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp() * 1000)
    end_ms = int(datetime.strptime(end, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp() * 1000)
    all_c = []
    cur = start_ms
    batch = 0
    while cur < end_ms:
        batch += 1
        params = {"symbol": pair, "interval": interval, "startTime": cur, "endTime": end_ms, "limit": 1000}
        r = requests.get(BINANCE_URL, params=params, timeout=15)
        if r.status_code == 429:
            _time.sleep(10); continue
        r.raise_for_status()
        kl = r.json()
        if not kl: break
        for k in kl:
            all_c.append({
                "time": datetime.fromtimestamp(k[0] / 1000, tz=timezone.utc),
                "open": float(k[1]), "high": float(k[2]),
                "low": float(k[3]), "close": float(k[4]),
                "volume": float(k[5]),
            })
        cur = kl[-1][0] + 1
        if batch % 10 == 0:
            print(f"    Batch {batch}: {len(all_c):,} candles...")
        if len(kl) < 1000: break
        _time.sleep(0.2)
    df = pd.DataFrame(all_c).set_index("time").sort_index()
    return df


# ═══════════════════════════════════════════════════════════════════════
# INDICATORS
# ═══════════════════════════════════════════════════════════════════════

def compute_adx(high, low, close, period=14):
    plus_dm = high.diff()
    minus_dm = -low.diff()
    plus_dm = plus_dm.where((plus_dm > minus_dm) & (plus_dm > 0), 0.0)
    minus_dm = minus_dm.where((minus_dm > plus_dm) & (minus_dm > 0), 0.0)
    tr = pd.concat([high - low, (high - close.shift()).abs(), (low - close.shift()).abs()], axis=1).max(axis=1)
    atr = tr.ewm(span=period, adjust=False).mean()
    plus_di = 100 * (plus_dm.ewm(span=period, adjust=False).mean() / atr.replace(0, np.nan))
    minus_di = 100 * (minus_dm.ewm(span=period, adjust=False).mean() / atr.replace(0, np.nan))
    dx = 100 * ((plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan))
    return dx.ewm(span=period, adjust=False).mean(), atr


def compute_ema(series, span):
    return series.ewm(span=span, adjust=False).mean()


# ═══════════════════════════════════════════════════════════════════════
# REGIME
# ═══════════════════════════════════════════════════════════════════════

class Mode(Enum):
    GRID = "grid"
    BREAKOUT = "breakout"
    TRANSITION = "transition"  # brief pause during switch


# ═══════════════════════════════════════════════════════════════════════
# GRID ENGINE
# ═══════════════════════════════════════════════════════════════════════

@dataclass
class GridEngine:
    levels: list = field(default_factory=list)
    orders: dict = field(default_factory=dict)
    pending_sells: dict = field(default_factory=dict)  # level_idx → {buy_price, qty}
    qty_per_grid: float = 0.0
    lower: float = 0.0
    upper: float = 0.0

    def setup(self, price, capital, num_grids, grid_type="geometric"):
        """Set up grid around current price using recent range."""
        spread = 0.04  # 4% above and below
        self.lower = price * (1 - spread)
        self.upper = price * (1 + spread)

        if grid_type == "geometric":
            ratio = (self.upper / self.lower) ** (1 / num_grids)
            self.levels = [self.lower * (ratio ** i) for i in range(num_grids + 1)]
        else:
            step = (self.upper - self.lower) / num_grids
            self.levels = [self.lower + step * i for i in range(num_grids + 1)]

        buy_levels = [i for i, p in enumerate(self.levels) if p < price]
        if not buy_levels:
            self.qty_per_grid = 0
            return

        max_bp = max(self.levels[i] for i in buy_levels)
        self.qty_per_grid = (capital / len(buy_levels)) / max_bp

        self.orders = {}
        self.pending_sells = {}
        for i in buy_levels:
            self.orders[i] = {"p": self.levels[i], "s": "buy", "q": self.qty_per_grid}

    def process(self, high, low, close, cash, holdings, fee_rate):
        """Process one candle. Returns (cash_delta, holdings_delta, fees, trades_pnl)."""
        cash_d, hold_d, fees, trades = 0.0, 0.0, 0.0, []

        for idx, od in list(self.orders.items()):
            if od["s"] == "buy" and low <= od["p"]:
                cost = od["q"] * od["p"]
                f = cost * fee_rate
                if cash + cash_d >= cost + f:
                    cash_d -= cost + f
                    hold_d += od["q"]
                    fees += f
                    self.pending_sells[idx] = {"bp": od["p"], "q": od["q"]}
                    del self.orders[idx]
                    si = idx + 1
                    if si < len(self.levels) and si not in self.orders:
                        self.orders[si] = {"p": self.levels[si], "s": "sell", "q": od["q"]}

            elif od["s"] == "sell" and high >= od["p"]:
                rev = od["q"] * od["p"]
                f = rev * fee_rate
                cash_d += rev - f
                hold_d -= od["q"]
                fees += f
                del self.orders[idx]
                bi = idx - 1
                if bi in self.pending_sells:
                    ps = self.pending_sells.pop(bi)
                    pnl = (od["p"] - ps["bp"]) * ps["q"] - ps["q"] * ps["bp"] * fee_rate - ps["q"] * od["p"] * fee_rate
                    trades.append(("grid", pnl))
                if bi >= 0 and bi not in self.orders:
                    self.orders[bi] = {"p": self.levels[bi], "s": "buy", "q": self.qty_per_grid}

        return cash_d, hold_d, fees, trades

    def liquidate(self, price, holdings, fee_rate):
        """Sell all holdings at market price, return (cash, fees, trades)."""
        if holdings <= 0:
            return 0.0, 0.0, []
        rev = holdings * price
        f = rev * fee_rate
        trades = []
        # Close each pending sell as a loss/gain
        for idx, ps in self.pending_sells.items():
            pnl = (price - ps["bp"]) * ps["q"] - ps["q"] * ps["bp"] * fee_rate - ps["q"] * price * fee_rate
            trades.append(("grid_liq", pnl))
        self.orders.clear()
        self.pending_sells.clear()
        return rev - f, f, trades


# ═══════════════════════════════════════════════════════════════════════
# BREAKOUT ENGINE
# ═══════════════════════════════════════════════════════════════════════

@dataclass
class BreakoutEngine:
    pos_qty: float = 0.0
    pos_entry: float = 0.0
    pos_peak: float = 0.0
    bars_held: int = 0

    def reset(self):
        self.pos_qty = 0.0
        self.pos_entry = 0.0
        self.pos_peak = 0.0
        self.bars_held = 0

    def process(self, price, high, low, volume, avg_volume, recent_high,
                cash, fee_rate, vol_mult=2.0, break_pct=0.3,
                trail_pct=0.5, max_hold=120):
        """Process one candle. Returns (cash_delta, holdings_delta, fees, trades)."""
        cash_d, hold_d, fees, trades = 0.0, 0.0, 0.0, []

        if self.pos_qty == 0:
            # Look for breakout entry
            vol_spike = volume > avg_volume * vol_mult if avg_volume > 0 else False
            price_break = price > recent_high * (1 + break_pct / 100) if recent_high > 0 else False

            if vol_spike and price_break:
                qty = (cash * 0.95) / price
                cost = qty * price
                f = cost * fee_rate
                cash_d -= cost + f
                hold_d += qty
                fees += f
                self.pos_qty = qty
                self.pos_entry = price
                self.pos_peak = price
                self.bars_held = 0
        else:
            self.bars_held += 1
            if price > self.pos_peak:
                self.pos_peak = price

            trail_stop = self.pos_peak * (1 - trail_pct / 100)
            if price <= trail_stop or self.bars_held >= max_hold:
                rev = self.pos_qty * price
                f = rev * fee_rate
                cash_d += rev - f
                hold_d -= self.pos_qty
                fees += f
                pnl = (price - self.pos_entry) * self.pos_qty - self.pos_qty * self.pos_entry * fee_rate - self.pos_qty * price * fee_rate
                trades.append(("breakout", pnl))
                self.reset()

        return cash_d, hold_d, fees, trades

    def liquidate(self, price, fee_rate):
        """Close breakout position at market."""
        if self.pos_qty <= 0:
            return 0.0, 0.0, 0.0, []
        rev = self.pos_qty * price
        f = rev * fee_rate
        pnl = (price - self.pos_entry) * self.pos_qty - self.pos_qty * self.pos_entry * fee_rate - self.pos_qty * price * fee_rate
        hold_d = -self.pos_qty
        self.reset()
        return rev - f, hold_d, f, [("breakout_liq", pnl)]


# ═══════════════════════════════════════════════════════════════════════
# DUAL MODE SIMULATOR
# ═══════════════════════════════════════════════════════════════════════

def run_dual_mode(
    df,
    capital=10000,
    fee_rate=0.001,
    # Regime detection
    adx_period=14,
    adx_threshold=25,
    confirm_bars=5,
    # Grid params
    num_grids=30,
    grid_type="geometric",
    # Breakout params
    vol_lookback=60,
    vol_mult=2.0,
    break_pct=0.3,
    trail_pct=0.5,
    max_hold=120,
    # Control
    verbose=False,
):
    if len(df) < max(200, vol_lookback + 50):
        return None

    close = df["close"]
    high_s = df["high"]
    low_s = df["low"]
    volume = df["volume"]

    # Precompute indicators
    adx, atr = compute_adx(high_s, low_s, close, adx_period)
    avg_vol = volume.rolling(vol_lookback).mean()
    recent_high = high_s.rolling(vol_lookback).max()

    # State
    cash = capital
    holdings = 0.0
    total_fees = 0.0
    all_trades = []  # (type, pnl)
    equity_curve = []

    mode = Mode.GRID
    mode_bars = 0  # bars in current mode
    pending_mode = None  # mode we're confirming into
    confirm_count = 0

    grid = GridEngine()
    breakout = BreakoutEngine()

    # Initial grid setup
    first_price = close.iloc[0]
    grid.setup(first_price, capital, num_grids, grid_type)

    transitions = []  # [(bar_idx, from_mode, to_mode)]

    for i in range(vol_lookback + 1, len(df)):
        price = close.iloc[i]
        h = high_s.iloc[i]
        l = low_s.iloc[i]
        v = volume.iloc[i]
        adx_val = adx.iloc[i]
        avg_v = avg_vol.iloc[i]
        r_high = recent_high.iloc[i - 1]

        # ── Regime detection ──
        is_trending = adx_val > adx_threshold if not np.isnan(adx_val) else False

        desired_mode = Mode.BREAKOUT if is_trending else Mode.GRID

        if desired_mode != mode:
            if pending_mode == desired_mode:
                confirm_count += 1
            else:
                pending_mode = desired_mode
                confirm_count = 1

            if confirm_count >= confirm_bars:
                # Confirmed regime change — transition
                old_mode = mode

                # Liquidate current mode
                if old_mode == Mode.GRID and holdings > 0:
                    liq_cash, liq_fees, liq_trades = grid.liquidate(price, holdings, fee_rate)
                    cash += liq_cash
                    total_fees += liq_fees
                    all_trades.extend(liq_trades)
                    holdings = 0.0
                elif old_mode == Mode.BREAKOUT and breakout.pos_qty > 0:
                    liq_cash, hold_d, liq_fees, liq_trades = breakout.liquidate(price, fee_rate)
                    cash += liq_cash
                    holdings += hold_d
                    total_fees += liq_fees
                    all_trades.extend(liq_trades)

                # Switch
                mode = desired_mode
                mode_bars = 0
                pending_mode = None
                confirm_count = 0
                transitions.append((i, old_mode.value, mode.value))

                if mode == Mode.GRID:
                    grid.setup(price, cash + holdings * price, num_grids, grid_type)
                    if holdings > 0:
                        # Sell holdings into cash for grid
                        rev = holdings * price
                        f = rev * fee_rate
                        cash += rev - f
                        total_fees += f
                        holdings = 0.0
                elif mode == Mode.BREAKOUT:
                    breakout.reset()

                if verbose:
                    print(f"    Bar {i}: {old_mode.value} → {mode.value} (ADX={adx_val:.1f})")
        else:
            pending_mode = None
            confirm_count = 0

        mode_bars += 1

        # ── Execute current mode ──
        if mode == Mode.GRID:
            cd, hd, f, tr = grid.process(h, l, price, cash, holdings, fee_rate)
            cash += cd
            holdings += hd
            total_fees += f
            all_trades.extend(tr)

        elif mode == Mode.BREAKOUT:
            cd, hd, f, tr = breakout.process(
                price, h, l, v, avg_v, r_high,
                cash, fee_rate, vol_mult, break_pct, trail_pct, max_hold
            )
            cash += cd
            holdings += hd
            total_fees += f
            all_trades.extend(tr)

        eq = cash + holdings * price
        equity_curve.append({"bar": i, "time": str(df.index[i]), "equity": eq, "mode": mode.value})

    # Close any remaining position
    final_price = close.iloc[-1]
    if holdings > 0:
        rev = holdings * final_price
        f = rev * fee_rate
        cash += rev - f
        total_fees += f
        holdings = 0.0

    if breakout.pos_qty > 0:
        liq_cash, hold_d, liq_fees, liq_trades = breakout.liquidate(final_price, fee_rate)
        cash += liq_cash
        total_fees += liq_fees
        all_trades.extend(liq_trades)

    final_eq = cash
    ret = (final_eq - capital) / capital * 100

    # Metrics
    grid_trades = [t for t in all_trades if t[0].startswith("grid")]
    breakout_trades = [t for t in all_trades if t[0].startswith("breakout")]
    all_pnl = [t[1] for t in all_trades]
    wins = [p for p in all_pnl if p > 0]
    losses = [p for p in all_pnl if p <= 0]
    n = len(all_pnl)
    wr = len(wins) / n * 100 if n > 0 else 0
    gross_w = sum(wins) if wins else 0
    gross_l = abs(sum(losses)) if losses else 0
    pf = gross_w / gross_l if gross_l > 0 else (float("inf") if gross_w > 0 else 0)

    eq_series = pd.Series([e["equity"] for e in equity_curve])
    max_dd = 0
    if len(eq_series) > 0:
        peak = eq_series.expanding().max()
        dd = ((eq_series - peak) / peak * 100)
        max_dd = dd.min()

    # Time in each mode
    grid_bars = sum(1 for e in equity_curve if e["mode"] == "grid")
    breakout_bars = sum(1 for e in equity_curve if e["mode"] == "breakout")
    total_bars = len(equity_curve)

    return {
        "final_eq": final_eq,
        "return_pct": ret,
        "total_trades": n,
        "grid_trades": len(grid_trades),
        "breakout_trades": len(breakout_trades),
        "win_rate": wr,
        "profit_factor": min(pf, 9999),
        "max_drawdown": max_dd,
        "total_fees": total_fees,
        "transitions": len(transitions),
        "grid_pct": grid_bars / total_bars * 100 if total_bars > 0 else 0,
        "breakout_pct": breakout_bars / total_bars * 100 if total_bars > 0 else 0,
        "equity_curve": equity_curve,
        "all_trades": all_trades,
        "grid_pnl": sum(t[1] for t in grid_trades),
        "breakout_pnl": sum(t[1] for t in breakout_trades),
    }


# ═══════════════════════════════════════════════════════════════════════
# COMPARISON: also run grid-only and breakout-only for reference
# ═══════════════════════════════════════════════════════════════════════

def run_grid_only(df, capital=10000, fee_rate=0.001, num_grids=30, grid_type="geometric"):
    """Grid-only baseline (same as shootout)."""
    if len(df) < 10:
        return {"return_pct": 0, "total_trades": 0, "max_drawdown": 0, "fees": 0}

    close = df["close"]
    lo, hi = df["low"].min(), df["high"].max()
    mid = (hi + lo) / 2
    if (hi - lo) / mid < 0.003:
        return {"return_pct": 0, "total_trades": 0, "max_drawdown": 0, "fees": 0}

    lower, upper = lo * 0.999, hi * 1.001
    ratio = (upper / lower) ** (1 / num_grids)
    levels = [lower * (ratio ** i) for i in range(num_grids + 1)]
    first_price = close.iloc[0]
    buy_levels = [i for i, p in enumerate(levels) if p < first_price]
    if not buy_levels:
        return {"return_pct": 0, "total_trades": 0, "max_drawdown": 0, "fees": 0}

    max_bp = max(levels[i] for i in buy_levels)
    qty = (capital / len(buy_levels)) / max_bp
    cash, holdings, fees = capital, 0.0, 0.0
    orders, pending, trades_pnl, equities = {}, {}, [], []

    for i in buy_levels:
        orders[i] = {"p": levels[i], "s": "buy", "q": qty}

    for _, row in df.iterrows():
        h, l, c = row["high"], row["low"], row["close"]
        for idx, od in list(orders.items()):
            if od["s"] == "buy" and l <= od["p"]:
                cost = od["q"] * od["p"]; f = cost * fee_rate
                if cash >= cost + f:
                    cash -= cost + f; holdings += od["q"]; fees += f
                    pending[idx] = {"bp": od["p"], "q": od["q"]}
                    del orders[idx]
                    si = idx + 1
                    if si < len(levels) and si not in orders:
                        orders[si] = {"p": levels[si], "s": "sell", "q": od["q"]}
            elif od["s"] == "sell" and h >= od["p"]:
                rev = od["q"] * od["p"]; f = rev * fee_rate
                cash += rev - f; holdings -= od["q"]; fees += f
                del orders[idx]
                bi = idx - 1
                if bi in pending:
                    ps = pending.pop(bi)
                    pnl = (od["p"] - ps["bp"]) * ps["q"] - ps["q"] * ps["bp"] * fee_rate - ps["q"] * od["p"] * fee_rate
                    trades_pnl.append(pnl)
                if bi >= 0 and bi not in orders:
                    orders[bi] = {"p": levels[bi], "s": "buy", "q": qty}
        equities.append(cash + holdings * c)

    final_eq = cash + holdings * close.iloc[-1]
    ret = (final_eq - capital) / capital * 100
    eq_s = pd.Series(equities)
    dd = ((eq_s - eq_s.expanding().max()) / eq_s.expanding().max() * 100).min() if len(eq_s) > 0 else 0
    wins = len([p for p in trades_pnl if p > 0])

    return {
        "return_pct": ret,
        "total_trades": len(trades_pnl),
        "win_rate": wins / len(trades_pnl) * 100 if trades_pnl else 0,
        "max_drawdown": dd,
        "fees": fees,
    }


# ═══════════════════════════════════════════════════════════════════════
# PARAMETER SWEEP
# ═══════════════════════════════════════════════════════════════════════

def run_sweep(pairs, start, end):
    """Sweep key parameters across all pairs."""
    adx_range = [20, 25, 30]
    confirm_range = [3, 5, 8]
    trail_range = [0.3, 0.5, 0.8]

    print(f"\n{'='*80}")
    print(f"  PARAMETER SWEEP — {len(adx_range)*len(confirm_range)*len(trail_range)} combos × {len(pairs)} pairs")
    print(f"{'='*80}\n")

    all_data = {}

    for pair in pairs:
        print(f"  Fetching {pair}...")
        df = fetch_candles(pair, "1m", start, end)
        df.index = pd.to_datetime(df.index, utc=True)
        print(f"    {len(df):,} candles\n")

        # Grid-only baseline
        baseline = run_grid_only(df)
        print(f"    Grid-only baseline: {baseline['return_pct']:+.3f}%")

        best = {"return_pct": -999}
        results = []

        for adx_t in adx_range:
            for conf in confirm_range:
                for trail in trail_range:
                    res = run_dual_mode(
                        df, adx_threshold=adx_t, confirm_bars=conf,
                        trail_pct=trail, verbose=False,
                    )
                    if res is None:
                        continue
                    row = {
                        "adx": adx_t, "confirm": conf, "trail": trail,
                        "return": res["return_pct"], "trades": res["total_trades"],
                        "dd": res["max_drawdown"], "wr": res["win_rate"],
                        "transitions": res["transitions"],
                        "grid_pct": res["grid_pct"],
                    }
                    results.append(row)
                    if res["return_pct"] > best["return_pct"]:
                        best = {**row, "return_pct": res["return_pct"]}

        all_data[pair] = {"baseline": baseline, "best": best, "results": results}

        print(f"    Best combo: ADX={best.get('adx')}, confirm={best.get('confirm')}, trail={best.get('trail')}")
        print(f"    Best return: {best.get('return', best.get('return_pct', 0)):+.3f}% vs grid-only {baseline['return_pct']:+.3f}%")
        print(f"    Improvement: {best.get('return', best.get('return_pct', 0)) - baseline['return_pct']:+.3f}%\n")

    # Summary
    sep = "=" * 80
    print(f"\n{sep}")
    print(f"  SWEEP RESULTS SUMMARY")
    print(f"{sep}")
    print(f"  {'Pair':<14} {'Grid-Only':>10} {'Dual Best':>10} {'Delta':>8} {'ADX':>5} {'Conf':>5} {'Trail':>6} {'GridTime':>9}")
    print(f"  {'-'*72}")

    for pair in pairs:
        d = all_data[pair]
        bl = d["baseline"]["return_pct"]
        b = d["best"]
        dual = b.get("return", b.get("return_pct", 0))
        delta = dual - bl
        print(f"  {pair:<14} {bl:>+9.3f}% {dual:>+9.3f}% {delta:>+7.3f}% {b.get('adx','?'):>5} {b.get('confirm','?'):>5} {b.get('trail','?'):>5}% {b.get('grid_pct',0):>7.1f}%")

    return all_data


# ═══════════════════════════════════════════════════════════════════════
# SINGLE RUN WITH DETAILED OUTPUT
# ═══════════════════════════════════════════════════════════════════════

def run_single(pair, days, timeframe="1m", **kwargs):
    end = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    start = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")

    sep = "=" * 70
    print(f"\n{sep}")
    print(f"  DUAL-MODE BOT — {pair}")
    print(f"  Period: {start} → {end} ({days} days)")
    print(f"  ADX threshold: {kwargs.get('adx_threshold', 25)}")
    print(f"  Confirm bars:  {kwargs.get('confirm_bars', 5)}")
    print(f"  Trail stop:    {kwargs.get('trail_pct', 0.5)}%")
    print(f"{sep}\n")

    print(f"  Fetching {timeframe} candles...")
    df = fetch_candles(pair, timeframe, start, end)
    df.index = pd.to_datetime(df.index, utc=True)
    print(f"  {len(df):,} candles loaded\n")

    # Run dual mode
    print("  Running dual-mode simulation...")
    result = run_dual_mode(df, verbose=True, **kwargs)

    if result is None:
        print("  ERROR: Not enough data")
        return

    # Run grid-only for comparison
    print("  Running grid-only baseline...")
    baseline = run_grid_only(df)

    # Results
    dash = "-" * 66
    print(f"\n{sep}")
    print(f"  RESULTS")
    print(f"{sep}")
    print(f"  {'Metric':<25} {'Dual-Mode':>15} {'Grid-Only':>15}")
    print(f"  {dash}")
    print(f"  {'Return':<25} {result['return_pct']:>+14.3f}% {baseline['return_pct']:>+14.3f}%")
    print(f"  {'Max Drawdown':<25} {result['max_drawdown']:>14.2f}% {baseline['max_drawdown']:>14.2f}%")
    print(f"  {'Total Trades':<25} {result['total_trades']:>15} {baseline['total_trades']:>15}")
    print(f"  {'Win Rate':<25} {result['win_rate']:>14.1f}% {baseline.get('win_rate',0):>14.1f}%")
    print(f"  {'Total Fees':<25} ${result['total_fees']:>13.2f} ${baseline['fees']:>13.2f}")
    print(f"  {dash}")
    print(f"  {'Grid Trades':<25} {result['grid_trades']:>15}")
    print(f"  {'Breakout Trades':<25} {result['breakout_trades']:>15}")
    print(f"  {'Grid PnL':<25} ${result['grid_pnl']:>13.2f}")
    print(f"  {'Breakout PnL':<25} ${result['breakout_pnl']:>13.2f}")
    print(f"  {'Regime Transitions':<25} {result['transitions']:>15}")
    print(f"  {'Time in Grid':<25} {result['grid_pct']:>14.1f}%")
    print(f"  {'Time in Breakout':<25} {result['breakout_pct']:>14.1f}%")
    print(f"  {dash}")
    delta = result["return_pct"] - baseline["return_pct"]
    print(f"  {'IMPROVEMENT':<25} {delta:>+14.3f}%")
    print(f"{sep}\n")

    # Save
    eq_df = pd.DataFrame(result["equity_curve"])
    eq_file = f"dual_equity_{pair}_{start}_{end}.csv"
    eq_df.to_csv(eq_file, index=False)
    print(f"  Equity curve: {eq_file}")

    return result, baseline


# ═══════════════════════════════════════════════════════════════════════
# DAILY BREAKDOWN
# ═══════════════════════════════════════════════════════════════════════

def run_daily(pairs, start, end, **kwargs):
    """Run per-day comparison of dual vs grid-only."""
    sep = "=" * 80
    print(f"\n{sep}")
    print(f"  DAILY DUAL vs GRID — {start} to {end}")
    print(f"{sep}\n")

    for pair in pairs:
        print(f"  Fetching {pair}...")
        df = fetch_candles(pair, "1m", start, end)
        df.index = pd.to_datetime(df.index, utc=True)
        print(f"    {len(df):,} candles\n")

        days = (datetime.strptime(end, "%Y-%m-%d") - datetime.strptime(start, "%Y-%m-%d")).days

        dual_returns = []
        grid_returns = []

        for d in range(days):
            date = datetime.strptime(start, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=d)
            day_df = df[(df.index >= date) & (df.index < date + timedelta(days=1))]
            if len(day_df) < 300:
                continue

            dual = run_dual_mode(day_df, **kwargs)
            grid = run_grid_only(day_df)

            dual_ret = dual["return_pct"] if dual else 0
            grid_ret = grid["return_pct"]
            dual_returns.append(dual_ret)
            grid_returns.append(grid_ret)

        print(f"  {pair}:")
        print(f"    {'Day':<12} {'Dual':>8} {'Grid':>8} {'Delta':>8}")
        print(f"    {'-'*38}")
        for d, (dr, gr) in enumerate(zip(dual_returns, grid_returns)):
            date = (datetime.strptime(start, "%Y-%m-%d") + timedelta(days=d)).strftime("%m/%d")
            delta = dr - gr
            marker = " ←" if delta > 0.05 else ""
            print(f"    {date:<12} {dr:>+7.3f}% {gr:>+7.3f}% {delta:>+7.3f}%{marker}")

        avg_dual = np.mean(dual_returns) if dual_returns else 0
        avg_grid = np.mean(grid_returns) if grid_returns else 0
        print(f"    {'-'*38}")
        print(f"    {'AVG':<12} {avg_dual:>+7.3f}% {avg_grid:>+7.3f}% {avg_dual-avg_grid:>+7.3f}%")
        dual_wins = sum(1 for d, g in zip(dual_returns, grid_returns) if d > g)
        print(f"    Dual won {dual_wins}/{len(dual_returns)} days\n")


# ═══════════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Dual-Mode Bot Backtester")
    parser.add_argument("--pair", default="VIRTUALUSDT")
    parser.add_argument("--days", type=int, default=14)
    parser.add_argument("--adx-threshold", type=int, default=25)
    parser.add_argument("--confirm-bars", type=int, default=5)
    parser.add_argument("--trail-pct", type=float, default=0.5)
    parser.add_argument("--num-grids", type=int, default=30)
    parser.add_argument("--vol-mult", type=float, default=2.0)
    parser.add_argument("--break-pct", type=float, default=0.3)
    parser.add_argument("--max-hold", type=int, default=120)

    parser.add_argument("--sweep", action="store_true", help="Run parameter sweep")
    parser.add_argument("--daily", action="store_true", help="Run daily comparison")

    args = parser.parse_args()

    pairs = ["VIRTUALUSDT", "ETHUSDT", "SOLUSDT", "BTCUSDT", "BNBUSDT"]
    end = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    start = (datetime.now(timezone.utc) - timedelta(days=args.days)).strftime("%Y-%m-%d")

    if args.sweep:
        run_sweep(pairs, start, end)
    elif args.daily:
        run_daily(
            pairs, start, end,
            adx_threshold=args.adx_threshold,
            confirm_bars=args.confirm_bars,
            trail_pct=args.trail_pct,
            num_grids=args.num_grids,
        )
    else:
        run_single(
            args.pair, args.days,
            adx_threshold=args.adx_threshold,
            confirm_bars=args.confirm_bars,
            trail_pct=args.trail_pct,
            num_grids=args.num_grids,
            vol_mult=args.vol_mult,
            break_pct=args.break_pct,
            max_hold=args.max_hold,
        )
