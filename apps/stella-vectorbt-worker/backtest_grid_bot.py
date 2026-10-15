"""
Grid Bot Backtester — Simulates a real grid trading strategy against historical OHLCV data.

Grid bot mechanics:
  1. Define a price range [lower_price, upper_price] divided into N grid levels
  2. Place buy limit orders at each level below current price
  3. Place sell limit orders at each level above current price
  4. When a buy fills (price drops to that level) → place a sell one grid level above
  5. When a sell fills (price rises to that level) → place a buy one grid level below
  6. Each completed buy→sell cycle captures one grid spacing worth of profit (minus fees)

Usage:
  python backtest_grid_bot.py                          # defaults
  python backtest_grid_bot.py --pair ETHUSDT --grids 20
  python backtest_grid_bot.py --start 2025-06-01 --end 2025-09-01
"""

import argparse
import sys
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal

import numpy as np
import pandas as pd
from sqlalchemy import create_engine, text

# ── DB ──────────────────────────────────────────────────────────────────────
PROD_DB_URL = (
    "postgresql://postgres:REDACTED"
    "@88.216.70.194:6786/stella_platform_new"
)


# ── Data structures ─────────────────────────────────────────────────────────
@dataclass
class GridOrder:
    level_idx: int
    price: float
    side: str          # "buy" or "sell"
    qty: float
    status: str = "open"  # open, filled


@dataclass
class Trade:
    """A completed round-trip: buy → sell."""
    buy_price: float
    sell_price: float
    qty: float
    buy_time: pd.Timestamp
    sell_time: pd.Timestamp
    fee_paid: float
    pnl: float  # net of fees


@dataclass
class GridBotState:
    # Config
    upper_price: float
    lower_price: float
    num_grids: int
    grid_type: str  # "arithmetic" or "geometric"
    initial_capital: float
    fee_rate: float  # per side (e.g. 0.001 = 0.1%)

    # Computed
    grid_levels: list[float] = field(default_factory=list)
    grid_spacing: float = 0.0
    qty_per_grid: float = 0.0

    # Runtime state
    orders: dict = field(default_factory=dict)  # level_idx → GridOrder
    holdings: float = 0.0      # qty of asset held
    cash: float = 0.0
    total_fees: float = 0.0
    trades: list = field(default_factory=list)  # completed Trade objects
    equity_curve: list = field(default_factory=list)

    # Tracking for pending buy fills awaiting sell completion
    pending_sells: dict = field(default_factory=dict)  # level_idx → {buy_price, buy_time, qty}


# ── Grid computation ────────────────────────────────────────────────────────
def compute_grid_levels(state: GridBotState) -> list[float]:
    if state.grid_type == "geometric":
        ratio = (state.upper_price / state.lower_price) ** (1 / state.num_grids)
        return [state.lower_price * (ratio ** i) for i in range(state.num_grids + 1)]
    else:
        spacing = (state.upper_price - state.lower_price) / state.num_grids
        return [state.lower_price + spacing * i for i in range(state.num_grids + 1)]


def initialize_grid(state: GridBotState, current_price: float):
    """Set up grid levels and place initial orders."""
    state.grid_levels = compute_grid_levels(state)
    state.grid_spacing = state.grid_levels[1] - state.grid_levels[0]
    state.cash = state.initial_capital

    # Allocate equal capital to each grid level
    # Reserve capital for buy orders below current price
    buy_levels = [i for i, p in enumerate(state.grid_levels) if p < current_price]
    sell_levels = [i for i, p in enumerate(state.grid_levels) if p > current_price]

    if not buy_levels:
        print(f"  WARNING: Current price {current_price:.2f} is below grid range. No buy levels.")
        return
    if not sell_levels:
        print(f"  WARNING: Current price {current_price:.2f} is above grid range. No sell levels.")
        return

    # Determine qty per grid: use capital allocated across buy levels
    # Each buy level needs enough cash to buy qty at that level's price
    max_buy_price = max(state.grid_levels[i] for i in buy_levels)
    capital_per_grid = state.initial_capital / len(buy_levels)
    state.qty_per_grid = capital_per_grid / max_buy_price

    # Place buy orders below current price
    for i in buy_levels:
        price = state.grid_levels[i]
        state.orders[i] = GridOrder(
            level_idx=i, price=price, side="buy", qty=state.qty_per_grid
        )

    # We don't place sell orders initially (no asset held yet)
    # Sells are placed only after buys fill

    print(f"  Grid initialized: {len(buy_levels)} buy levels, "
          f"qty/grid={state.qty_per_grid:.6f}, "
          f"spacing=${state.grid_spacing:.2f} "
          f"({state.grid_spacing/current_price*100:.2f}%)")


# ── Order fill simulation ──────────────────────────────────────────────────
def process_candle(state: GridBotState, candle_time: pd.Timestamp,
                   open_p: float, high: float, low: float, close: float):
    """Check if any grid orders would have been filled during this candle."""

    filled_orders = []

    for level_idx, order in list(state.orders.items()):
        if order.status != "open":
            continue

        if order.side == "buy" and low <= order.price:
            # Buy order filled
            cost = order.qty * order.price
            fee = cost * state.fee_rate
            if state.cash >= cost + fee:
                state.cash -= (cost + fee)
                state.holdings += order.qty
                state.total_fees += fee
                order.status = "filled"
                filled_orders.append(("buy", level_idx, order.price))

                # Track this buy for round-trip P&L
                state.pending_sells[level_idx] = {
                    "buy_price": order.price,
                    "buy_time": candle_time,
                    "qty": order.qty,
                }

                # Place sell order one level above
                sell_idx = level_idx + 1
                if sell_idx < len(state.grid_levels) and sell_idx not in state.orders:
                    sell_price = state.grid_levels[sell_idx]
                    state.orders[sell_idx] = GridOrder(
                        level_idx=sell_idx, price=sell_price,
                        side="sell", qty=order.qty
                    )

        elif order.side == "sell" and high >= order.price:
            # Sell order filled
            revenue = order.qty * order.price
            fee = revenue * state.fee_rate
            state.cash += (revenue - fee)
            state.holdings -= order.qty
            state.total_fees += fee
            order.status = "filled"
            filled_orders.append(("sell", level_idx, order.price))

            # Complete the round-trip trade
            buy_idx = level_idx - 1
            if buy_idx in state.pending_sells:
                ps = state.pending_sells.pop(buy_idx)
                buy_fee = ps["qty"] * ps["buy_price"] * state.fee_rate
                sell_fee = fee
                pnl = (order.price - ps["buy_price"]) * ps["qty"] - buy_fee - sell_fee
                state.trades.append(Trade(
                    buy_price=ps["buy_price"],
                    sell_price=order.price,
                    qty=ps["qty"],
                    buy_time=ps["buy_time"],
                    sell_time=candle_time,
                    fee_paid=buy_fee + sell_fee,
                    pnl=pnl,
                ))

            # Place buy order one level below
            buy_idx = level_idx - 1
            if buy_idx >= 0 and buy_idx not in state.orders:
                buy_price = state.grid_levels[buy_idx]
                state.orders[buy_idx] = GridOrder(
                    level_idx=buy_idx, price=buy_price,
                    side="buy", qty=order.qty
                )

    # Remove filled orders
    state.orders = {k: v for k, v in state.orders.items() if v.status == "open"}

    # Record equity = cash + holdings * close_price
    equity = state.cash + state.holdings * close
    state.equity_curve.append({"time": candle_time, "equity": equity, "price": close})


# ── Load data ──────────────────────────────────────────────────────────────
def load_candles(pair: str, timeframe: str, start: str, end: str) -> pd.DataFrame:
    table_map = {
        "1m": "market_data.ohlcv_1m",
        "5m": "market_data.ohlcv_5m",
        "15m": "market_data.ohlcv_15m",
        "1h": "market_data.ohlcv_1h",
        "1d": "market_data.ohlcv_1d",
    }
    table = table_map[timeframe]
    engine = create_engine(PROD_DB_URL)

    query = text(f"""
        SELECT time, open, high, low, close, volume
        FROM {table}
        WHERE exchange_code = 'binance'
          AND trading_pair = :pair
          AND time >= :start
          AND time < :end
        ORDER BY time ASC
    """)

    with engine.connect() as conn:
        df = pd.read_sql(query, conn, params={"pair": pair, "start": start, "end": end},
                         parse_dates=["time"])

    for col in ["open", "high", "low", "close", "volume"]:
        df[col] = df[col].astype(float)

    df = df.set_index("time")
    print(f"  Loaded {len(df)} candles for {pair} ({timeframe}) from {start} to {end}")
    return df


# ── Main backtest ──────────────────────────────────────────────────────────
def run_grid_backtest(
    pair: str = "BTCUSDT",
    timeframe: str = "5m",
    start: str = "2025-06-01",
    end: str = "2025-09-01",
    initial_capital: float = 10_000.0,
    num_grids: int = 20,
    grid_type: str = "arithmetic",
    upper_price: float | None = None,
    lower_price: float | None = None,
    fee_rate: float = 0.001,  # 0.1% per side (Binance spot maker)
):
    print(f"\n{'='*70}")
    print(f"  GRID BOT BACKTEST")
    print(f"{'='*70}")
    print(f"  Pair:      {pair}")
    print(f"  Period:    {start} → {end}")
    print(f"  Capital:   ${initial_capital:,.2f}")
    print(f"  Grids:     {num_grids} ({grid_type})")
    print(f"  Fee rate:  {fee_rate*100:.2f}% per side")
    print(f"{'='*70}\n")

    # Load data
    df = load_candles(pair, timeframe, start, end)
    if df.empty:
        print("ERROR: No candle data found.")
        return

    # Auto-detect grid range if not specified
    if upper_price is None or lower_price is None:
        price_low = df["low"].min()
        price_high = df["high"].max()
        price_range = price_high - price_low
        # Use 90% of the range, centered — this captures most of the action
        mid = (price_high + price_low) / 2
        lower_price = lower_price or round(mid - price_range * 0.45, 2)
        upper_price = upper_price or round(mid + price_range * 0.45, 2)
        print(f"  Auto-detected range: ${lower_price:,.2f} — ${upper_price:,.2f}")
        print(f"  (Price moved: ${price_low:,.2f} — ${price_high:,.2f})\n")

    # Initialize
    state = GridBotState(
        upper_price=upper_price,
        lower_price=lower_price,
        num_grids=num_grids,
        grid_type=grid_type,
        initial_capital=initial_capital,
        fee_rate=fee_rate,
    )

    first_price = df.iloc[0]["close"]
    initialize_grid(state, first_price)

    # Run simulation
    for time_idx, row in df.iterrows():
        process_candle(state, time_idx, row["open"], row["high"], row["low"], row["close"])

    # ── Results ────────────────────────────────────────────────────────────
    final_price = df.iloc[-1]["close"]
    final_equity = state.cash + state.holdings * final_price
    total_return = final_equity - initial_capital
    total_return_pct = (total_return / initial_capital) * 100

    # Buy & hold comparison
    buy_hold_qty = initial_capital / first_price
    buy_hold_equity = buy_hold_qty * final_price
    buy_hold_return_pct = ((buy_hold_equity - initial_capital) / initial_capital) * 100

    # Trade stats
    completed = state.trades
    num_trades = len(completed)
    if num_trades > 0:
        pnls = [t.pnl for t in completed]
        winners = [p for p in pnls if p > 0]
        losers = [p for p in pnls if p <= 0]
        win_rate = len(winners) / num_trades * 100
        avg_pnl = sum(pnls) / num_trades
        total_profit = sum(winners) if winners else 0
        total_loss = sum(losers) if losers else 0
        profit_factor = abs(total_profit / total_loss) if total_loss != 0 else float("inf")
        avg_hold_bars = np.mean([(t.sell_time - t.buy_time).total_seconds() / 300
                                 for t in completed])  # in 5m bars
    else:
        win_rate = avg_pnl = total_profit = total_loss = 0
        profit_factor = 0
        avg_hold_bars = 0

    # Drawdown
    eq_series = pd.Series([e["equity"] for e in state.equity_curve])
    peak = eq_series.expanding().max()
    drawdown = (eq_series - peak) / peak * 100
    max_drawdown = drawdown.min()

    # Unrealized P&L from held positions
    unrealized = state.holdings * final_price
    held_cost = sum(ps["buy_price"] * ps["qty"] for ps in state.pending_sells.values())

    print(f"\n{'='*70}")
    print(f"  RESULTS")
    print(f"{'='*70}")
    print(f"  Final equity:       ${final_equity:,.2f}")
    print(f"  Total return:       ${total_return:,.2f} ({total_return_pct:+.2f}%)")
    print(f"  Buy & hold return:  ${buy_hold_equity - initial_capital:,.2f} ({buy_hold_return_pct:+.2f}%)")
    print(f"  Grid vs B&H:        {total_return_pct - buy_hold_return_pct:+.2f}% {'OUTPERFORM' if total_return_pct > buy_hold_return_pct else 'UNDERPERFORM'}")
    print(f"  Max drawdown:       {max_drawdown:.2f}%")
    print(f"  Total fees paid:    ${state.total_fees:,.2f}")
    print(f"  {'─'*66}")
    print(f"  Completed trades:   {num_trades}")
    print(f"  Win rate:           {win_rate:.1f}%")
    print(f"  Avg P&L/trade:      ${avg_pnl:.2f}")
    print(f"  Profit factor:      {profit_factor:.2f}")
    print(f"  Total profit:       ${total_profit:,.2f}")
    print(f"  Total loss:         ${total_loss:,.2f}")
    print(f"  Avg hold time:      {avg_hold_bars:.0f} bars ({avg_hold_bars*5/60:.1f} hours)")
    print(f"  {'─'*66}")
    print(f"  Cash remaining:     ${state.cash:,.2f}")
    print(f"  Asset held:         {state.holdings:.6f} {pair.replace('USDT','')} (${unrealized:,.2f})")
    print(f"  Open grid orders:   {len(state.orders)}")
    print(f"  Pending sells:      {len(state.pending_sells)}")
    print(f"{'='*70}\n")

    # ── Equity curve to CSV ────────────────────────────────────────────────
    eq_df = pd.DataFrame(state.equity_curve)
    if not eq_df.empty:
        # Subsample for manageable CSV size
        if len(eq_df) > 2000:
            step = len(eq_df) // 2000
            eq_df = eq_df.iloc[::step]
        csv_path = f"backtest_equity_{pair}_{start}_{end}.csv"
        eq_df.to_csv(csv_path, index=False)
        print(f"  Equity curve saved: {csv_path}")

    # ── Trade log to CSV ───────────────────────────────────────────────────
    if completed:
        trade_records = [
            {
                "buy_time": t.buy_time,
                "sell_time": t.sell_time,
                "buy_price": round(t.buy_price, 2),
                "sell_price": round(t.sell_price, 2),
                "qty": round(t.qty, 6),
                "pnl": round(t.pnl, 4),
                "fee": round(t.fee_paid, 4),
                "hold_hours": round((t.sell_time - t.buy_time).total_seconds() / 3600, 1),
            }
            for t in completed
        ]
        trade_df = pd.DataFrame(trade_records)
        trade_csv = f"backtest_trades_{pair}_{start}_{end}.csv"
        trade_df.to_csv(trade_csv, index=False)
        print(f"  Trade log saved:    {trade_csv}")

    return state


# ── CLI ────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Grid Bot Backtester")
    parser.add_argument("--pair", default="BTCUSDT", help="Trading pair (default: BTCUSDT)")
    parser.add_argument("--timeframe", default="5m", help="Candle timeframe (default: 5m)")
    parser.add_argument("--start", default="2025-06-01", help="Start date (default: 2025-06-01)")
    parser.add_argument("--end", default="2025-09-01", help="End date (default: 2025-09-01)")
    parser.add_argument("--capital", type=float, default=10_000, help="Initial capital USD (default: 10000)")
    parser.add_argument("--grids", type=int, default=20, help="Number of grid levels (default: 20)")
    parser.add_argument("--grid-type", default="arithmetic", choices=["arithmetic", "geometric"])
    parser.add_argument("--upper", type=float, default=None, help="Upper price bound (auto-detect if omitted)")
    parser.add_argument("--lower", type=float, default=None, help="Lower price bound (auto-detect if omitted)")
    parser.add_argument("--fee", type=float, default=0.001, help="Fee rate per side (default: 0.001 = 0.1%%)")

    args = parser.parse_args()

    run_grid_backtest(
        pair=args.pair,
        timeframe=args.timeframe,
        start=args.start,
        end=args.end,
        initial_capital=args.capital,
        num_grids=args.grids,
        grid_type=args.grid_type,
        upper_price=args.upper,
        lower_price=args.lower,
        fee_rate=args.fee,
    )
