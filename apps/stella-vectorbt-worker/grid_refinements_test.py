"""
Grid Bot Refinements Test — Compare baseline grid vs 3 refinements:

1. PAUSE-ON-TREND: Pause grid buys when ADX > threshold (v3 style), resume when ranging
2. DYNAMIC WIDTH: Set grid width based on recent ATR instead of fixed % of day range
3. PAUSE + DYNAMIC: Both combined

All tested per-day on 1m candles across 5 pairs, 14 days.
"""

import time as _time
from datetime import datetime, timezone, timedelta

import numpy as np
import pandas as pd
import requests

BINANCE_URL = "https://api.binance.com/api/v3/klines"


def fetch(pair, interval, start, end):
    start_ms = int(datetime.strptime(start, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp() * 1000)
    end_ms = int(datetime.strptime(end, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp() * 1000)
    all_c = []
    cur = start_ms
    while cur < end_ms:
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
        if len(kl) < 1000: break
        _time.sleep(0.2)
    return pd.DataFrame(all_c).set_index("time").sort_index()


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


# ═══════════════════════════════════════════════════════════════════════
# BASELINE GRID (same as previous tests)
# ═══════════════════════════════════════════════════════════════════════

def sim_grid_baseline(df, capital=10000, num_grids=30, fee_rate=0.001):
    if len(df) < 10:
        return _empty()
    lo, hi = df["low"].min(), df["high"].max()
    mid = (hi + lo) / 2
    if (hi - lo) / mid < 0.003:
        return _empty()

    lower, upper = lo * 0.999, hi * 1.001
    return _run_grid_engine(df, capital, num_grids, fee_rate, lower, upper)


# ═══════════════════════════════════════════════════════════════════════
# REFINEMENT 1: PAUSE ON TREND
# Grid runs normally but skips new buy orders when ADX > threshold.
# Existing sell orders still execute (take profit).
# ═══════════════════════════════════════════════════════════════════════

def sim_grid_pause_trend(df, capital=10000, num_grids=30, fee_rate=0.001,
                          adx_threshold=25, adx_period=14):
    if len(df) < max(50, adx_period * 3):
        return _empty()

    lo, hi = df["low"].min(), df["high"].max()
    mid = (hi + lo) / 2
    if (hi - lo) / mid < 0.003:
        return _empty()

    lower, upper = lo * 0.999, hi * 1.001
    adx, _ = compute_adx(df["high"], df["low"], df["close"], adx_period)

    return _run_grid_engine(df, capital, num_grids, fee_rate, lower, upper,
                            adx_series=adx, adx_threshold=adx_threshold)


# ═══════════════════════════════════════════════════════════════════════
# REFINEMENT 2: DYNAMIC WIDTH
# Instead of using the full day's range, use ATR-based width.
# Grid width = price ± (ATR * multiplier), recalculated from first hour.
# ═══════════════════════════════════════════════════════════════════════

def sim_grid_dynamic_width(df, capital=10000, num_grids=30, fee_rate=0.001,
                            atr_period=14, atr_mult=3.0, warmup=60):
    if len(df) < warmup + 50:
        return _empty()

    close = df["close"]
    high_s = df["high"]
    low_s = df["low"]

    # Use first `warmup` bars to compute ATR, then set grid
    warmup_df = df.iloc[:warmup]
    tr = pd.concat([
        warmup_df["high"] - warmup_df["low"],
        (warmup_df["high"] - warmup_df["close"].shift()).abs(),
        (warmup_df["low"] - warmup_df["close"].shift()).abs(),
    ], axis=1).max(axis=1)
    atr = tr.mean()

    mid_price = close.iloc[warmup]
    grid_half = atr * atr_mult
    lower = mid_price - grid_half
    upper = mid_price + grid_half

    if lower <= 0 or upper <= lower:
        return _empty()

    # Only run on data after warmup
    run_df = df.iloc[warmup:]
    return _run_grid_engine(run_df, capital, num_grids, fee_rate, lower, upper)


# ═══════════════════════════════════════════════════════════════════════
# REFINEMENT 3: PAUSE + DYNAMIC (both combined)
# ═══════════════════════════════════════════════════════════════════════

def sim_grid_combined(df, capital=10000, num_grids=30, fee_rate=0.001,
                       adx_threshold=25, adx_period=14,
                       atr_period=14, atr_mult=3.0, warmup=60):
    if len(df) < warmup + 50:
        return _empty()

    close = df["close"]

    # Dynamic width from warmup
    warmup_df = df.iloc[:warmup]
    tr = pd.concat([
        warmup_df["high"] - warmup_df["low"],
        (warmup_df["high"] - warmup_df["close"].shift()).abs(),
        (warmup_df["low"] - warmup_df["close"].shift()).abs(),
    ], axis=1).max(axis=1)
    atr = tr.mean()

    mid_price = close.iloc[warmup]
    grid_half = atr * atr_mult
    lower = mid_price - grid_half
    upper = mid_price + grid_half

    if lower <= 0 or upper <= lower:
        return _empty()

    run_df = df.iloc[warmup:]
    adx, _ = compute_adx(run_df["high"], run_df["low"], run_df["close"], adx_period)

    return _run_grid_engine(run_df, capital, num_grids, fee_rate, lower, upper,
                            adx_series=adx, adx_threshold=adx_threshold)


# ═══════════════════════════════════════════════════════════════════════
# CORE GRID ENGINE (shared by all variants)
# ═══════════════════════════════════════════════════════════════════════

def _run_grid_engine(df, capital, num_grids, fee_rate, lower, upper,
                      adx_series=None, adx_threshold=25):
    """
    Run grid simulation. If adx_series is provided, pause buys when ADX > threshold.
    """
    ratio = (upper / lower) ** (1 / num_grids)
    levels = [lower * (ratio ** i) for i in range(num_grids + 1)]

    first_price = df.iloc[0]["close"]
    buy_levels = [i for i, p in enumerate(levels) if p < first_price]
    if not buy_levels:
        return _empty()

    max_bp = max(levels[i] for i in buy_levels)
    qty = (capital / len(buy_levels)) / max_bp

    cash, holdings, fees = capital, 0.0, 0.0
    orders, pending, trades_pnl = {}, {}, []
    equities = []
    paused_bars = 0

    for i in buy_levels:
        orders[i] = {"p": levels[i], "s": "buy", "q": qty}

    for bar_idx, (_, row) in enumerate(df.iterrows()):
        h, l, c = row["high"], row["low"], row["close"]

        # Check if we should pause buys
        buy_paused = False
        if adx_series is not None and bar_idx < len(adx_series):
            adx_val = adx_series.iloc[bar_idx] if bar_idx < len(adx_series) else 0
            if not np.isnan(adx_val) and adx_val > adx_threshold:
                buy_paused = True
                paused_bars += 1

        for idx, od in list(orders.items()):
            if od["s"] == "buy" and not buy_paused and l <= od["p"]:
                cost = od["q"] * od["p"]
                f = cost * fee_rate
                if cash >= cost + f:
                    cash -= cost + f
                    holdings += od["q"]
                    fees += f
                    pending[idx] = {"bp": od["p"], "q": od["q"]}
                    del orders[idx]
                    si = idx + 1
                    if si < len(levels) and si not in orders:
                        orders[si] = {"p": levels[si], "s": "sell", "q": od["q"]}

            elif od["s"] == "sell" and h >= od["p"]:
                rev = od["q"] * od["p"]
                f = rev * fee_rate
                cash += rev - f
                holdings -= od["q"]
                fees += f
                del orders[idx]
                bi = idx - 1
                if bi in pending:
                    ps = pending.pop(bi)
                    pnl = (od["p"] - ps["bp"]) * ps["q"] - ps["q"] * ps["bp"] * fee_rate - ps["q"] * od["p"] * fee_rate
                    trades_pnl.append(pnl)
                if bi >= 0 and bi not in orders:
                    orders[bi] = {"p": levels[bi], "s": "buy", "q": qty}

        equities.append(cash + holdings * c)

    final_eq = cash + holdings * df.iloc[-1]["close"]
    ret = (final_eq - capital) / capital * 100
    wins = len([p for p in trades_pnl if p > 0])
    n = len(trades_pnl)
    gross_w = sum(p for p in trades_pnl if p > 0)
    gross_l = abs(sum(p for p in trades_pnl if p <= 0))

    eq_s = pd.Series(equities)
    dd = 0
    if len(eq_s) > 1:
        peak = eq_s.expanding().max()
        dd = ((eq_s - peak) / peak * 100).min()

    return {
        "return_pct": ret,
        "trades": n,
        "wins": wins,
        "win_rate": wins / n * 100 if n > 0 else 0,
        "max_dd": dd,
        "fees": fees,
        "pf": gross_w / gross_l if gross_l > 0 else (999 if gross_w > 0 else 0),
        "paused_bars": paused_bars,
    }


def _empty():
    return {"return_pct": 0, "trades": 0, "wins": 0, "win_rate": 0, "max_dd": 0, "fees": 0, "pf": 0, "paused_bars": 0}


# ═══════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    pairs = ["VIRTUALUSDT", "ETHUSDT", "SOLUSDT", "BTCUSDT", "BNBUSDT"]
    start = "2026-03-01"
    end = "2026-03-15"
    days = 14

    strategies = {
        "Baseline":     lambda df: sim_grid_baseline(df),
        "PauseTrend":   lambda df: sim_grid_pause_trend(df, adx_threshold=25),
        "DynWidth":     lambda df: sim_grid_dynamic_width(df, atr_mult=3.0),
        "Pause+Dyn":    lambda df: sim_grid_combined(df, adx_threshold=25, atr_mult=3.0),
    }

    # Also test different ADX thresholds for pause
    pause_variants = {
        "Pause20": lambda df: sim_grid_pause_trend(df, adx_threshold=20),
        "Pause30": lambda df: sim_grid_pause_trend(df, adx_threshold=30),
        "Pause35": lambda df: sim_grid_pause_trend(df, adx_threshold=35),
    }

    # Also test different ATR multipliers
    atr_variants = {
        "Dyn2.0": lambda df: sim_grid_dynamic_width(df, atr_mult=2.0),
        "Dyn2.5": lambda df: sim_grid_dynamic_width(df, atr_mult=2.5),
        "Dyn4.0": lambda df: sim_grid_dynamic_width(df, atr_mult=4.0),
    }

    all_strats = {**strategies, **pause_variants, **atr_variants}

    # Collect results: {pair: {strat: [daily_returns]}}
    master = {}

    for pair in pairs:
        sep = "=" * 90
        print(f"\n{sep}")
        print(f"  Fetching {pair}...")
        df_full = fetch(pair, "1m", start, end)
        df_full.index = pd.to_datetime(df_full.index, utc=True)
        print(f"  {len(df_full):,} candles")

        master[pair] = {}

        for sname, sfn in all_strats.items():
            daily_returns = []
            daily_trades = []
            daily_dd = []

            for d in range(days):
                date = datetime.strptime(start, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=d)
                day_df = df_full[(df_full.index >= date) & (df_full.index < date + timedelta(days=1))]
                if len(day_df) < 100:
                    continue
                res = sfn(day_df)
                daily_returns.append(res["return_pct"])
                daily_trades.append(res["trades"])
                daily_dd.append(res["max_dd"])

            master[pair][sname] = {
                "returns": daily_returns,
                "trades": daily_trades,
                "dd": daily_dd,
            }

        print(f"  Done.")

    # ── Per-pair daily view (main 4 strategies only) ──
    for pair in pairs:
        sep = "=" * 90
        print(f"\n{sep}")
        print(f"  {pair} — DAILY RETURNS")
        print(f"{sep}")

        header = f"  {'Date':<8}"
        for s in strategies:
            header += f" {s:>11}"
        header += f" {'Best':>12}"
        print(header)
        print(f"  {'-' * 60}")

        for d in range(days):
            date = (datetime.strptime(start, "%Y-%m-%d") + timedelta(days=d)).strftime("%m/%d")
            row = f"  {date:<8}"
            day_vals = {}
            for sname in strategies:
                rets = master[pair][sname]["returns"]
                if d < len(rets):
                    val = rets[d]
                    day_vals[sname] = val
                    row += f" {val:>+10.3f}%"
                else:
                    row += f"        --"
            if day_vals:
                best = max(day_vals, key=day_vals.get)
                row += f"  {best}"
            print(row)

        print(f"  {'-' * 60}")
        row = f"  {'AVG':<8}"
        for sname in strategies:
            rets = master[pair][sname]["returns"]
            avg = np.mean(rets) if rets else 0
            row += f" {avg:>+10.3f}%"
        print(row)

    # ── Grand summary ──
    sep = "=" * 120
    print(f"\n\n{sep}")
    print(f"  GRAND SUMMARY — All Variants")
    print(f"{sep}")
    print(f"  {'Variant':<14}", end="")
    for pair in pairs:
        print(f" {pair:>14}", end="")
    print(f" {'OVERALL':>10} {'AvgDD':>8}")
    print(f"  {'-' * 106}")

    variant_overalls = {}

    for sname in all_strats:
        print(f"  {sname:<14}", end="")
        all_avg = []
        all_dd = []
        for pair in pairs:
            rets = master[pair][sname]["returns"]
            dds = master[pair][sname]["dd"]
            avg = np.mean(rets) if rets else 0
            all_avg.append(avg)
            all_dd.extend(dds)
            print(f" {avg:>+13.3f}%", end="")
        overall = np.mean(all_avg)
        avg_dd = np.mean(all_dd) if all_dd else 0
        variant_overalls[sname] = overall
        print(f" {overall:>+9.3f}% {avg_dd:>7.2f}%")

    # Best variant
    print(f"  {'-' * 106}")
    best_name = max(variant_overalls, key=variant_overalls.get)
    print(f"  BEST: {best_name} ({variant_overalls[best_name]:+.3f}%)")

    # Consistency: how many days each variant beat baseline
    print(f"\n  DAYS BEATING BASELINE")
    print(f"  {'-' * 80}")
    print(f"  {'Variant':<14}", end="")
    for pair in pairs:
        print(f" {pair:>14}", end="")
    print()

    for sname in all_strats:
        if sname == "Baseline":
            continue
        print(f"  {sname:<14}", end="")
        for pair in pairs:
            base_rets = master[pair]["Baseline"]["returns"]
            var_rets = master[pair][sname]["returns"]
            beat = sum(1 for b, v in zip(base_rets, var_rets) if v > b)
            total = min(len(base_rets), len(var_rets))
            print(f" {beat:>6}/{total:<6}", end="")
        print()

    # Worst day protection
    print(f"\n  WORST DAY COMPARISON (worst single-day return)")
    print(f"  {'-' * 80}")
    print(f"  {'Variant':<14}", end="")
    for pair in pairs:
        print(f" {pair:>14}", end="")
    print()
    for sname in ["Baseline", "PauseTrend", "DynWidth", "Pause+Dyn"]:
        print(f"  {sname:<14}", end="")
        for pair in pairs:
            rets = master[pair][sname]["returns"]
            worst = min(rets) if rets else 0
            print(f" {worst:>+13.3f}%", end="")
        print()
