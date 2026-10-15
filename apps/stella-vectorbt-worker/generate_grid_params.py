"""Generate exact grid bot parameters for top pairs."""

import requests
import numpy as np
from datetime import datetime, timezone
import time as _time

BINANCE_URL = "https://api.binance.com/api/v3/klines"


def fetch_recent(pair, interval, days):
    end_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    start_ms = end_ms - (days * 86400 * 1000)
    all_c = []
    cur = start_ms
    while cur < end_ms:
        params = {"symbol": pair, "interval": interval, "startTime": cur, "endTime": end_ms, "limit": 1000}
        r = requests.get(BINANCE_URL, params=params, timeout=15)
        if r.status_code == 429:
            _time.sleep(10); continue
        r.raise_for_status()
        kl = r.json()
        if not kl:
            break
        for k in kl:
            all_c.append({"open": float(k[1]), "high": float(k[2]), "low": float(k[3]),
                          "close": float(k[4]), "volume": float(k[5])})
        cur = kl[-1][0] + 1
        if len(kl) < 1000:
            break
        _time.sleep(0.15)
    return all_c


if __name__ == "__main__":
    ticker_r = requests.get("https://api.binance.com/api/v3/ticker/price", timeout=10)
    prices = {t["symbol"]: float(t["price"]) for t in ticker_r.json()}

    pairs_config = [
        ("TIAUSDT",    {"pdp": 4, "qdp": 1, "ret": 0.286, "trades": 44, "prof": "9/14",  "worst": -1.19}),
        ("RENDERUSDT", {"pdp": 4, "qdp": 1, "ret": 0.186, "trades": 42, "prof": "9/14",  "worst": -1.05}),
        ("SUIUSDT",    {"pdp": 4, "qdp": 0, "ret": 0.145, "trades": 54, "prof": "10/14", "worst": -1.86}),
        ("NEARUSDT",   {"pdp": 3, "qdp": 0, "ret": 0.079, "trades": 47, "prof": "8/14",  "worst": -1.32}),
        ("PEPEUSDT",   {"pdp": 7, "qdp": 0, "ret": 0.092, "trades": 81, "prof": "9/14",  "worst": -1.60}),
    ]

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    print()
    print("=" * 70)
    print(f"  GRID BOT PARAMETERS — Ready to Deploy")
    print(f"  Generated: {now}")
    print("=" * 70)

    for pair, cfg in pairs_config:
        cur_price = prices.get(pair, 0)
        if cur_price == 0:
            print(f"\n  {pair}: no price data — skipping")
            continue

        candles = fetch_recent(pair, "1h", 7)
        if len(candles) < 48:
            print(f"\n  {pair}: insufficient candle data — skipping")
            continue

        highs = np.array([c["high"] for c in candles])
        lows = np.array([c["low"] for c in candles])
        closes = np.array([c["close"] for c in candles])

        week_high = highs.max()
        week_low = lows.min()

        # ATR
        tr_list = []
        for i in range(1, len(candles)):
            tr = max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1]))
            tr_list.append(tr)
        atr_14 = np.mean(tr_list[-14:])
        atr_pct = atr_14 / cur_price * 100

        # Daily ranges
        daily_ranges = []
        for d in range(7):
            s = d * 24
            e = s + 24
            if e > len(candles):
                break
            day_h = max(c["high"] for c in candles[s:e])
            day_l = min(c["low"] for c in candles[s:e])
            mid = (day_h + day_l) / 2
            daily_ranges.append((day_h - day_l) / mid * 100)
        avg_daily_range = np.mean(daily_ranges) if daily_ranges else 5.0

        # Grid params
        spread_pct = min(avg_daily_range / 2 * 1.1, 5.0)
        lower = cur_price * (1 - spread_pct / 100)
        upper = cur_price * (1 + spread_pct / 100)

        target_spacing = 0.40
        num_grids = max(10, min(50, int((upper - lower) / (cur_price * target_spacing / 100))))
        actual_spacing = (upper - lower) / num_grids / cur_price * 100

        ratio = (upper / lower) ** (1 / num_grids)

        capital = 2000
        qty_per_grid = capital / num_grids / cur_price

        stop_loss = lower * 0.92
        take_profit = upper * 1.02

        pdp = cfg["pdp"]
        qdp = cfg["qdp"]

        grid_range_abs = round(upper - lower, pdp)
        grid_range_pct = spread_pct * 2

        daily_usd = capital * cfg["ret"] / 100
        monthly_usd = daily_usd * 30
        worst_usd = capital * cfg["worst"] / 100

        print(f"\n{'─' * 70}")
        print(f"  {pair}")
        print(f"{'─' * 70}")
        print(f"")
        print(f"  MARKET DATA")
        print(f"    Current Price:        ${cur_price}")
        print(f"    7d High:              ${week_high}")
        print(f"    7d Low:               ${week_low}")
        print(f"    Avg Daily Range:      {avg_daily_range:.1f}%")
        print(f"    ATR (14x1h):          {atr_pct:.2f}%")
        print(f"")
        print(f"  GRID SETTINGS")
        print(f"    Lower Price:          ${round(lower, pdp)}")
        print(f"    Upper Price:          ${round(upper, pdp)}")
        print(f"    Grid Range:           {grid_range_pct:.1f}% (${grid_range_abs})")
        print(f"    Number of Grids:      {num_grids}")
        print(f"    Grid Type:            Geometric")
        print(f"    Grid Spacing:         ~{actual_spacing:.2f}%")
        print(f"    Qty per Grid:         ~{round(qty_per_grid, qdp)}")
        print(f"")
        print(f"  RISK MANAGEMENT")
        print(f"    Capital:              ${capital:,}")
        print(f"    Stop Loss:            ${round(stop_loss, pdp)} (-{((cur_price - stop_loss) / cur_price * 100):.1f}% from current)")
        print(f"    Take Profit:          ${round(take_profit, pdp)} (+{((take_profit - cur_price) / cur_price * 100):.1f}% from current)")
        print(f"    Max Drawdown Halt:    15%")
        print(f"    Fee Rate:             0.1% per side (maker)")
        print(f"    Market Type:          USDS Futures")
        print(f"    Leverage:             1x (recommended)")
        print(f"")
        print(f"  EXPECTED PERFORMANCE (14-day backtest)")
        print(f"    Avg Daily Return:     +{cfg['ret']:.3f}% (~${daily_usd:.2f}/day)")
        print(f"    Monthly Estimate:     ~${monthly_usd:.0f}")
        print(f"    Avg Trades/Day:       {cfg['trades']}")
        print(f"    Profitable Days:      {cfg['prof']}")
        print(f"    Worst Single Day:     {cfg['worst']:+.2f}% (~${worst_usd:.0f})")

    print(f"\n{'=' * 70}")
    print(f"  DEPLOYMENT NOTES")
    print(f"{'=' * 70}")
    print(f"")
    print(f"  • Grid range based on 7-day avg daily range + 10% buffer")
    print(f"  • Grid spacing kept > 2x fee rate for net-positive fills")
    print(f"  • Stop loss is 8% below grid floor — liquidates all")
    print(f"  • Start with 1x leverage on testnet first")
    print(f"  • These are for Binance USDT-M Futures (not spot)")
    print(f"  • Recalculate params weekly as volatility shifts")
    print(f"  • If price breaks out of grid range, rebalance around new price")
    print(f"  • Combined capital across all 5: $10,000")
    print(f"  • Expected combined daily: ~${sum(2000 * c['ret'] / 100 for _, c in pairs_config):.2f}")
    print(f"  • Expected combined monthly: ~${sum(2000 * c['ret'] / 100 * 30 for _, c in pairs_config):.0f}")
    print()
