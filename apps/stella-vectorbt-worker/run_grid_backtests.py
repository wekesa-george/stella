"""
Run grid bot v3 backtests for BNBUSDT, SOLUSDT, JUPUSDT, VIRTUALUSDT.
Uses the same engine as backtest_grid_bot_v3.py but reads from DEV DB.
"""
from backtest_grid_bot_v3 import run_backtest, load_candles

# Override DB to DEV
import backtest_grid_bot_v3 as v3
v3.PROD_DB_URL = (
    "postgresql://postgres:REDACTED"
    "@170.168.103.207:3212/stella_platform_new"
)

PAIRS = [
    ("BNBUSDT", "2024-03-13", "2026-03-13"),
    ("SOLUSDT", "2024-03-13", "2026-03-13"),
    ("JUPUSDT", "2024-03-13", "2026-03-13"),
    ("VIRTUALUSDT", "2025-04-11", "2026-03-13"),
]

if __name__ == "__main__":
    results = {}
    for pair, start, end in PAIRS:
        print(f"\n\n{'#'*70}")
        print(f"#  RUNNING: {pair} ({start} → {end})")
        print(f"{'#'*70}")

        state = run_backtest(
            pair=pair,
            timeframe="5m",
            start=start,
            end=end,
            initial_capital=10_000.0,
            num_grids=25,
            grid_type="geometric",
            stop_loss_pct=0.0,
            fee_rate=0.001,
            # Trend filter
            ema_fast=50,
            ema_slow=200,
            adx_period=14,
            adx_threshold=25.0,
            # Volatility breaker
            vol_lookback=288,
            vol_multiplier=4.0,
            vol_cooldown_bars=36,
            # Drawdown halt
            yellow_drawdown=15.0,
            orange_drawdown=25.0,
            red_drawdown=40.0,
            run_baseline=True,
        )

        if state:
            final_price = state.equity_curve[-1]["price"] if state.equity_curve else 0
            final_eq = state.cash + state.holdings * final_price
            results[pair] = {
                "final_equity": final_eq,
                "return_pct": (final_eq - 10_000) / 10_000 * 100,
                "trades": len(state.trades),
            }

    print(f"\n\n{'='*70}")
    print(f"  SUMMARY — ALL PAIRS")
    print(f"{'='*70}")
    for pair, r in results.items():
        print(f"  {pair:<14} Return: {r['return_pct']:+.2f}%  |  Equity: ${r['final_equity']:,.2f}  |  Trades: {r['trades']}")
    print(f"{'='*70}")
