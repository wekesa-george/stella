"""
Run physics momentum backtest for VIRTUALUSDT (30 days, 1h candles from Binance API).

Usage:
  python run_momentum_backtest.py
  python run_momentum_backtest.py --pair BTCUSDT --days 60 --timeframe 5m
"""

import argparse
import time
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import requests
import vectorbt as vbt

from app.strategy_adapter import generate_signals

BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines"


def fetch_candles(symbol: str, interval: str, start_date: str, end_date: str) -> pd.DataFrame:
    """Fetch candles from Binance API."""
    start_ms = int(datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp() * 1000)
    end_ms = int(datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp() * 1000)

    all_candles = []
    current_start = start_ms
    batch = 0

    while current_start < end_ms:
        batch += 1
        params = {
            "symbol": symbol,
            "interval": interval,
            "startTime": current_start,
            "endTime": end_ms,
            "limit": 1000,
        }
        resp = requests.get(BINANCE_KLINES_URL, params=params, timeout=15)
        if resp.status_code == 429:
            print(f"  Rate limited, waiting 10s...")
            time.sleep(10)
            continue
        resp.raise_for_status()
        klines = resp.json()

        if not klines:
            break

        for k in klines:
            all_candles.append({
                "time": datetime.fromtimestamp(k[0] / 1000, tz=timezone.utc),
                "open": float(k[1]),
                "high": float(k[2]),
                "low": float(k[3]),
                "close": float(k[4]),
                "volume": float(k[5]),
            })

        last_time = klines[-1][0]
        current_start = last_time + 1
        print(f"  Batch {batch}: {len(klines)} candles (total: {len(all_candles)})")

        if len(klines) < 1000:
            break
        time.sleep(0.3)

    df = pd.DataFrame(all_candles)
    df.set_index("time", inplace=True)
    df.sort_index(inplace=True)
    return df


def run_backtest(pair: str, days: int, timeframe: str, initial_capital: float, config: dict):
    """Fetch data and run momentum backtest."""
    end_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    start_date = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")

    print(f"\n{'='*70}")
    print(f"  PHYSICS MOMENTUM BACKTEST — {pair}")
    print(f"  Period: {start_date} → {end_date} ({days} days)")
    print(f"  Timeframe: {timeframe}  |  Capital: ${initial_capital:,.0f}")
    print(f"{'='*70}\n")

    # 1. Fetch candles
    print(f"Fetching {timeframe} candles for {pair} from Binance...")
    df = fetch_candles(pair, timeframe, start_date, end_date)
    print(f"  → {len(df)} candles loaded\n")

    if len(df) < 50:
        print("ERROR: Not enough candles for backtest (need at least 50)")
        return

    # 2. Generate signals
    print("Generating momentum signals (RSI + MACD crossover)...")
    entries, exits = generate_signals(df, "core_momentum", config)
    entry_count = entries.sum()
    exit_count = exits.sum()
    print(f"  → {entry_count} entry signals, {exit_count} exit signals\n")

    # 3. Run VectorBT portfolio
    print("Running VectorBT portfolio simulation...")
    freq_map = {"1m": "1min", "5m": "5min", "15m": "15min", "1h": "1h", "4h": "4h", "1d": "1D"}

    portfolio = vbt.Portfolio.from_signals(
        close=df["close"],
        entries=entries,
        exits=exits,
        init_cash=initial_capital,
        fees=config.get("fee_pct", 0.001),
        slippage=config.get("slippage_pct", 0.0005),
        freq=freq_map.get(timeframe, "1h"),
    )

    # 4. Results
    stats = portfolio.stats()
    trades = portfolio.trades.records_readable if len(portfolio.trades.records) > 0 else pd.DataFrame()

    final_value = float(portfolio.final_value())
    total_return = ((final_value - initial_capital) / initial_capital) * 100
    total_trades = int(stats.get("Total Trades", 0))

    print(f"\n{'─'*70}")
    print(f"  RESULTS")
    print(f"{'─'*70}")
    print(f"  Final Capital:    ${final_value:,.2f}")
    print(f"  Total Return:     {total_return:+.2f}%")
    print(f"  Max Drawdown:     {abs(float(stats.get('Max Drawdown [%]', 0))):.2f}%")
    print(f"  Sharpe Ratio:     {float(stats.get('Sharpe Ratio', 0)):.4f}")
    print(f"  Sortino Ratio:    {float(stats.get('Sortino Ratio', 0)):.4f}")
    print(f"  Total Trades:     {total_trades}")

    if total_trades > 0 and not trades.empty:
        pnl_col = None
        for c in ["PnL", "pnl"]:
            if c in trades.columns:
                pnl_col = c
                break

        if pnl_col:
            pnl = trades[pnl_col].astype(float)
            wins = (pnl > 0).sum()
            losses = (pnl < 0).sum()
            win_rate = wins / total_trades * 100

            print(f"  Winning Trades:   {wins}")
            print(f"  Losing Trades:    {losses}")
            print(f"  Win Rate:         {win_rate:.1f}%")
            print(f"  Avg Win:          ${pnl[pnl > 0].mean():.2f}" if wins > 0 else "")
            print(f"  Avg Loss:         ${pnl[pnl < 0].mean():.2f}" if losses > 0 else "")
            print(f"  Largest Win:      ${pnl.max():.2f}")
            print(f"  Largest Loss:     ${pnl.min():.2f}")
            print(f"  Profit Factor:    {pnl[pnl > 0].sum() / abs(pnl[pnl < 0].sum()):.2f}" if losses > 0 else f"  Profit Factor:    ∞")

        # Duration
        dur_col = None
        for c in ["Duration", "duration"]:
            if c in trades.columns:
                dur_col = c
                break
        if dur_col:
            try:
                avg_dur = pd.to_timedelta(trades[dur_col]).mean()
                print(f"  Avg Hold Time:    {avg_dur}")
            except Exception:
                pass

    print(f"{'─'*70}")

    # 5. Save equity curve + trades
    equity = portfolio.value()
    eq_df = pd.DataFrame({"time": equity.index, "equity": equity.values})
    eq_file = f"momentum_equity_{pair}_{start_date}_{end_date}.csv"
    eq_df.to_csv(eq_file, index=False)
    print(f"\nEquity curve saved: {eq_file}")

    if not trades.empty:
        trades_file = f"momentum_trades_{pair}_{start_date}_{end_date}.csv"
        trades.to_csv(trades_file, index=False)
        print(f"Trade log saved:   {trades_file}")

    # 6. Print trade log
    if not trades.empty:
        print(f"\n{'─'*70}")
        print(f"  TRADE LOG ({total_trades} trades)")
        print(f"{'─'*70}")
        print(trades.to_string(max_rows=50))

    print(f"\n{'='*70}")
    print(f"  Backtest complete.")
    print(f"{'='*70}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Physics Momentum Backtester")
    parser.add_argument("--pair", default="VIRTUALUSDT", help="Trading pair (default: VIRTUALUSDT)")
    parser.add_argument("--days", type=int, default=30, help="Number of days (default: 30)")
    parser.add_argument("--timeframe", default="1h", help="Candle timeframe (default: 1h)")
    parser.add_argument("--capital", type=float, default=10000, help="Initial capital USD (default: 10000)")
    parser.add_argument("--rsi-period", type=int, default=14)
    parser.add_argument("--rsi-oversold", type=int, default=30)
    parser.add_argument("--rsi-overbought", type=int, default=70)
    parser.add_argument("--macd-fast", type=int, default=12)
    parser.add_argument("--macd-slow", type=int, default=26)
    parser.add_argument("--macd-signal", type=int, default=9)
    parser.add_argument("--fee", type=float, default=0.001, help="Fee rate (default: 0.001 = 0.1%%)")
    args = parser.parse_args()

    config = {
        "rsi_period": args.rsi_period,
        "rsi_oversold": args.rsi_oversold,
        "rsi_overbought": args.rsi_overbought,
        "macd_fast": args.macd_fast,
        "macd_slow": args.macd_slow,
        "macd_signal": args.macd_signal,
        "fee_pct": args.fee,
    }

    run_backtest(args.pair, args.days, args.timeframe, args.capital, config)
