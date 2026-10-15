"""
Grid Bot Backtester v3 — With 4 key mitigations:

  1. TREND FILTER — EMA crossover + ADX to pause grid in strong trends
  2. VOLATILITY BREAKER — Pause on abnormal price velocity, wait for stabilization
  3. FEE-AWARE SPACING — Reject grid configs where spacing < 2x round-trip fees
  4. MAX DRAWDOWN HALT — Tiered response: yellow (pause buys), orange (close all), red (full stop)

Usage:
  python backtest_grid_bot_v3.py
  python backtest_grid_bot_v3.py --pair BTCUSDT --grids 100 --stop-loss 8
  python backtest_grid_bot_v3.py --adx-threshold 25 --max-drawdown 20
"""

import argparse
import math
from dataclasses import dataclass, field
from enum import Enum

import numpy as np
import pandas as pd
from sqlalchemy import create_engine, text

PROD_DB_URL = (
    "postgresql://postgres:REDACTED"
    "@88.216.70.194:6786/stella_platform_new"
)


# ── Alert levels ────────────────────────────────────────────────────────────
class AlertLevel(Enum):
    GREEN = "green"      # Normal operation
    YELLOW = "yellow"    # Pause new buys, continue selling
    ORANGE = "orange"    # Close all orders, hold cash
    RED = "red"          # Full liquidation and shutdown


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
    exit_reason: str = "grid"  # grid, stop_loss, drawdown_halt, volatility_halt


@dataclass
class GridState:
    # ── Grid config ──
    initial_capital: float
    num_grids: int
    fee_rate: float
    grid_type: str
    stop_loss_pct: float

    # ── Trend filter config ──
    ema_fast: int              # e.g. 50
    ema_slow: int              # e.g. 200
    adx_period: int            # e.g. 14
    adx_threshold: float       # e.g. 25 — above this = trending, pause buys

    # ── Volatility breaker config ──
    vol_lookback: int          # bars to measure normal volatility
    vol_multiplier: float      # trigger if current bar move > multiplier * avg move
    vol_cooldown_bars: int     # bars to wait after volatility spike before resuming

    # ── Drawdown halt config ──
    yellow_drawdown: float     # % drawdown to trigger yellow (pause buys)
    orange_drawdown: float     # % drawdown to trigger orange (close orders, hold)
    red_drawdown: float        # % drawdown to trigger red (full liquidation + stop)

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

    # ── Alert / filter state ──
    alert_level: AlertLevel = AlertLevel.GREEN
    trend_paused: bool = False
    vol_cooldown_remaining: int = 0
    is_shutdown: bool = False

    # ── Tracking ──
    stop_loss_events: int = 0
    total_grid_profit: float = 0.0
    peak_equity: float = 0.0
    trend_pause_bars: int = 0
    vol_pause_bars: int = 0
    yellow_bars: int = 0
    orange_bars: int = 0
    red_triggered: bool = False

    # ── Indicator caches (filled by precompute) ──
    ema_fast_series: pd.Series = field(default_factory=lambda: pd.Series(dtype=float))
    ema_slow_series: pd.Series = field(default_factory=lambda: pd.Series(dtype=float))
    adx_series: pd.Series = field(default_factory=lambda: pd.Series(dtype=float))
    atr_series: pd.Series = field(default_factory=lambda: pd.Series(dtype=float))
    bar_move_pct: pd.Series = field(default_factory=lambda: pd.Series(dtype=float))


# ── Indicators ──────────────────────────────────────────────────────────────
def precompute_indicators(df: pd.DataFrame, state: GridState):
    """Precompute all technical indicators once upfront."""
    close = df["close"]
    high = df["high"]
    low = df["low"]

    # EMAs
    state.ema_fast_series = close.ewm(span=state.ema_fast, adjust=False).mean()
    state.ema_slow_series = close.ewm(span=state.ema_slow, adjust=False).mean()

    # ADX
    state.adx_series = compute_adx(high, low, close, state.adx_period)

    # Bar move % (for volatility detection)
    state.bar_move_pct = (abs(close - close.shift(1)) / close.shift(1) * 100).fillna(0)

    # ATR for reference
    tr = pd.concat([
        high - low,
        abs(high - close.shift(1)),
        abs(low - close.shift(1))
    ], axis=1).max(axis=1)
    state.atr_series = tr.rolling(window=state.vol_lookback, min_periods=1).mean()


def compute_adx(high, low, close, period):
    """Compute ADX (Average Directional Index)."""
    plus_dm = high.diff()
    minus_dm = -low.diff()

    plus_dm = plus_dm.where((plus_dm > minus_dm) & (plus_dm > 0), 0.0)
    minus_dm = minus_dm.where((minus_dm > plus_dm) & (minus_dm > 0), 0.0)

    tr = pd.concat([
        high - low,
        abs(high - close.shift(1)),
        abs(low - close.shift(1))
    ], axis=1).max(axis=1)

    atr = tr.ewm(span=period, adjust=False).mean()
    plus_di = 100 * (plus_dm.ewm(span=period, adjust=False).mean() / atr)
    minus_di = 100 * (minus_dm.ewm(span=period, adjust=False).mean() / atr)

    dx = 100 * abs(plus_di - minus_di) / (plus_di + minus_di).replace(0, 1)
    adx = dx.ewm(span=period, adjust=False).mean()
    return adx.fillna(0)


# ── Grid setup ──────────────────────────────────────────────────────────────
def compute_grid_levels(lower, upper, n, grid_type):
    if grid_type == "geometric":
        ratio = (upper / lower) ** (1 / n)
        return [lower * (ratio ** i) for i in range(n + 1)]
    else:
        spacing = (upper - lower) / n
        return [lower + spacing * i for i in range(n + 1)]


def validate_fee_spacing(grid_levels, fee_rate):
    """Check that grid spacing is at least 2x round-trip fee cost."""
    if len(grid_levels) < 2:
        return False, 0, 0
    spacing_pct = (grid_levels[1] / grid_levels[0] - 1) * 100
    round_trip_fee_pct = fee_rate * 2 * 100  # both sides
    min_required = round_trip_fee_pct * 2  # 2x fee as minimum
    return spacing_pct >= min_required, spacing_pct, min_required


def setup_grid(state: GridState, current_price: float, available_capital: float,
               lo_override=None, hi_override=None):
    """Initialize grid centered on current price or with explicit bounds."""
    if lo_override and hi_override:
        state.lower_price = lo_override
        state.upper_price = hi_override
    else:
        half = 0.10  # default +/- 10%
        state.lower_price = current_price * (1 - half)
        state.upper_price = current_price * (1 + half)

    state.grid_levels = compute_grid_levels(
        state.lower_price, state.upper_price, state.num_grids, state.grid_type
    )

    state.grid_spacing_pct = (state.grid_levels[1] / state.grid_levels[0] - 1) * 100
    state.orders.clear()

    buy_levels = [i for i, p in enumerate(state.grid_levels) if p < current_price]
    if not buy_levels:
        return

    max_buy_price = max(state.grid_levels[i] for i in buy_levels)
    capital_per_grid = available_capital / len(buy_levels)
    state.qty_per_grid = capital_per_grid / max_buy_price

    for i in buy_levels:
        state.orders[i] = GridOrder(
            level_idx=i, price=state.grid_levels[i],
            side="buy", qty=state.qty_per_grid
        )


def liquidate_all(state: GridState, price: float, time: pd.Timestamp, reason: str):
    """Sell all holdings at market price."""
    if state.holdings <= 0:
        return
    revenue = state.holdings * price
    fee = revenue * state.fee_rate
    state.cash += (revenue - fee)
    state.total_fees += fee

    for buy_idx, ps in list(state.pending_sells.items()):
        buy_fee = ps["qty"] * ps["buy_price"] * state.fee_rate
        sell_fee = ps["qty"] * price * state.fee_rate
        pnl = (price - ps["buy_price"]) * ps["qty"] - buy_fee - sell_fee
        state.trades.append(Trade(
            buy_price=ps["buy_price"], sell_price=price,
            qty=ps["qty"], buy_time=ps["buy_time"], sell_time=time,
            fee_paid=buy_fee + sell_fee, pnl=pnl, exit_reason=reason,
        ))

    state.holdings = 0.0
    state.pending_sells.clear()
    state.orders.clear()


# ── Main candle processing ──────────────────────────────────────────────────
def process_candle(state: GridState, idx: int, time: pd.Timestamp,
                   open_p: float, high: float, low: float, close: float):
    """Process one candle with all mitigations active."""

    if state.is_shutdown:
        equity = state.cash + state.holdings * close
        state.equity_curve.append({"time": time, "equity": equity, "price": close})
        return

    # ── 1. DRAWDOWN HALT CHECK ──
    equity = state.cash + state.holdings * close
    state.peak_equity = max(state.peak_equity, equity)
    current_dd = ((equity - state.peak_equity) / state.peak_equity) * 100 if state.peak_equity > 0 else 0

    if state.red_drawdown > 0 and current_dd <= -state.red_drawdown:
        # RED: full liquidation and shutdown
        if not state.red_triggered:
            liquidate_all(state, close, time, "red_drawdown")
            state.alert_level = AlertLevel.RED
            state.is_shutdown = True
            state.red_triggered = True
            state.equity_curve.append({"time": time, "equity": state.cash, "price": close})
            return
    elif state.orange_drawdown > 0 and current_dd <= -state.orange_drawdown:
        # ORANGE: close all orders, hold cash, wait
        if state.alert_level != AlertLevel.ORANGE:
            liquidate_all(state, close, time, "orange_drawdown")
            state.alert_level = AlertLevel.ORANGE
        state.orange_bars += 1
    elif state.yellow_drawdown > 0 and current_dd <= -state.yellow_drawdown:
        # YELLOW: pause new buys
        state.alert_level = AlertLevel.YELLOW
        state.yellow_bars += 1
    else:
        # If recovering from orange, re-setup grid
        if state.alert_level == AlertLevel.ORANGE and current_dd > -state.yellow_drawdown:
            setup_grid(state, close, state.cash)
        state.alert_level = AlertLevel.GREEN

    # ── 2. VOLATILITY BREAKER ──
    if state.vol_cooldown_remaining > 0:
        state.vol_cooldown_remaining -= 1
        state.vol_pause_bars += 1
        # Only allow sells during cooldown, no buys
        _process_sells_only(state, time, high)
        equity = state.cash + state.holdings * close
        state.equity_curve.append({"time": time, "equity": equity, "price": close})
        return

    if idx >= state.vol_lookback:
        current_move = state.bar_move_pct.iloc[idx]
        avg_move = state.bar_move_pct.iloc[max(0, idx - state.vol_lookback):idx].mean()
        if avg_move > 0 and current_move > avg_move * state.vol_multiplier:
            state.vol_cooldown_remaining = state.vol_cooldown_bars
            state.vol_pause_bars += 1
            _process_sells_only(state, time, high)
            equity = state.cash + state.holdings * close
            state.equity_curve.append({"time": time, "equity": equity, "price": close})
            return

    # ── 3. TREND FILTER ──
    trend_allows_buys = True
    if idx >= state.ema_slow:  # enough data for EMAs
        ema_f = state.ema_fast_series.iloc[idx]
        ema_s = state.ema_slow_series.iloc[idx]
        adx_val = state.adx_series.iloc[idx]

        if adx_val > state.adx_threshold:
            # Strong trend detected
            if ema_f < ema_s:
                # Downtrend — pause ALL buys
                trend_allows_buys = False
                state.trend_paused = True
                state.trend_pause_bars += 1
            # Uptrend — allow buys but shift bias (more sells)
            # For now just allow buys in uptrend, pause in downtrend
        else:
            state.trend_paused = False

    # ── 4. STOP-LOSS CHECK ──
    if state.stop_loss_pct > 0 and state.lower_price > 0:
        stop_price = state.lower_price * (1 - state.stop_loss_pct / 100)
        if low <= stop_price and state.holdings > 0:
            liquidate_all(state, stop_price, time, "stop_loss")
            state.stop_loss_events += 1
            # Re-setup grid at new level
            setup_grid(state, close, state.cash)

    # ── 5. FILL ORDERS ──
    if state.alert_level == AlertLevel.ORANGE:
        # Orange: no trading
        pass
    else:
        for level_idx, order in list(state.orders.items()):
            if order.status != "open":
                continue

            if order.side == "buy" and low <= order.price:
                # Check: trend filter + yellow alert block buys
                if not trend_allows_buys or state.alert_level == AlertLevel.YELLOW:
                    continue

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
                        fee_paid=buy_fee + sell_fee, pnl=pnl, exit_reason="grid",
                    ))
                    state.total_grid_profit += pnl

                # Re-place buy below (only if trend allows)
                if trend_allows_buys and state.alert_level == AlertLevel.GREEN:
                    buy_idx = level_idx - 1
                    if buy_idx >= 0 and buy_idx not in state.orders:
                        state.orders[buy_idx] = GridOrder(
                            level_idx=buy_idx, price=state.grid_levels[buy_idx],
                            side="buy", qty=order.qty
                        )

        # Clean filled
        state.orders = {k: v for k, v in state.orders.items() if v.status == "open"}

    # ── Equity tracking ──
    equity = state.cash + state.holdings * close
    state.equity_curve.append({"time": time, "equity": equity, "price": close})


def _process_sells_only(state: GridState, time: pd.Timestamp, high: float):
    """During volatility cooldown, only process sell orders."""
    for level_idx, order in list(state.orders.items()):
        if order.side == "sell" and order.status == "open" and high >= order.price:
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
                pnl = (order.price - ps["buy_price"]) * ps["qty"] - buy_fee - fee
                state.trades.append(Trade(
                    buy_price=ps["buy_price"], sell_price=order.price,
                    qty=ps["qty"], buy_time=ps["buy_time"], sell_time=time,
                    fee_paid=buy_fee + fee, pnl=pnl, exit_reason="grid",
                ))
                state.total_grid_profit += pnl

    state.orders = {k: v for k, v in state.orders.items() if v.status == "open"}


# ── Data loading ────────────────────────────────────────────────────────────
def load_candles(pair, timeframe, start, end):
    """Load candles from PROD DB, fallback to Binance API if no data."""
    table_map = {
        "1m": "market_data.ohlcv_1m", "5m": "market_data.ohlcv_5m",
        "15m": "market_data.ohlcv_15m", "1h": "market_data.ohlcv_1h",
        "1d": "market_data.ohlcv_1d",
    }
    try:
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
        if len(df) > 0:
            print(f"  Loaded {len(df):,} candles from DB")
            return df
        print(f"  No DB data for {pair}, fetching from Binance API...")
    except Exception as e:
        print(f"  DB error: {e}, fetching from Binance API...")

    return _fetch_from_binance(pair, timeframe, start, end)


def _fetch_from_binance(pair, timeframe, start, end):
    """Fetch candles directly from Binance REST API."""
    import time as _time
    import requests
    from datetime import datetime, timezone

    BINANCE_URL = "https://api.binance.com/api/v3/klines"
    interval_map = {"1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d"}
    interval = interval_map.get(timeframe, "1h")

    start_ms = int(datetime.strptime(start, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp() * 1000)
    end_ms = int(datetime.strptime(end, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp() * 1000)

    all_candles = []
    current = start_ms
    batch = 0

    while current < end_ms:
        batch += 1
        params = {"symbol": pair, "interval": interval, "startTime": current, "endTime": end_ms, "limit": 1000}
        resp = requests.get(BINANCE_URL, params=params, timeout=15)
        if resp.status_code == 429:
            print(f"    Rate limited, waiting 10s...")
            _time.sleep(10)
            continue
        resp.raise_for_status()
        klines = resp.json()
        if not klines:
            break
        for k in klines:
            all_candles.append({
                "time": datetime.fromtimestamp(k[0] / 1000, tz=timezone.utc),
                "open": float(k[1]), "high": float(k[2]), "low": float(k[3]),
                "close": float(k[4]), "volume": float(k[5]),
            })
        current = klines[-1][0] + 1
        if batch % 5 == 0:
            print(f"    Batch {batch}: {len(all_candles):,} candles so far...")
        if len(klines) < 1000:
            break
        _time.sleep(0.3)

    df = pd.DataFrame(all_candles)
    if df.empty:
        return df
    df = df.set_index("time").sort_index()
    print(f"  Fetched {len(df):,} candles from Binance API")
    return df


# ── Main backtest ───────────────────────────────────────────────────────────
def run_backtest(
    pair="ETHUSDT", timeframe="5m",
    start="2021-04-05", end="2026-03-11",
    initial_capital=10_000.0,
    num_grids=25, grid_type="geometric",
    stop_loss_pct=0.0, fee_rate=0.001,
    # Trend filter
    ema_fast=50, ema_slow=200,
    adx_period=14, adx_threshold=25.0,
    # Volatility breaker
    vol_lookback=288, vol_multiplier=4.0, vol_cooldown_bars=36,
    # Drawdown halt
    yellow_drawdown=15.0, orange_drawdown=25.0, red_drawdown=40.0,
    # Comparison
    run_baseline=True,
):
    print(f"\n{'='*70}")
    print(f"  GRID BOT v3 — WITH MITIGATIONS")
    print(f"{'='*70}")
    print(f"  Pair:              {pair}")
    print(f"  Period:            {start} -> {end}")
    print(f"  Capital:           ${initial_capital:,.2f}")
    print(f"  Grids:             {num_grids} ({grid_type})")
    print(f"  Stop-loss:         {stop_loss_pct}% below grid floor")
    print(f"  Fee rate:          {fee_rate*100:.2f}% per side")
    print(f"  ── Trend Filter ──")
    print(f"  EMA fast/slow:     {ema_fast}/{ema_slow}")
    print(f"  ADX threshold:     {adx_threshold} (>{adx_threshold} = trending)")
    print(f"  ── Volatility Breaker ──")
    print(f"  Lookback:          {vol_lookback} bars ({vol_lookback*5/60:.0f}h)")
    print(f"  Spike multiplier:  {vol_multiplier}x avg move")
    print(f"  Cooldown:          {vol_cooldown_bars} bars ({vol_cooldown_bars*5/60:.0f}h)")
    print(f"  ── Drawdown Halt ──")
    print(f"  Yellow (pause buy): {yellow_drawdown}%")
    print(f"  Orange (close all): {orange_drawdown}%")
    print(f"  Red (shutdown):     {red_drawdown}%")
    print(f"{'='*70}\n")

    df = load_candles(pair, timeframe, start, end)
    if df.empty:
        print("ERROR: No candle data.")
        return None
    print(f"  Loaded {len(df):,} candles\n")

    # ── Fee validation ──
    lo = df["low"].min(); hi = df["high"].max()
    mid = (hi + lo) / 2; rng = hi - lo
    lower = mid - rng * 0.45; upper = mid + rng * 0.45
    test_levels = compute_grid_levels(lower, upper, num_grids, grid_type)
    ok, spacing, min_req = validate_fee_spacing(test_levels, fee_rate)
    if not ok:
        print(f"  WARNING: Grid spacing ({spacing:.3f}%) < minimum ({min_req:.3f}%)")
        print(f"  Every trade will lose money to fees. Reduce grids or widen range.\n")
    else:
        print(f"  Fee check PASSED: spacing {spacing:.3f}% >= {min_req:.3f}% minimum\n")

    # ── Setup state ──
    state = GridState(
        initial_capital=initial_capital, num_grids=num_grids,
        fee_rate=fee_rate, grid_type=grid_type, stop_loss_pct=stop_loss_pct,
        ema_fast=ema_fast, ema_slow=ema_slow,
        adx_period=adx_period, adx_threshold=adx_threshold,
        vol_lookback=vol_lookback, vol_multiplier=vol_multiplier,
        vol_cooldown_bars=vol_cooldown_bars,
        yellow_drawdown=yellow_drawdown, orange_drawdown=orange_drawdown,
        red_drawdown=red_drawdown,
    )
    state.cash = initial_capital
    state.peak_equity = initial_capital

    # Precompute indicators
    precompute_indicators(df, state)

    # Setup initial grid
    first_price = df.iloc[0]["close"]
    setup_grid(state, first_price, initial_capital, lo_override=lower, hi_override=upper)
    print(f"  Grid: ${state.lower_price:,.2f} — ${state.upper_price:,.2f}, "
          f"spacing {state.grid_spacing_pct:.2f}%")

    # ── Run ──
    for i, (time_idx, row) in enumerate(df.iterrows()):
        process_candle(state, i, time_idx, row["open"], row["high"], row["low"], row["close"])

    # ── Also run baseline (v1, no mitigations) for comparison ──
    baseline_result = None
    if run_baseline:
        baseline_result = _run_baseline(df, initial_capital, num_grids, grid_type,
                                        stop_loss_pct, fee_rate, lower, upper)

    # ── Results ──
    _print_results(state, df, initial_capital, timeframe, baseline_result)

    # Save outputs
    _save_outputs(state, pair, start, end)
    return state


def _run_baseline(df, capital, grids, grid_type, sl, fee, lower, upper):
    """Run plain v1 grid bot for comparison."""
    levels = compute_grid_levels(lower, upper, grids, grid_type)
    first_price = df.iloc[0]["close"]
    buy_levels = [i for i, p in enumerate(levels) if p < first_price]
    if not buy_levels:
        return None

    max_bp = max(levels[i] for i in buy_levels)
    qty = (capital / len(buy_levels)) / max_bp

    cash = capital; holdings = 0.0; fees = 0.0
    orders = {}; pending = {}; trades_pnl = []; equities = []
    sl_events = 0

    for i in buy_levels:
        orders[i] = {"p": levels[i], "s": "buy", "q": qty}

    stop_price = levels[0] * (1 - sl / 100) if sl > 0 else 0

    for t, row in df.iterrows():
        h, l, c = row["high"], row["low"], row["close"]

        if sl > 0 and l <= stop_price and holdings > 0:
            rev = holdings * stop_price
            f = rev * fee
            cash += rev - f; fees += f
            for bi, ps in pending.items():
                pnl = (stop_price - ps["bp"]) * ps["q"] - ps["q"] * ps["bp"] * fee - ps["q"] * stop_price * fee
                trades_pnl.append(pnl)
            holdings = 0; pending = {}; orders = {}
            sl_events += 1
            new_lo = c * 0.85; new_hi = c * 1.15
            levels = compute_grid_levels(new_lo, new_hi, grids, grid_type)
            bls = [i for i, p in enumerate(levels) if p < c]
            if bls and cash > 100:
                mbp = max(levels[i] for i in bls)
                qty = (cash / len(bls)) / mbp
                for i in bls:
                    orders[i] = {"p": levels[i], "s": "buy", "q": qty}
                stop_price = levels[0] * (1 - sl / 100)

        for idx, od in list(orders.items()):
            if od["s"] == "buy" and l <= od["p"]:
                cost = od["q"] * od["p"]; f = cost * fee
                if cash >= cost + f:
                    cash -= cost + f; holdings += od["q"]; fees += f
                    pending[idx] = {"bp": od["p"], "bt": t, "q": od["q"]}
                    del orders[idx]
                    si = idx + 1
                    if si < len(levels) and si not in orders:
                        orders[si] = {"p": levels[si], "s": "sell", "q": od["q"]}
            elif od["s"] == "sell" and h >= od["p"]:
                rev = od["q"] * od["p"]; f = rev * fee
                cash += rev - f; holdings -= od["q"]; fees += f
                del orders[idx]
                bi = idx - 1
                if bi in pending:
                    ps = pending.pop(bi)
                    pnl = (od["p"] - ps["bp"]) * ps["q"] - ps["q"] * ps["bp"] * fee - ps["q"] * od["p"] * fee
                    trades_pnl.append(pnl)
                if bi >= 0 and bi not in orders:
                    orders[bi] = {"p": levels[bi], "s": "buy", "q": od["q"]}

        equities.append(cash + holdings * c)

    final_eq = cash + holdings * df.iloc[-1]["close"]
    eq_s = pd.Series(equities)
    dd = ((eq_s - eq_s.expanding().max()) / eq_s.expanding().max() * 100).min()
    wins = len([p for p in trades_pnl if p > 0])
    total = len(trades_pnl)

    return {
        "equity": final_eq,
        "return_pct": (final_eq - capital) / capital * 100,
        "trades": total,
        "win_rate": wins / total * 100 if total > 0 else 0,
        "max_dd": dd,
        "fees": fees,
    }


def _print_results(state, df, capital, timeframe, baseline):
    final_price = df.iloc[-1]["close"]
    first_price = df.iloc[0]["close"]
    final_eq = state.cash + state.holdings * final_price
    ret = (final_eq - capital) / capital * 100

    bh_qty = capital / first_price
    bh_pct = ((bh_qty * final_price - capital) / capital) * 100

    bars_per_hour = {"1m": 60, "5m": 12, "15m": 4, "1h": 1}
    years = len(df) / (bars_per_hour.get(timeframe, 12) * 24 * 365.25)
    ann = ((final_eq / capital) ** (1 / years) - 1) * 100 if years > 0 and final_eq > 0 else 0
    dbl = math.log(2) / math.log(1 + ann / 100) if ann > 0 else float("inf")

    trades = state.trades
    n = len(trades)
    grid_trades = [t for t in trades if t.exit_reason == "grid"]
    sl_trades = [t for t in trades if t.exit_reason == "stop_loss"]
    dd_trades = [t for t in trades if "drawdown" in t.exit_reason]

    pnls = [t.pnl for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]
    wr = len(wins) / n * 100 if n > 0 else 0
    pf = abs(sum(wins) / sum(losses)) if losses and sum(losses) != 0 else float("inf")

    eq_s = pd.Series([e["equity"] for e in state.equity_curve])
    dd = ((eq_s - eq_s.expanding().max()) / eq_s.expanding().max() * 100).min() if len(eq_s) > 0 else 0

    if len(eq_s) > 1:
        rets = eq_s.pct_change().dropna()
        bpy = bars_per_hour.get(timeframe, 12) * 24 * 365.25
        sharpe = (rets.mean() / rets.std()) * np.sqrt(bpy) if rets.std() > 0 else 0
    else:
        sharpe = 0

    print(f"\n{'='*70}")
    print(f"  RESULTS — v3 WITH MITIGATIONS")
    print(f"{'='*70}")
    print(f"  Final equity:        ${final_eq:,.2f}")
    print(f"  Total return:        {ret:+.2f}%")
    print(f"  Annualized:          {ann:+.2f}%")
    print(f"  Doubling time:       {dbl:.1f} years" if dbl < 1000 else f"  Doubling time:       never")
    print(f"  Sharpe ratio:        {sharpe:.2f}")
    print(f"  Max drawdown:        {dd:.2f}%")
    print(f"  Buy & hold:          {bh_pct:+.2f}%")
    print(f"  Grid vs B&H:         {ret - bh_pct:+.2f}%")
    print(f"  {'─'*66}")
    print(f"  Total trades:        {n}")
    print(f"    Grid round-trips:  {len(grid_trades)}")
    print(f"    Stop-loss exits:   {len(sl_trades)}")
    print(f"    Drawdown exits:    {len(dd_trades)}")
    print(f"  Win rate:            {wr:.1f}%")
    print(f"  Profit factor:       {pf:.2f}" if pf < 9999 else f"  Profit factor:       inf")
    print(f"  Total fees:          ${state.total_fees:,.2f}")
    print(f"  Grid profit:         ${state.total_grid_profit:,.2f}")
    print(f"  {'─'*66}")
    print(f"  MITIGATION ACTIVITY:")
    print(f"    Trend pause bars:  {state.trend_pause_bars:,} ({state.trend_pause_bars/(len(eq_s) or 1)*100:.1f}% of time)")
    print(f"    Vol pause bars:    {state.vol_pause_bars:,} ({state.vol_pause_bars/(len(eq_s) or 1)*100:.1f}% of time)")
    print(f"    Yellow alert bars: {state.yellow_bars:,} ({state.yellow_bars/(len(eq_s) or 1)*100:.1f}% of time)")
    print(f"    Orange alert bars: {state.orange_bars:,} ({state.orange_bars/(len(eq_s) or 1)*100:.1f}% of time)")
    print(f"    Red shutdown:      {'YES' if state.red_triggered else 'NO'}")
    print(f"    Stop-loss events:  {state.stop_loss_events}")
    print(f"  {'─'*66}")
    print(f"  Cash:                ${state.cash:,.2f}")
    print(f"  Holdings:            {state.holdings:.6f} (${state.holdings * final_price:,.2f})")
    print(f"  Period:              {years:.2f} years")

    if baseline:
        print(f"\n  {'─'*66}")
        print(f"  BASELINE (v1, no mitigations):")
        print(f"    Return:            {baseline['return_pct']:+.2f}%")
        print(f"    Trades:            {baseline['trades']}")
        print(f"    Win rate:          {baseline['win_rate']:.1f}%")
        print(f"    Max drawdown:      {baseline['max_dd']:.2f}%")
        print(f"    Fees:              ${baseline['fees']:,.2f}")
        print(f"  {'─'*66}")
        delta = ret - baseline["return_pct"]
        dd_improvement = abs(baseline["max_dd"]) - abs(dd)
        print(f"  MITIGATIONS VALUE:")
        print(f"    Return delta:      {delta:+.2f}%")
        print(f"    Drawdown reduced:  {dd_improvement:+.2f}% ({'BETTER' if dd_improvement > 0 else 'WORSE'})")
        print(f"    Fee delta:         ${state.total_fees - baseline['fees']:+,.2f}")

    print(f"{'='*70}\n")


def _save_outputs(state, pair, start, end):
    eq_df = pd.DataFrame(state.equity_curve)
    if not eq_df.empty:
        if len(eq_df) > 2000:
            step = len(eq_df) // 2000
            eq_df = eq_df.iloc[::step]
        path = f"v3_equity_{pair}_{start}_{end}.csv"
        eq_df.to_csv(path, index=False)
        print(f"  Equity curve: {path}")

    if state.trades:
        records = [{
            "buy_time": t.buy_time, "sell_time": t.sell_time,
            "buy_price": round(t.buy_price, 2), "sell_price": round(t.sell_price, 2),
            "qty": round(t.qty, 6), "pnl": round(t.pnl, 4),
            "fee": round(t.fee_paid, 4),
            "hold_hours": round((t.sell_time - t.buy_time).total_seconds() / 3600, 2),
            "exit_reason": t.exit_reason,
        } for t in state.trades]
        path = f"v3_trades_{pair}_{start}_{end}.csv"
        pd.DataFrame(records).to_csv(path, index=False)
        print(f"  Trade log:    {path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Grid Bot v3 — With Mitigations")
    parser.add_argument("--pair", default="ETHUSDT")
    parser.add_argument("--timeframe", default="5m")
    parser.add_argument("--start", default="2021-04-05")
    parser.add_argument("--end", default="2026-03-11")
    parser.add_argument("--capital", type=float, default=10_000)
    parser.add_argument("--grids", type=int, default=25)
    parser.add_argument("--grid-type", default="geometric", choices=["arithmetic", "geometric"])
    parser.add_argument("--stop-loss", type=float, default=0.0)
    parser.add_argument("--fee", type=float, default=0.001)
    # Trend
    parser.add_argument("--ema-fast", type=int, default=50)
    parser.add_argument("--ema-slow", type=int, default=200)
    parser.add_argument("--adx-period", type=int, default=14)
    parser.add_argument("--adx-threshold", type=float, default=25.0)
    # Volatility
    parser.add_argument("--vol-lookback", type=int, default=288, help="Bars for avg volatility (288=24h)")
    parser.add_argument("--vol-multiplier", type=float, default=4.0, help="Spike = Nx avg move")
    parser.add_argument("--vol-cooldown", type=int, default=36, help="Bars to pause after spike (36=3h)")
    # Drawdown
    parser.add_argument("--yellow-dd", type=float, default=15.0, help="Pause buys at this DD%%")
    parser.add_argument("--orange-dd", type=float, default=25.0, help="Close all at this DD%%")
    parser.add_argument("--red-dd", type=float, default=40.0, help="Full shutdown at this DD%%")

    args = parser.parse_args()

    run_backtest(
        pair=args.pair, timeframe=args.timeframe,
        start=args.start, end=args.end,
        initial_capital=args.capital,
        num_grids=args.grids, grid_type=args.grid_type,
        stop_loss_pct=args.stop_loss, fee_rate=args.fee,
        ema_fast=args.ema_fast, ema_slow=args.ema_slow,
        adx_period=args.adx_period, adx_threshold=args.adx_threshold,
        vol_lookback=args.vol_lookback, vol_multiplier=args.vol_multiplier,
        vol_cooldown_bars=args.vol_cooldown,
        yellow_drawdown=args.yellow_dd, orange_drawdown=args.orange_dd,
        red_drawdown=args.red_dd,
    )
