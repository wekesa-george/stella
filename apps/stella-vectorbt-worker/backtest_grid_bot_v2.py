"""
Grid Bot Backtester v2 — Adaptive grid with crash protection.

Improvements over v1:
  1. DYNAMIC GRID — Recalculates range every N hours based on rolling price action
  2. TIGHTER SPACING — 1-2% grids instead of 7%, capturing many more round-trips
  3. CRASH PROTECTION — Stop-loss liquidates all holdings if price drops X% below grid floor
  4. TRAILING GRID — Grid shifts up/down as price trends, keeping grids centered on action
  5. GEOMETRIC SPACING — Better for crypto where moves are percentage-based

Usage:
  python backtest_grid_bot_v2.py                                    # defaults (ETH, 5yr)
  python backtest_grid_bot_v2.py --pair BTCUSDT --range-pct 15
  python backtest_grid_bot_v2.py --rebalance-hours 12 --stop-loss 8
"""

import argparse
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sqlalchemy import create_engine, text

PROD_DB_URL = (
    "postgresql://postgres:REDACTED"
    "@88.216.70.194:6786/stella_platform_new"
)


# ── Data structures ─────────────────────────────────────────────────────────
@dataclass
class GridOrder:
    level_idx: int
    price: float
    side: str
    qty: float
    status: str = "open"


@dataclass
class Trade:
    buy_price: float
    sell_price: float
    qty: float
    buy_time: pd.Timestamp
    sell_time: pd.Timestamp
    fee_paid: float
    pnl: float


@dataclass
class GridState:
    # ── Configuration ──
    initial_capital: float
    num_grids: int
    fee_rate: float
    grid_type: str               # "arithmetic" or "geometric"
    range_pct: float             # total grid range as % of current price (e.g. 20 = +/-10%)
    rebalance_bars: int          # recalculate grid every N bars
    stop_loss_pct: float         # liquidate if price drops this % below grid floor
    trailing: bool               # shift grid when price exits range

    # ── Current grid ──
    upper_price: float = 0.0
    lower_price: float = 0.0
    grid_levels: list[float] = field(default_factory=list)
    grid_spacing_pct: float = 0.0
    qty_per_grid: float = 0.0

    # ── Runtime state ──
    orders: dict = field(default_factory=dict)
    holdings: float = 0.0
    cash: float = 0.0
    total_fees: float = 0.0
    trades: list = field(default_factory=list)
    equity_curve: list = field(default_factory=list)
    pending_sells: dict = field(default_factory=dict)

    # ── Tracking ──
    bars_since_rebalance: int = 0
    rebalance_count: int = 0
    stop_loss_events: int = 0
    total_grid_profit: float = 0.0  # realized profit from grid trades only
    peak_equity: float = 0.0


def compute_grid_levels(lower: float, upper: float, n: int, grid_type: str) -> list[float]:
    if grid_type == "geometric":
        ratio = (upper / lower) ** (1 / n)
        return [lower * (ratio ** i) for i in range(n + 1)]
    else:
        spacing = (upper - lower) / n
        return [lower + spacing * i for i in range(n + 1)]


def calculate_range(current_price: float, range_pct: float) -> tuple[float, float]:
    """Compute grid bounds centered on current price."""
    half = range_pct / 2 / 100
    return current_price * (1 - half), current_price * (1 + half)


def setup_grid(state: GridState, current_price: float, available_capital: float):
    """Initialize or reinitialize the grid around current price."""
    state.lower_price, state.upper_price = calculate_range(current_price, state.range_pct)
    state.grid_levels = compute_grid_levels(
        state.lower_price, state.upper_price, state.num_grids, state.grid_type
    )

    # Grid spacing as percentage
    state.grid_spacing_pct = (state.grid_levels[1] / state.grid_levels[0] - 1) * 100

    # Clear existing orders
    state.orders.clear()

    # Determine buy levels below current price
    buy_levels = [i for i, p in enumerate(state.grid_levels) if p < current_price]
    if not buy_levels:
        return

    # Allocate capital across buy levels
    max_buy_price = max(state.grid_levels[i] for i in buy_levels)
    capital_per_grid = available_capital / len(buy_levels)
    state.qty_per_grid = capital_per_grid / max_buy_price

    # Place buy orders
    for i in buy_levels:
        state.orders[i] = GridOrder(
            level_idx=i, price=state.grid_levels[i],
            side="buy", qty=state.qty_per_grid
        )

    state.bars_since_rebalance = 0


def liquidate_holdings(state: GridState, price: float, time: pd.Timestamp):
    """Emergency liquidation — sell all holdings at market price."""
    if state.holdings <= 0:
        return

    revenue = state.holdings * price
    fee = revenue * state.fee_rate
    state.cash += (revenue - fee)
    state.total_fees += fee

    # Close all pending sells as losses
    for buy_idx, ps in list(state.pending_sells.items()):
        pnl = (price - ps["buy_price"]) * ps["qty"] - (ps["qty"] * ps["buy_price"] * state.fee_rate) - (ps["qty"] * price * state.fee_rate)
        state.trades.append(Trade(
            buy_price=ps["buy_price"], sell_price=price,
            qty=ps["qty"], buy_time=ps["buy_time"], sell_time=time,
            fee_paid=ps["qty"] * ps["buy_price"] * state.fee_rate + ps["qty"] * price * state.fee_rate,
            pnl=pnl,
        ))

    state.holdings = 0.0
    state.pending_sells.clear()
    state.orders.clear()
    state.stop_loss_events += 1


def process_candle(state: GridState, time: pd.Timestamp,
                   open_p: float, high: float, low: float, close: float):
    """Process one candle: check fills, stop-loss, rebalance."""

    # ── Stop-loss check ──
    if state.stop_loss_pct > 0 and state.lower_price > 0:
        stop_price = state.lower_price * (1 - state.stop_loss_pct / 100)
        if low <= stop_price:
            liquidate_holdings(state, stop_price, time)
            # Re-setup grid after cooldown (immediate re-entry at new level)
            setup_grid(state, close, state.cash)
            state.rebalance_count += 1

    # ── Fill orders ──
    for level_idx, order in list(state.orders.items()):
        if order.status != "open":
            continue

        if order.side == "buy" and low <= order.price:
            cost = order.qty * order.price
            fee = cost * state.fee_rate
            if state.cash >= cost + fee:
                state.cash -= (cost + fee)
                state.holdings += order.qty
                state.total_fees += fee
                order.status = "filled"

                state.pending_sells[level_idx] = {
                    "buy_price": order.price, "buy_time": time, "qty": order.qty,
                }

                sell_idx = level_idx + 1
                if sell_idx < len(state.grid_levels) and sell_idx not in state.orders:
                    state.orders[sell_idx] = GridOrder(
                        level_idx=sell_idx, price=state.grid_levels[sell_idx],
                        side="sell", qty=order.qty
                    )

        elif order.side == "sell" and high >= order.price:
            revenue = order.qty * order.price
            fee = revenue * state.fee_rate
            state.cash += (revenue - fee)
            state.holdings -= order.qty
            state.total_fees += fee
            order.status = "filled"

            buy_idx = level_idx - 1
            if buy_idx in state.pending_sells:
                ps = state.pending_sells.pop(buy_idx)
                buy_fee = ps["qty"] * ps["buy_price"] * state.fee_rate
                sell_fee = fee
                pnl = (order.price - ps["buy_price"]) * ps["qty"] - buy_fee - sell_fee
                state.trades.append(Trade(
                    buy_price=ps["buy_price"], sell_price=order.price,
                    qty=ps["qty"], buy_time=ps["buy_time"], sell_time=time,
                    fee_paid=buy_fee + sell_fee, pnl=pnl,
                ))
                state.total_grid_profit += pnl

            buy_idx = level_idx - 1
            if buy_idx >= 0 and buy_idx not in state.orders:
                state.orders[buy_idx] = GridOrder(
                    level_idx=buy_idx, price=state.grid_levels[buy_idx],
                    side="buy", qty=order.qty
                )

    # Clean filled
    state.orders = {k: v for k, v in state.orders.items() if v.status == "open"}

    # ── Trailing / Rebalance ──
    state.bars_since_rebalance += 1

    needs_rebalance = False
    if state.trailing and state.upper_price > 0:
        # If price exits the grid range, force rebalance
        if close > state.upper_price or close < state.lower_price:
            needs_rebalance = True

    if state.rebalance_bars > 0 and state.bars_since_rebalance >= state.rebalance_bars:
        needs_rebalance = True

    if needs_rebalance:
        # DON'T liquidate — just shift the grid and keep existing positions
        # Only place new buy orders in the extended range using available cash
        old_lower = state.lower_price
        old_upper = state.upper_price

        new_lower, new_upper = calculate_range(close, state.range_pct)
        state.lower_price = new_lower
        state.upper_price = new_upper
        state.grid_levels = compute_grid_levels(new_lower, new_upper, state.num_grids, state.grid_type)
        state.grid_spacing_pct = (state.grid_levels[1] / state.grid_levels[0] - 1) * 100

        # Clear old orders that are now outside the new range
        state.orders = {
            k: v for k, v in state.orders.items()
            if new_lower <= v.price <= new_upper
        }

        # Place new buy orders below current price using available cash
        buy_levels = [i for i, p in enumerate(state.grid_levels)
                      if p < close and i not in state.orders]
        if buy_levels and state.cash > 0:
            max_buy_price = max(state.grid_levels[i] for i in buy_levels)
            # Use only available cash (not total capital)
            capital_per_grid = state.cash / (len(buy_levels) + 1)  # +1 to keep reserve
            qty = capital_per_grid / max_buy_price
            state.qty_per_grid = qty
            for i in buy_levels:
                state.orders[i] = GridOrder(
                    level_idx=i, price=state.grid_levels[i],
                    side="buy", qty=qty
                )

        state.bars_since_rebalance = 0
        state.rebalance_count += 1

    # ── Equity tracking ──
    equity = state.cash + state.holdings * close
    state.peak_equity = max(state.peak_equity, equity)
    state.equity_curve.append({"time": time, "equity": equity, "price": close})


def load_candles(pair: str, timeframe: str, start: str, end: str) -> pd.DataFrame:
    table_map = {
        "1m": "market_data.ohlcv_1m", "5m": "market_data.ohlcv_5m",
        "15m": "market_data.ohlcv_15m", "1h": "market_data.ohlcv_1h",
        "1d": "market_data.ohlcv_1d",
    }
    engine = create_engine(PROD_DB_URL)
    query = text(f"""
        SELECT time, open, high, low, close, volume
        FROM {table_map[timeframe]}
        WHERE exchange_code = 'binance' AND trading_pair = :pair
          AND time >= :start AND time < :end
        ORDER BY time ASC
    """)
    with engine.connect() as conn:
        df = pd.read_sql(query, conn, params={"pair": pair, "start": start, "end": end},
                         parse_dates=["time"])
    for col in ["open", "high", "low", "close", "volume"]:
        df[col] = df[col].astype(float)
    df = df.set_index("time")
    print(f"  Loaded {len(df):,} candles for {pair} ({timeframe}) from {start} to {end}")
    return df


def run_backtest(
    pair: str = "ETHUSDT",
    timeframe: str = "5m",
    start: str = "2021-04-05",
    end: str = "2026-03-11",
    initial_capital: float = 10_000.0,
    num_grids: int = 40,
    grid_type: str = "geometric",
    range_pct: float = 20.0,
    rebalance_hours: float = 24.0,
    stop_loss_pct: float = 5.0,
    trailing: bool = True,
    fee_rate: float = 0.001,
):
    bars_per_hour = {"1m": 60, "5m": 12, "15m": 4, "1h": 1}
    rebalance_bars = int(rebalance_hours * bars_per_hour.get(timeframe, 12))

    print(f"\n{'='*70}")
    print(f"  GRID BOT v2 — ADAPTIVE BACKTEST")
    print(f"{'='*70}")
    print(f"  Pair:           {pair}")
    print(f"  Period:         {start} -> {end}")
    print(f"  Capital:        ${initial_capital:,.2f}")
    print(f"  Grids:          {num_grids} ({grid_type})")
    print(f"  Range:          {range_pct}% of price (+/-{range_pct/2}%)")
    print(f"  Rebalance:      every {rebalance_hours}h ({rebalance_bars} bars)")
    print(f"  Stop-loss:      {stop_loss_pct}% below grid floor")
    print(f"  Trailing:       {'ON' if trailing else 'OFF'}")
    print(f"  Fee rate:       {fee_rate*100:.2f}% per side")
    print(f"{'='*70}\n")

    df = load_candles(pair, timeframe, start, end)
    if df.empty:
        print("ERROR: No candle data.")
        return None

    state = GridState(
        initial_capital=initial_capital,
        num_grids=num_grids,
        fee_rate=fee_rate,
        grid_type=grid_type,
        range_pct=range_pct,
        rebalance_bars=rebalance_bars,
        stop_loss_pct=stop_loss_pct,
        trailing=trailing,
    )
    state.cash = initial_capital
    state.peak_equity = initial_capital

    first_price = df.iloc[0]["close"]
    setup_grid(state, first_price, initial_capital)

    grid_spacing = state.grid_spacing_pct
    print(f"  Initial grid: ${state.lower_price:,.2f} — ${state.upper_price:,.2f}, "
          f"spacing {grid_spacing:.2f}%\n")

    # ── Run simulation ──
    for time_idx, row in df.iterrows():
        process_candle(state, time_idx, row["open"], row["high"], row["low"], row["close"])

    # ── Results ──
    final_price = df.iloc[-1]["close"]
    final_equity = state.cash + state.holdings * final_price
    total_return = final_equity - initial_capital
    total_return_pct = (total_return / initial_capital) * 100

    buy_hold_qty = initial_capital / first_price
    buy_hold_equity = buy_hold_qty * final_price
    buy_hold_pct = ((buy_hold_equity - initial_capital) / initial_capital) * 100

    years = len(df) / (bars_per_hour.get(timeframe, 12) * 24 * 365.25)
    annual_return_pct = ((final_equity / initial_capital) ** (1 / years) - 1) * 100 if years > 0 else 0

    # Doubling time
    if annual_return_pct > 0:
        import math
        doubling_years = math.log(2) / math.log(1 + annual_return_pct / 100)
    else:
        doubling_years = float("inf")

    completed = state.trades
    num_trades = len(completed)
    if num_trades > 0:
        pnls = [t.pnl for t in completed]
        winners = [p for p in pnls if p > 0]
        losers = [p for p in pnls if p <= 0]
        win_rate = len(winners) / num_trades * 100
        avg_pnl = sum(pnls) / num_trades
        total_profit = sum(winners) if winners else 0
        total_loss_amt = sum(losers) if losers else 0
        profit_factor = abs(total_profit / total_loss_amt) if total_loss_amt != 0 else float("inf")
        avg_hold_bars = np.mean([(t.sell_time - t.buy_time).total_seconds() / 300 for t in completed])
    else:
        win_rate = avg_pnl = total_profit = total_loss_amt = profit_factor = avg_hold_bars = 0

    eq_series = pd.Series([e["equity"] for e in state.equity_curve])
    peak = eq_series.expanding().max()
    drawdown = (eq_series - peak) / peak * 100
    max_drawdown = drawdown.min()

    # Sharpe ratio (annualized)
    if len(eq_series) > 1:
        returns = eq_series.pct_change().dropna()
        bars_per_year = bars_per_hour.get(timeframe, 12) * 24 * 365.25
        sharpe = (returns.mean() / returns.std()) * np.sqrt(bars_per_year) if returns.std() > 0 else 0
    else:
        sharpe = 0

    print(f"\n{'='*70}")
    print(f"  RESULTS")
    print(f"{'='*70}")
    print(f"  Final equity:        ${final_equity:,.2f}")
    print(f"  Total return:        ${total_return:,.2f} ({total_return_pct:+.2f}%)")
    print(f"  Annualized return:   {annual_return_pct:+.2f}%")
    print(f"  TIME TO DOUBLE:      {doubling_years:.1f} years")
    print(f"  Sharpe ratio:        {sharpe:.2f}")
    print(f"  Buy & hold return:   {buy_hold_pct:+.2f}%")
    print(f"  Grid vs B&H:         {total_return_pct - buy_hold_pct:+.2f}%")
    print(f"  Max drawdown:        {max_drawdown:.2f}%")
    print(f"  Total fees paid:     ${state.total_fees:,.2f}")
    print(f"  {'─'*66}")
    print(f"  Completed trades:    {num_trades}")
    print(f"  Win rate:            {win_rate:.1f}%")
    print(f"  Avg P&L/trade:       ${avg_pnl:.4f}")
    print(f"  Profit factor:       {profit_factor:.2f}")
    print(f"  Total profit:        ${total_profit:,.2f}")
    print(f"  Total losses:        ${total_loss_amt:,.2f}")
    print(f"  Grid profit (real):  ${state.total_grid_profit:,.2f}")
    print(f"  Avg hold time:       {avg_hold_bars:.0f} bars ({avg_hold_bars*5/60:.1f}h)")
    print(f"  {'─'*66}")
    print(f"  Rebalances:          {state.rebalance_count}")
    print(f"  Stop-loss events:    {state.stop_loss_events}")
    print(f"  Cash remaining:      ${state.cash:,.2f}")
    print(f"  Asset held:          {state.holdings:.6f} (${state.holdings * final_price:,.2f})")
    print(f"  Open orders:         {len(state.orders)}")
    print(f"  Pending sells:       {len(state.pending_sells)}")
    print(f"  Period:              {years:.2f} years")
    print(f"{'='*70}\n")

    # Save equity curve
    eq_df = pd.DataFrame(state.equity_curve)
    if not eq_df.empty:
        if len(eq_df) > 2000:
            step = len(eq_df) // 2000
            eq_df = eq_df.iloc[::step]
        csv_path = f"v2_equity_{pair}_{start}_{end}.csv"
        eq_df.to_csv(csv_path, index=False)
        print(f"  Equity curve: {csv_path}")

    # Save trade log
    if completed:
        records = [{
            "buy_time": t.buy_time, "sell_time": t.sell_time,
            "buy_price": round(t.buy_price, 2), "sell_price": round(t.sell_price, 2),
            "qty": round(t.qty, 6), "pnl": round(t.pnl, 4),
            "fee": round(t.fee_paid, 4),
            "hold_hours": round((t.sell_time - t.buy_time).total_seconds() / 3600, 2),
        } for t in completed]
        trade_csv = f"v2_trades_{pair}_{start}_{end}.csv"
        pd.DataFrame(records).to_csv(trade_csv, index=False)
        print(f"  Trade log:    {trade_csv}")

    return state


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Grid Bot v2 — Adaptive Backtester")
    parser.add_argument("--pair", default="ETHUSDT")
    parser.add_argument("--timeframe", default="5m")
    parser.add_argument("--start", default="2021-04-05")
    parser.add_argument("--end", default="2026-03-11")
    parser.add_argument("--capital", type=float, default=10_000)
    parser.add_argument("--grids", type=int, default=40)
    parser.add_argument("--grid-type", default="geometric", choices=["arithmetic", "geometric"])
    parser.add_argument("--range-pct", type=float, default=20.0, help="Grid range as %% of price (default: 20)")
    parser.add_argument("--rebalance-hours", type=float, default=24.0, help="Rebalance interval in hours (default: 24)")
    parser.add_argument("--stop-loss", type=float, default=5.0, help="Stop-loss %% below grid floor (default: 5)")
    parser.add_argument("--no-trailing", action="store_true", help="Disable trailing grid")
    parser.add_argument("--fee", type=float, default=0.001)

    args = parser.parse_args()

    run_backtest(
        pair=args.pair,
        timeframe=args.timeframe,
        start=args.start,
        end=args.end,
        initial_capital=args.capital,
        num_grids=args.grids,
        grid_type=args.grid_type,
        range_pct=args.range_pct,
        rebalance_hours=args.rebalance_hours,
        stop_loss_pct=args.stop_loss,
        trailing=not args.no_trailing,
        fee_rate=args.fee,
    )
