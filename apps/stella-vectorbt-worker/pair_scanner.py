"""
Pair Scanner — Find the best trading pairs for grid bot.

Evaluates pairs on:
  1. Daily range % (higher = more grid fills)
  2. Mean reversion tendency (price returns to mean vs trends away)
  3. Actual grid bot daily returns (backtested)
  4. Volume/liquidity (enough to fill orders)
  5. Fee-to-range ratio (range must exceed fee drag)

Scans top Binance USDT futures pairs.
"""

import time as _time
from datetime import datetime, timezone, timedelta

import numpy as np
import pandas as pd
import requests

BINANCE_URL = "https://api.binance.com/api/v3/klines"
BINANCE_TICKER = "https://api.binance.com/api/v3/ticker/24hr"

# Top USDT futures pairs by volume (excluding stablecoins)
CANDIDATE_PAIRS = [
    "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
    "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "DOTUSDT", "LINKUSDT",
    "MATICUSDT", "NEARUSDT", "APTUSDT", "ARBUSDT", "OPUSDT",
    "SUIUSDT", "SEIUSDT", "TIAUSDT", "JUPUSDT", "WIFUSDT",
    "PEPEUSDT", "ONDOUSDT", "RENDERUSDT", "FETUSDT", "INJUSDT",
    "AAVEUSDT", "MKRUSDT", "LTCUSDT", "UNIUSDT", "VIRTUALUSDT",
]


def fetch(pair, interval, start, end):
    start_ms = int(datetime.strptime(start, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp() * 1000)
    end_ms = int(datetime.strptime(end, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp() * 1000)
    all_c = []
    cur = start_ms
    while cur < end_ms:
        params = {"symbol": pair, "interval": interval, "startTime": cur, "endTime": end_ms, "limit": 1000}
        try:
            r = requests.get(BINANCE_URL, params=params, timeout=15)
            if r.status_code == 429:
                _time.sleep(10); continue
            if r.status_code == 400:
                return pd.DataFrame()  # pair doesn't exist
            r.raise_for_status()
        except Exception:
            return pd.DataFrame()
        kl = r.json()
        if not kl: break
        for k in kl:
            all_c.append({
                "time": datetime.fromtimestamp(k[0] / 1000, tz=timezone.utc),
                "open": float(k[1]), "high": float(k[2]),
                "low": float(k[3]), "close": float(k[4]),
                "volume": float(k[5]), "quote_volume": float(k[7]),
            })
        cur = kl[-1][0] + 1
        if len(kl) < 1000: break
        _time.sleep(0.15)
    if not all_c:
        return pd.DataFrame()
    return pd.DataFrame(all_c).set_index("time").sort_index()


def grid_sim_day(df, capital=10000, num_grids=30, fee_rate=0.001):
    if len(df) < 10:
        return None
    lo, hi = df["low"].min(), df["high"].max()
    mid = (hi + lo) / 2
    rng = hi - lo
    if rng / mid < 0.003:
        return {"return_pct": 0, "trades": 0, "range_pct": rng / mid * 100}

    lower, upper = lo * 0.999, hi * 1.001
    ratio = (upper / lower) ** (1 / num_grids)
    levels = [lower * (ratio ** i) for i in range(num_grids + 1)]
    first_price = df.iloc[0]["close"]
    buy_levels = [i for i, p in enumerate(levels) if p < first_price]
    if not buy_levels:
        return {"return_pct": 0, "trades": 0, "range_pct": rng / mid * 100}

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
                    orders[bi] = {"p": levels[bi], "s": "buy", "q": qty}

    final_eq = cash + holdings * df.iloc[-1]["close"]
    ret = (final_eq - capital) / capital * 100
    wins = len([p for p in trades_pnl if p > 0])
    return {
        "return_pct": ret,
        "trades": len(trades_pnl),
        "wins": wins,
        "range_pct": rng / mid * 100,
        "fees": fees,
    }


def compute_mean_reversion_score(df_1h):
    """
    Measure how mean-reverting a pair is.
    Higher score = more mean-reverting = better for grids.
    Uses autocorrelation of returns — negative = mean-reverting, positive = trending.
    """
    returns = df_1h["close"].pct_change().dropna()
    if len(returns) < 50:
        return 0

    # Lag-1 autocorrelation (negative = mean reverting)
    ac1 = returns.autocorr(lag=1)

    # Also check lag-2 and lag-3
    ac2 = returns.autocorr(lag=2)
    ac3 = returns.autocorr(lag=3)

    # Mean reversion score: more negative autocorrelation = better
    # Scale to 0-100 where 100 = strongly mean-reverting
    avg_ac = (ac1 + ac2 + ac3) / 3
    score = max(0, min(100, 50 - avg_ac * 200))

    return score


if __name__ == "__main__":
    start = "2026-03-01"
    end = "2026-03-15"
    days = 14

    print(f"\n{'='*90}")
    print(f"  PAIR SCANNER — Grid Bot Suitability")
    print(f"  Scanning {len(CANDIDATE_PAIRS)} pairs, {start} to {end}")
    print(f"{'='*90}\n")

    results = []

    for pair in CANDIDATE_PAIRS:
        print(f"  Scanning {pair}...", end="", flush=True)

        # Fetch 1m data for grid simulation
        df_1m = fetch(pair, "1m", start, end)
        if df_1m.empty or len(df_1m) < 1000:
            print(f" SKIP (no data)")
            continue

        # Fetch 1h for mean reversion score
        df_1h = fetch(pair, "1h", start, end)

        df_1m.index = pd.to_datetime(df_1m.index, utc=True)

        # Daily grid simulations
        daily_returns = []
        daily_trades = []
        daily_ranges = []

        for d in range(days):
            date = datetime.strptime(start, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=d)
            day_df = df_1m[(df_1m.index >= date) & (df_1m.index < date + timedelta(days=1))]
            if len(day_df) < 100:
                continue
            res = grid_sim_day(day_df)
            if res:
                daily_returns.append(res["return_pct"])
                daily_trades.append(res["trades"])
                daily_ranges.append(res["range_pct"])

        if not daily_returns:
            print(f" SKIP (no daily data)")
            continue

        # Mean reversion score
        mr_score = compute_mean_reversion_score(df_1h) if not df_1h.empty else 0

        # Daily volume
        avg_daily_vol = df_1m["quote_volume"].sum() / days if "quote_volume" in df_1m.columns else 0

        avg_ret = np.mean(daily_returns)
        med_ret = np.median(daily_returns)
        avg_range = np.mean(daily_ranges)
        avg_trades = np.mean(daily_trades)
        profitable_days = len([r for r in daily_returns if r > 0])
        worst_day = min(daily_returns)
        best_day = max(daily_returns)

        # Composite score: weighted combination
        # Positive return is most important, then consistency, then mean reversion
        consistency = profitable_days / len(daily_returns) * 100
        score = (
            avg_ret * 40 +           # Return weight
            med_ret * 20 +           # Median (robustness)
            consistency * 0.3 +      # Consistency bonus
            mr_score * 0.1 +         # Mean reversion bonus
            min(avg_range, 8) * 1 +  # Range bonus (capped)
            worst_day * 5            # Worst day penalty (negative)
        )

        row = {
            "pair": pair,
            "avg_return": avg_ret,
            "median_return": med_ret,
            "best_day": best_day,
            "worst_day": worst_day,
            "avg_range": avg_range,
            "avg_trades": avg_trades,
            "profitable_days": profitable_days,
            "total_days": len(daily_returns),
            "consistency": consistency,
            "mr_score": mr_score,
            "daily_vol_m": avg_daily_vol / 1_000_000,
            "score": score,
        }
        results.append(row)
        print(f" ret={avg_ret:+.3f}% range={avg_range:.1f}% trades={avg_trades:.0f} score={score:.1f}")

    # Sort by score
    results.sort(key=lambda x: x["score"], reverse=True)

    # Print rankings
    sep = "=" * 120
    print(f"\n{sep}")
    print(f"  FINAL RANKINGS — Grid Bot Pair Suitability")
    print(f"{sep}")
    print(f"  {'#':<4} {'Pair':<14} {'AvgRet':>8} {'MedRet':>8} {'Best':>8} {'Worst':>8} {'Range':>7} {'Trades':>7} {'Prof':>6} {'MR':>5} {'Vol$M':>8} {'Score':>7}")
    print(f"  {'-'*112}")

    for i, r in enumerate(results):
        prof = f"{r['profitable_days']}/{r['total_days']}"
        tier = ""
        if i < 5:
            tier = " ★"
        elif i < 10:
            tier = " ●"

        print(
            f"  {i+1:<4} {r['pair']:<14} "
            f"{r['avg_return']:>+7.3f}% "
            f"{r['median_return']:>+7.3f}% "
            f"{r['best_day']:>+7.3f}% "
            f"{r['worst_day']:>+7.3f}% "
            f"{r['avg_range']:>6.1f}% "
            f"{r['avg_trades']:>6.0f} "
            f"{prof:>6} "
            f"{r['mr_score']:>4.0f} "
            f"{r['daily_vol_m']:>7.1f}M "
            f"{r['score']:>6.1f}{tier}"
        )

    # Top picks with recommended params
    print(f"\n{sep}")
    print(f"  TOP 5 RECOMMENDATIONS")
    print(f"{sep}\n")

    for i, r in enumerate(results[:5]):
        # Recommend grid count based on range
        rec_grids = max(15, min(50, int(r["avg_range"] / 0.2)))
        # Fee check: grid spacing should be > 2x fee
        spacing = r["avg_range"] / rec_grids
        if spacing < 0.4:
            rec_grids = max(10, int(r["avg_range"] / 0.4))

        print(f"  {i+1}. {r['pair']}")
        print(f"     Avg daily return: {r['avg_return']:+.3f}%  |  Profitable: {r['profitable_days']}/{r['total_days']} days")
        print(f"     Avg daily range:  {r['avg_range']:.1f}%  |  Avg trades/day: {r['avg_trades']:.0f}")
        print(f"     Best day: {r['best_day']:+.3f}%  |  Worst day: {r['worst_day']:+.3f}%")
        print(f"     Mean reversion:   {r['mr_score']:.0f}/100  |  Daily volume: ${r['daily_vol_m']:.1f}M")
        print(f"     Recommended grids: {rec_grids}  |  Grid spacing: ~{r['avg_range']/rec_grids:.2f}%")
        print()
