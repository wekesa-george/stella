"""Map Stella strategy types to VectorBT signal logic."""

import pandas as pd
import numpy as np


def generate_signals(df: pd.DataFrame, strategy_type: str, config: dict) -> tuple[pd.Series, pd.Series]:
    """
    Generate entry/exit signals for a given strategy type.

    Returns (entries, exits) as boolean pd.Series aligned to df index.
    """
    adapter = STRATEGY_MAP.get(strategy_type)
    if adapter is None:
        raise ValueError(f"Unknown strategy type: {strategy_type}")

    return adapter(df, config)


# ============================================================================
# STRATEGY IMPLEMENTATIONS
# ============================================================================

def _momentum_signals(df: pd.DataFrame, config: dict) -> tuple[pd.Series, pd.Series]:
    """RSI + MACD crossover momentum strategy."""
    close = df["close"]

    # RSI
    rsi_period = config.get("rsi_period", 14)
    rsi_oversold = config.get("rsi_oversold", 30)
    rsi_overbought = config.get("rsi_overbought", 70)

    delta = close.diff()
    gain = delta.where(delta > 0, 0.0).rolling(window=rsi_period).mean()
    loss = (-delta.where(delta < 0, 0.0)).rolling(window=rsi_period).mean()
    rs = gain / loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))

    # MACD
    fast = config.get("macd_fast", 12)
    slow = config.get("macd_slow", 26)
    signal_period = config.get("macd_signal", 9)

    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal_period, adjust=False).mean()

    # Entry: RSI below oversold AND MACD crosses above signal
    macd_cross_up = (macd_line > signal_line) & (macd_line.shift(1) <= signal_line.shift(1))
    entries = macd_cross_up & (rsi < rsi_oversold)

    # Exit: RSI above overbought OR MACD crosses below signal
    macd_cross_down = (macd_line < signal_line) & (macd_line.shift(1) >= signal_line.shift(1))
    exits = macd_cross_down | (rsi > rsi_overbought)

    return entries.fillna(False), exits.fillna(False)


def _grid_signals(df: pd.DataFrame, config: dict) -> tuple[pd.Series, pd.Series]:
    """Grid trading: buy at lower grid levels, sell at upper grid levels."""
    close = df["close"]

    num_grids = config.get("num_grids", 10)
    lookback = config.get("lookback_period", 100)

    rolling_high = close.rolling(window=lookback, min_periods=1).max()
    rolling_low = close.rolling(window=lookback, min_periods=1).min()
    grid_size = (rolling_high - rolling_low) / num_grids

    # Buy when price drops to lower third of grid range
    lower_threshold = rolling_low + grid_size * (num_grids * 0.3)
    upper_threshold = rolling_low + grid_size * (num_grids * 0.7)

    entries = (close <= lower_threshold) & (close.shift(1) > lower_threshold.shift(1))
    exits = (close >= upper_threshold) & (close.shift(1) < upper_threshold.shift(1))

    return entries.fillna(False), exits.fillna(False)


def _dca_signals(df: pd.DataFrame, config: dict) -> tuple[pd.Series, pd.Series]:
    """Dollar-cost averaging: fixed-interval entries, exit on target return."""
    close = df["close"]

    buy_interval = config.get("buy_interval_bars", 24)  # e.g., every 24 bars
    take_profit_pct = config.get("take_profit_pct", 5.0)

    # Entry: every N bars
    entries = pd.Series(False, index=df.index)
    entries.iloc[::buy_interval] = True

    # Exit: when cumulative return exceeds target
    # Simple approach: track rolling return from first entry
    rolling_return = close.pct_change(buy_interval) * 100
    exits = rolling_return > take_profit_pct

    return entries.fillna(False), exits.fillna(False)


def _mean_reversion_signals(df: pd.DataFrame, config: dict) -> tuple[pd.Series, pd.Series]:
    """Bollinger Band mean reversion strategy."""
    close = df["close"]

    bb_period = config.get("bb_period", 20)
    bb_std = config.get("bb_std", 2.0)

    sma = close.rolling(window=bb_period).mean()
    std = close.rolling(window=bb_period).std()
    upper_band = sma + bb_std * std
    lower_band = sma - bb_std * std

    # Entry: price touches lower band
    entries = (close <= lower_band) & (close.shift(1) > lower_band.shift(1))

    # Exit: price touches upper band or returns to SMA
    exits = (close >= upper_band) | ((close >= sma) & (close.shift(1) < sma.shift(1)))

    return entries.fillna(False), exits.fillna(False)


def _trend_following_signals(df: pd.DataFrame, config: dict) -> tuple[pd.Series, pd.Series]:
    """SMA/EMA crossover trend following strategy."""
    close = df["close"]

    fast_period = config.get("fast_period", 20)
    slow_period = config.get("slow_period", 50)
    use_ema = config.get("use_ema", True)

    if use_ema:
        fast_ma = close.ewm(span=fast_period, adjust=False).mean()
        slow_ma = close.ewm(span=slow_period, adjust=False).mean()
    else:
        fast_ma = close.rolling(window=fast_period).mean()
        slow_ma = close.rolling(window=slow_period).mean()

    # Entry: fast MA crosses above slow MA (golden cross)
    entries = (fast_ma > slow_ma) & (fast_ma.shift(1) <= slow_ma.shift(1))

    # Exit: fast MA crosses below slow MA (death cross)
    exits = (fast_ma < slow_ma) & (fast_ma.shift(1) >= slow_ma.shift(1))

    return entries.fillna(False), exits.fillna(False)


# ============================================================================
# STRATEGY MAP
# ============================================================================

STRATEGY_MAP = {
    "core_momentum": _momentum_signals,
    "core_grid": _grid_signals,
    "core_dca": _dca_signals,
    "core_mean_reversion": _mean_reversion_signals,
    "core_trend_following": _trend_following_signals,
    # Custom strategies use momentum as fallback
    "custom_rule_based": _momentum_signals,
    "custom_config": _momentum_signals,
    # Arbitrage not suitable for single-asset backtest
    "core_arbitrage": _momentum_signals,
}
