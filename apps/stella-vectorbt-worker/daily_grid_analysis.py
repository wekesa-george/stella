"""
Analyze realistic 24h grid bot returns across multiple pairs.
Uses 1m candles from Binance, simulates each day independently.
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
            _time.sleep(10)
            continue
        r.raise_for_status()
        kl = r.json()
        if not kl:
            break
        for k in kl:
            all_c.append({
                "time": datetime.fromtimestamp(k[0] / 1000, tz=timezone.utc),
                "open": float(k[1]), "high": float(k[2]),
                "low": float(k[3]), "close": float(k[4]),
                "volume": float(k[5]),
            })
        cur = kl[-1][0] + 1
        if len(kl) < 1000:
            break
        _time.sleep(0.2)
    df = pd.DataFrame(all_c).set_index("time").sort_index()
    return df


def grid_sim_day(df, capital=10000, num_grids=30, fee_rate=0.001, grid_type="geometric"):
    """Simulate one 24h grid bot session."""
    if len(df) < 10:
        return None

    lo = df["low"].min()
    hi = df["high"].max()
    mid = (hi + lo) / 2
    rng = hi - lo

    if rng / mid < 0.003:
        return {"return_pct": 0, "trades": 0, "range_pct": rng / mid * 100, "fees": 0, "final_eq": capital}

    # Tight grid around actual day range
    lower = lo * 0.999
    upper = hi * 1.001

    if grid_type == "geometric":
        ratio = (upper / lower) ** (1 / num_grids)
        levels = [lower * (ratio ** i) for i in range(num_grids + 1)]
    else:
        step = (upper - lower) / num_grids
        levels = [lower + step * i for i in range(num_grids + 1)]

    first_price = df.iloc[0]["close"]
    buy_levels = [i for i, p in enumerate(levels) if p < first_price]
    if not buy_levels:
        return {"return_pct": 0, "trades": 0, "range_pct": rng / mid * 100, "fees": 0, "final_eq": capital}

    max_bp = max(levels[i] for i in buy_levels)
    qty = (capital / len(buy_levels)) / max_bp

    cash = capital
    holdings = 0.0
    fees = 0.0
    orders = {}
    pending = {}
    trades_pnl = []

    for i in buy_levels:
        orders[i] = {"p": levels[i], "s": "buy", "q": qty}

    for _, row in df.iterrows():
        h, l = row["high"], row["low"]
        for idx, od in list(orders.items()):
            if od["s"] == "buy" and l <= od["p"]:
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
                    orders[bi] = {"p": levels[bi], "s": "buy", "q": od["q"]}

    final_eq = cash + holdings * df.iloc[-1]["close"]
    ret = (final_eq - capital) / capital * 100
    return {
        "return_pct": ret,
        "trades": len(trades_pnl),
        "fees": fees,
        "range_pct": rng / mid * 100,
        "final_eq": final_eq,
        "wins": len([p for p in trades_pnl if p > 0]),
        "losses": len([p for p in trades_pnl if p <= 0]),
    }


if __name__ == "__main__":
    pairs = ["VIRTUALUSDT", "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"]
    end = "2026-03-15"
    start = "2026-03-01"  # 14 days

    all_pair_results = {}

    for pair in pairs:
        sep = "=" * 70
        print(f"\n{sep}")
        print(f"  {pair} — Daily Grid Bot Returns (1m candles, 30 grids)")
        print(f"{sep}")

        df = fetch(pair, "1m", start, end)
        print(f"  Fetched {len(df):,} candles")

        df.index = pd.to_datetime(df.index, utc=True)
        daily_results = []

        for d in range(14):
            date = datetime.strptime(start, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=d)
            day_end = date + timedelta(days=1)
            day_df = df[(df.index >= date) & (df.index < day_end)]

            if len(day_df) < 100:
                continue

            result = grid_sim_day(day_df, capital=10000, num_grids=30, fee_rate=0.001)
            if result:
                result["date"] = date.strftime("%Y-%m-%d")
                daily_results.append(result)

        if not daily_results:
            print("  No results")
            continue

        returns = [r["return_pct"] for r in daily_results]
        trades = [r["trades"] for r in daily_results]
        ranges = [r["range_pct"] for r in daily_results]

        dash = "-" * 42
        print(f"  {'Date':<12} {'Return':>8} {'Trades':>7} {'Range%':>7} {'Fees':>7}")
        print(f"  {dash}")
        for r in daily_results:
            print(f"  {r['date']:<12} {r['return_pct']:>+7.3f}% {r['trades']:>6} {r['range_pct']:>6.1f}% ${r['fees']:>5.1f}")

        print(f"  {dash}")
        print(f"  Avg daily return:  {np.mean(returns):+.3f}%")
        print(f"  Median return:     {np.median(returns):+.3f}%")
        print(f"  Best day:          {max(returns):+.3f}%")
        print(f"  Worst day:         {min(returns):+.3f}%")
        print(f"  Avg daily trades:  {np.mean(trades):.1f}")
        print(f"  Avg daily range:   {np.mean(ranges):.1f}%")
        print(f"  Days profitable:   {len([r for r in returns if r > 0])}/{len(returns)}")

        all_pair_results[pair] = {
            "avg_return": np.mean(returns),
            "median_return": np.median(returns),
            "best": max(returns),
            "worst": min(returns),
            "avg_trades": np.mean(trades),
            "avg_range": np.mean(ranges),
            "profitable_days": len([r for r in returns if r > 0]),
            "total_days": len(returns),
        }

    # Final comparison
    sep = "=" * 70
    print(f"\n\n{sep}")
    print(f"  CROSS-PAIR COMPARISON — Realistic 24h Grid Bot Returns")
    print(f"{sep}")
    print(f"  {'Pair':<14} {'Avg Ret':>8} {'Med Ret':>8} {'Best':>8} {'Worst':>8} {'AvgTrd':>7} {'Prof':>6}")
    dash = "-" * 62
    print(f"  {dash}")
    for pair, r in sorted(all_pair_results.items(), key=lambda x: x[1]["avg_return"], reverse=True):
        pdays = f"{r['profitable_days']}/{r['total_days']}"
        print(f"  {pair:<14} {r['avg_return']:>+7.3f}% {r['median_return']:>+7.3f}% {r['best']:>+7.3f}% {r['worst']:>+7.3f}% {r['avg_trades']:>6.1f} {pdays:>6}")
    print(f"  {dash}")
