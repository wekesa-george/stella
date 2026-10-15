"""
Strategy Shootout — Compare day trading strategies on real 1m data.

Strategies tested:
  1. Grid Bot (baseline)
  2. Mean Reversion (Bollinger Band + RSI)
  3. Momentum Breakout (volume spike + price breakout + trailing stop)
  4. VWAP Reversion (buy below VWAP, sell above)
  5. Regime Adaptive (switches between mean-rev and breakout based on ADX)

All tested on 1m candles, each day independently, $10k capital.
"""

import time as _time
from datetime import datetime, timezone, timedelta

import numpy as np
import pandas as pd
import requests

BINANCE_URL = "https://api.binance.com/api/v3/klines"


# ═══════════════════════════════════════════════════════════════════════
# DATA
# ═══════════════════════════════════════════════════════════════════════

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

def compute_rsi(close, period=14):
    delta = close.diff()
    gain = delta.where(delta > 0, 0.0).rolling(period).mean()
    loss = (-delta.where(delta < 0, 0.0)).rolling(period).mean()
    rs = gain / loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def compute_bb(close, period=20, std_mult=2.0):
    sma = close.rolling(period).mean()
    std = close.rolling(period).std()
    return sma, sma + std_mult * std, sma - std_mult * std


def compute_adx(high, low, close, period=14):
    plus_dm = high.diff()
    minus_dm = -low.diff()
    plus_dm = plus_dm.where((plus_dm > minus_dm) & (plus_dm > 0), 0.0)
    minus_dm = minus_dm.where((minus_dm > plus_dm) & (minus_dm > 0), 0.0)
    tr = pd.concat([high - low, (high - close.shift()).abs(), (low - close.shift()).abs()], axis=1).max(axis=1)
    atr = tr.rolling(period).mean()
    plus_di = 100 * (plus_dm.rolling(period).mean() / atr.replace(0, np.nan))
    minus_di = 100 * (minus_dm.rolling(period).mean() / atr.replace(0, np.nan))
    dx = 100 * ((plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan))
    return dx.rolling(period).mean()


def compute_vwap(df):
    tp = (df["high"] + df["low"] + df["close"]) / 3
    cum_tp_vol = (tp * df["volume"]).cumsum()
    cum_vol = df["volume"].cumsum()
    return cum_tp_vol / cum_vol.replace(0, np.nan)


# ═══════════════════════════════════════════════════════════════════════
# STRATEGY 1: GRID BOT
# ═══════════════════════════════════════════════════════════════════════

def sim_grid(df, capital=10000, num_grids=30, fee_rate=0.001):
    if len(df) < 10: return empty_result()
    lo, hi = df["low"].min(), df["high"].max()
    mid = (hi + lo) / 2
    if (hi - lo) / mid < 0.003: return empty_result()

    lower, upper = lo * 0.999, hi * 1.001
    ratio = (upper / lower) ** (1 / num_grids)
    levels = [lower * (ratio ** i) for i in range(num_grids + 1)]

    first_price = df.iloc[0]["close"]
    buy_levels = [i for i, p in enumerate(levels) if p < first_price]
    if not buy_levels: return empty_result()

    max_bp = max(levels[i] for i in buy_levels)
    qty = (capital / len(buy_levels)) / max_bp
    cash, holdings, fees = capital, 0.0, 0.0
    orders, pending, trades_pnl = {}, {}, []

    for i in buy_levels:
        orders[i] = {"p": levels[i], "s": "buy", "q": qty}

    for _, row in df.iterrows():
        h, l = row["high"], row["low"]
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
                    orders[bi] = {"p": levels[bi], "s": "buy", "q": od["q"]}

    final_eq = cash + holdings * df.iloc[-1]["close"]
    return make_result(final_eq, capital, trades_pnl, fees)


# ═══════════════════════════════════════════════════════════════════════
# STRATEGY 2: MEAN REVERSION (BB + RSI)
# ═══════════════════════════════════════════════════════════════════════

def sim_mean_reversion(df, capital=10000, fee_rate=0.001,
                        bb_period=20, bb_std=2.0, rsi_period=14,
                        rsi_entry=35, rsi_exit=60, stop_loss_pct=1.5):
    if len(df) < bb_period + 10: return empty_result()

    close = df["close"]
    rsi = compute_rsi(close, rsi_period)
    sma, upper, lower = compute_bb(close, bb_period, bb_std)

    cash, pos_qty, pos_entry = capital, 0.0, 0.0
    fees, trades_pnl = 0.0, []

    for i in range(bb_period + 1, len(df)):
        price = close.iloc[i]
        r = rsi.iloc[i]

        if pos_qty == 0:
            # Entry: price at/below lower BB and RSI oversold
            if price <= lower.iloc[i] and r < rsi_entry:
                pos_qty = (cash * 0.95) / price  # 95% of capital
                cost = pos_qty * price
                f = cost * fee_rate
                cash -= cost + f
                fees += f
                pos_entry = price
        else:
            # Exit conditions
            hit_target = price >= sma.iloc[i]  # Mean reversion target
            hit_rsi_exit = r > rsi_exit
            hit_stop = price <= pos_entry * (1 - stop_loss_pct / 100)

            if hit_target or hit_rsi_exit or hit_stop:
                rev = pos_qty * price
                f = rev * fee_rate
                cash += rev - f
                fees += f
                pnl = (price - pos_entry) * pos_qty - pos_qty * pos_entry * fee_rate - pos_qty * price * fee_rate
                trades_pnl.append(pnl)
                pos_qty, pos_entry = 0.0, 0.0

    # Close any open position at end
    if pos_qty > 0:
        price = close.iloc[-1]
        rev = pos_qty * price
        f = rev * fee_rate
        cash += rev - f
        fees += f
        pnl = (price - pos_entry) * pos_qty - pos_qty * pos_entry * fee_rate - pos_qty * price * fee_rate
        trades_pnl.append(pnl)

    return make_result(cash, capital, trades_pnl, fees)


# ═══════════════════════════════════════════════════════════════════════
# STRATEGY 3: MOMENTUM BREAKOUT (volume spike + trailing stop)
# ═══════════════════════════════════════════════════════════════════════

def sim_breakout(df, capital=10000, fee_rate=0.001,
                  lookback=60, vol_mult=2.0, price_break_pct=0.3,
                  trail_pct=0.5, max_hold=120):
    if len(df) < lookback + 10: return empty_result()

    close = df["close"]
    volume = df["volume"]
    high = df["high"]

    avg_vol = volume.rolling(lookback).mean()
    recent_high = high.rolling(lookback).max()

    cash, pos_qty, pos_entry, pos_peak, bars_held = capital, 0.0, 0.0, 0.0, 0
    fees, trades_pnl = 0.0, []

    for i in range(lookback + 1, len(df)):
        price = close.iloc[i]
        v = volume.iloc[i]
        avg_v = avg_vol.iloc[i]
        r_high = recent_high.iloc[i - 1]  # Previous bar's rolling high

        if pos_qty == 0:
            # Entry: volume spike + price breaking recent high
            vol_spike = v > avg_v * vol_mult if avg_v > 0 else False
            price_break = price > r_high * (1 + price_break_pct / 100) if r_high > 0 else False

            if vol_spike and price_break:
                pos_qty = (cash * 0.95) / price
                cost = pos_qty * price
                f = cost * fee_rate
                cash -= cost + f
                fees += f
                pos_entry = price
                pos_peak = price
                bars_held = 0
        else:
            bars_held += 1
            if price > pos_peak:
                pos_peak = price

            # Trailing stop or max hold
            trail_stop = pos_peak * (1 - trail_pct / 100)
            if price <= trail_stop or bars_held >= max_hold:
                rev = pos_qty * price
                f = rev * fee_rate
                cash += rev - f
                fees += f
                pnl = (price - pos_entry) * pos_qty - pos_qty * pos_entry * fee_rate - pos_qty * price * fee_rate
                trades_pnl.append(pnl)
                pos_qty, pos_entry, pos_peak, bars_held = 0.0, 0.0, 0.0, 0

    if pos_qty > 0:
        price = close.iloc[-1]
        rev = pos_qty * price
        f = rev * fee_rate
        cash += rev - f
        fees += f
        pnl = (price - pos_entry) * pos_qty - pos_qty * pos_entry * fee_rate - pos_qty * price * fee_rate
        trades_pnl.append(pnl)

    return make_result(cash, capital, trades_pnl, fees)


# ═══════════════════════════════════════════════════════════════════════
# STRATEGY 4: VWAP REVERSION
# ═══════════════════════════════════════════════════════════════════════

def sim_vwap(df, capital=10000, fee_rate=0.001,
              entry_dev=-0.3, exit_dev=0.1, stop_loss_pct=1.0,
              rsi_period=14, rsi_filter=40):
    if len(df) < 30: return empty_result()

    close = df["close"]
    vwap = compute_vwap(df)
    rsi = compute_rsi(close, rsi_period)
    dev_pct = ((close - vwap) / vwap) * 100  # % deviation from VWAP

    cash, pos_qty, pos_entry = capital, 0.0, 0.0
    fees, trades_pnl = 0.0, []

    for i in range(30, len(df)):
        price = close.iloc[i]
        dev = dev_pct.iloc[i]
        r = rsi.iloc[i]

        if pos_qty == 0:
            # Entry: price significantly below VWAP + RSI oversold
            if dev < entry_dev and r < rsi_filter:
                pos_qty = (cash * 0.95) / price
                cost = pos_qty * price
                f = cost * fee_rate
                cash -= cost + f
                fees += f
                pos_entry = price
        else:
            # Exit: price back above VWAP or stop loss
            hit_target = dev > exit_dev
            hit_stop = price <= pos_entry * (1 - stop_loss_pct / 100)

            if hit_target or hit_stop:
                rev = pos_qty * price
                f = rev * fee_rate
                cash += rev - f
                fees += f
                pnl = (price - pos_entry) * pos_qty - pos_qty * pos_entry * fee_rate - pos_qty * price * fee_rate
                trades_pnl.append(pnl)
                pos_qty, pos_entry = 0.0, 0.0

    if pos_qty > 0:
        price = close.iloc[-1]
        rev = pos_qty * price
        f = rev * fee_rate
        cash += rev - f
        fees += f
        pnl = (price - pos_entry) * pos_qty - pos_qty * pos_entry * fee_rate - pos_qty * price * fee_rate
        trades_pnl.append(pnl)

    return make_result(cash, capital, trades_pnl, fees)


# ═══════════════════════════════════════════════════════════════════════
# STRATEGY 5: REGIME ADAPTIVE (ADX switches between mean-rev & breakout)
# ═══════════════════════════════════════════════════════════════════════

def sim_regime(df, capital=10000, fee_rate=0.001, adx_threshold=25):
    """When ADX < threshold → mean reversion, when ADX > threshold → breakout."""
    if len(df) < 100: return empty_result()

    close = df["close"]
    high = df["high"]
    low = df["low"]
    volume = df["volume"]

    adx = compute_adx(high, low, close, 14)
    rsi = compute_rsi(close, 14)
    sma, bb_upper, bb_lower = compute_bb(close, 20, 2.0)
    vwap = compute_vwap(df)

    avg_vol = volume.rolling(60).mean()
    recent_high = high.rolling(60).max()

    cash, pos_qty, pos_entry, pos_peak, bars_held = capital, 0.0, 0.0, 0.0, 0
    pos_mode = None  # "meanrev" or "breakout"
    fees, trades_pnl = 0.0, []

    for i in range(100, len(df)):
        price = close.iloc[i]
        adx_val = adx.iloc[i]
        r = rsi.iloc[i]
        trending = adx_val > adx_threshold if not np.isnan(adx_val) else False

        if pos_qty == 0:
            if not trending:
                # Mean reversion mode
                if price <= bb_lower.iloc[i] and r < 35:
                    pos_qty = (cash * 0.95) / price
                    cost = pos_qty * price
                    f = cost * fee_rate
                    cash -= cost + f
                    fees += f
                    pos_entry = price
                    pos_mode = "meanrev"
            else:
                # Breakout mode
                v = volume.iloc[i]
                avg_v = avg_vol.iloc[i]
                r_high = recent_high.iloc[i - 1]
                vol_spike = v > avg_v * 2.0 if avg_v > 0 else False
                price_break = price > r_high * 1.003 if r_high > 0 else False

                if vol_spike and price_break:
                    pos_qty = (cash * 0.95) / price
                    cost = pos_qty * price
                    f = cost * fee_rate
                    cash -= cost + f
                    fees += f
                    pos_entry = price
                    pos_peak = price
                    bars_held = 0
                    pos_mode = "breakout"
        else:
            bars_held += 1
            should_exit = False

            if pos_mode == "meanrev":
                hit_target = price >= sma.iloc[i]
                hit_rsi = r > 60
                hit_stop = price <= pos_entry * 0.985  # 1.5% stop
                should_exit = hit_target or hit_rsi or hit_stop
            elif pos_mode == "breakout":
                if price > pos_peak:
                    pos_peak = price
                trail_stop = pos_peak * 0.995  # 0.5% trail
                should_exit = price <= trail_stop or bars_held >= 120

            if should_exit:
                rev = pos_qty * price
                f = rev * fee_rate
                cash += rev - f
                fees += f
                pnl = (price - pos_entry) * pos_qty - pos_qty * pos_entry * fee_rate - pos_qty * price * fee_rate
                trades_pnl.append(pnl)
                pos_qty, pos_entry, pos_peak, bars_held, pos_mode = 0.0, 0.0, 0.0, 0, None

    if pos_qty > 0:
        price = close.iloc[-1]
        rev = pos_qty * price
        f = rev * fee_rate
        cash += rev - f
        fees += f
        pnl = (price - pos_entry) * pos_qty - pos_qty * pos_entry * fee_rate - pos_qty * price * fee_rate
        trades_pnl.append(pnl)

    return make_result(cash, capital, trades_pnl, fees)


# ═══════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════

def empty_result():
    return {"return_pct": 0, "trades": 0, "wins": 0, "losses": 0, "fees": 0, "pf": 0}


def make_result(final_cash, capital, trades_pnl, fees):
    ret = (final_cash - capital) / capital * 100
    wins = len([p for p in trades_pnl if p > 0])
    losses = len([p for p in trades_pnl if p <= 0])
    total = len(trades_pnl)
    gross_w = sum(p for p in trades_pnl if p > 0)
    gross_l = abs(sum(p for p in trades_pnl if p <= 0))
    pf = gross_w / gross_l if gross_l > 0 else (float("inf") if gross_w > 0 else 0)
    wr = wins / total * 100 if total > 0 else 0
    return {
        "return_pct": ret,
        "trades": total,
        "wins": wins,
        "losses": losses,
        "win_rate": wr,
        "fees": fees,
        "pf": min(pf, 999),
    }


# ═══════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    pairs = ["VIRTUALUSDT", "ETHUSDT", "SOLUSDT", "BTCUSDT", "BNBUSDT"]
    start = "2026-03-01"
    end = "2026-03-15"

    strategies = {
        "Grid Bot": sim_grid,
        "Mean Rev": sim_mean_reversion,
        "Breakout": sim_breakout,
        "VWAP Rev": sim_vwap,
        "Regime":   sim_regime,
    }

    # Collect all results
    master = {}  # {pair: {strategy: {date: result}}}

    for pair in pairs:
        sep = "=" * 80
        print(f"\n{sep}")
        print(f"  Fetching {pair}...")
        print(f"{sep}")

        df = fetch(pair, "1m", start, end)
        df.index = pd.to_datetime(df.index, utc=True)
        print(f"  {len(df):,} candles loaded")

        master[pair] = {}

        for strat_name, strat_fn in strategies.items():
            daily = []
            for d in range(14):
                date = datetime.strptime(start, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=d)
                day_df = df[(df.index >= date) & (df.index < date + timedelta(days=1))]
                if len(day_df) < 100:
                    continue
                result = strat_fn(day_df)
                result["date"] = date.strftime("%Y-%m-%d")
                daily.append(result)

            master[pair][strat_name] = daily

    # ── Print per-pair results ──
    for pair in pairs:
        sep = "=" * 80
        print(f"\n{sep}")
        print(f"  {pair} — STRATEGY COMPARISON (14 days)")
        print(f"{sep}")

        header = f"  {'Strategy':<12}"
        for d in range(14):
            date = datetime.strptime(start, "%Y-%m-%d") + timedelta(days=d)
            header += f" {date.strftime('%m/%d'):>6}"
        header += f" {'AVG':>7} {'MED':>7} {'W/L':>5} {'WR':>5}"
        print(header)
        print(f"  {'-' * (len(header) - 2)}")

        for strat_name in strategies:
            daily = master[pair][strat_name]
            row = f"  {strat_name:<12}"
            returns = []
            total_trades = 0
            total_wins = 0
            total_losses = 0

            for d in range(14):
                date_str = (datetime.strptime(start, "%Y-%m-%d") + timedelta(days=d)).strftime("%Y-%m-%d")
                match = [r for r in daily if r["date"] == date_str]
                if match:
                    ret = match[0]["return_pct"]
                    returns.append(ret)
                    total_trades += match[0]["trades"]
                    total_wins += match[0]["wins"]
                    total_losses += match[0]["losses"]
                    row += f" {ret:>+5.2f}%"
                else:
                    row += f"    --"

            avg = np.mean(returns) if returns else 0
            med = np.median(returns) if returns else 0
            wr = total_wins / (total_wins + total_losses) * 100 if (total_wins + total_losses) > 0 else 0
            row += f" {avg:>+6.3f}% {med:>+6.3f}% {total_wins}/{total_losses} {wr:>4.0f}%"
            print(row)

    # ── Grand summary ──
    sep = "=" * 80
    print(f"\n\n{sep}")
    print(f"  GRAND SUMMARY — Average Daily Return by Strategy & Pair")
    print(f"{sep}")
    print(f"  {'Pair':<14}", end="")
    for s in strategies:
        print(f" {s:>12}", end="")
    print(f" {'BestStrat':>14}")
    print(f"  {'-' * 78}")

    strat_totals = {s: [] for s in strategies}

    for pair in pairs:
        print(f"  {pair:<14}", end="")
        best_name, best_val = "", -999
        for strat_name in strategies:
            daily = master[pair][strat_name]
            returns = [r["return_pct"] for r in daily]
            avg = np.mean(returns) if returns else 0
            strat_totals[strat_name].append(avg)
            print(f" {avg:>+11.3f}%", end="")
            if avg > best_val:
                best_val = avg
                best_name = strat_name
        print(f" {best_name:>14}")

    print(f"  {'-' * 78}")
    print(f"  {'OVERALL':<14}", end="")
    overall_best_name, overall_best = "", -999
    for strat_name in strategies:
        avg = np.mean(strat_totals[strat_name])
        print(f" {avg:>+11.3f}%", end="")
        if avg > overall_best:
            overall_best = avg
            overall_best_name = strat_name
    print(f" {overall_best_name:>14}")
    print(f"{sep}")

    # Win consistency
    print(f"\n  CONSISTENCY — Profitable Days / Total Days")
    print(f"  {'-' * 78}")
    print(f"  {'Pair':<14}", end="")
    for s in strategies:
        print(f" {s:>12}", end="")
    print()
    for pair in pairs:
        print(f"  {pair:<14}", end="")
        for strat_name in strategies:
            daily = master[pair][strat_name]
            returns = [r["return_pct"] for r in daily]
            prof = len([r for r in returns if r > 0])
            total = len(returns)
            print(f" {prof:>5}/{total:<5}", end="")
        print()
