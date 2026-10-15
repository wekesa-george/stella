"""VectorBT backtest runner — loads data, generates signals, runs portfolio simulation."""

import time
import numpy as np
import pandas as pd
import vectorbt as vbt

from app.data_loader import load_ohlcv
from app.strategy_adapter import generate_signals
from app.models import BacktestRequest, BacktestResponse


def run_backtest(request: BacktestRequest) -> BacktestResponse:
    """
    Execute a full backtest:
    1. Load OHLCV data from DB
    2. Generate entry/exit signals via strategy adapter
    3. Run VectorBT portfolio simulation
    4. Calculate all metrics
    5. Return structured response
    """
    start_time = time.time()

    try:
        # 1. Load data
        df = load_ohlcv(
            exchange=request.exchange_code,
            pair=request.trading_pair,
            timeframe=request.timeframe,
            start=request.start_date,
            end=request.end_date,
            db_url=request.db_url,
        )

        candles_processed = len(df)

        # 2. Extract strategy type and config
        strategy_type = request.strategy_type
        config = request.config_snapshot.get("config", {})
        user_overrides = request.config_snapshot.get("user_overrides", {})
        merged_config = {**config, **user_overrides}

        # 3. Generate signals
        entries, exits = generate_signals(df, strategy_type, merged_config)

        # 4. Run VectorBT portfolio
        close = df["close"]

        portfolio = vbt.Portfolio.from_signals(
            close=close,
            entries=entries,
            exits=exits,
            init_cash=request.initial_capital_usd,
            fees=merged_config.get("fee_pct", 0.001),  # 0.1% default
            slippage=merged_config.get("slippage_pct", 0.0005),  # 0.05% default
            freq=_timeframe_to_freq(request.timeframe),
        )

        # 5. Extract metrics
        stats = portfolio.stats()
        trades = portfolio.trades.records_readable if len(portfolio.trades.records) > 0 else pd.DataFrame()

        execution_time_ms = int((time.time() - start_time) * 1000)

        return _build_response(
            request=request,
            portfolio=portfolio,
            stats=stats,
            trades=trades,
            close=close,
            candles_processed=candles_processed,
            execution_time_ms=execution_time_ms,
        )

    except Exception as e:
        execution_time_ms = int((time.time() - start_time) * 1000)
        return BacktestResponse(
            backtest_id=request.backtest_id,
            status="failed",
            error_message=str(e),
            execution_time_ms=execution_time_ms,
        )


def _build_response(
    request: BacktestRequest,
    portfolio,
    stats: pd.Series,
    trades: pd.DataFrame,
    close: pd.Series,
    candles_processed: int,
    execution_time_ms: int,
) -> BacktestResponse:
    """Build structured response from VectorBT portfolio results."""

    final_value = float(portfolio.final_value())
    initial = request.initial_capital_usd
    total_return_pct = ((final_value - initial) / initial) * 100

    # Trade-level metrics
    total_trades_count = int(stats.get("Total Trades", 0))

    if total_trades_count > 0 and not trades.empty:
        pnl_col = _find_column(trades, ["PnL", "pnl"])
        return_col = _find_column(trades, ["Return", "return", "Return [%]"])

        if pnl_col:
            pnl_series = trades[pnl_col].astype(float)
            winning = pnl_series > 0
            losing = pnl_series < 0
            winning_trades = int(winning.sum())
            losing_trades = int(losing.sum())
            win_rate = winning_trades / total_trades_count if total_trades_count > 0 else 0
            avg_win_usd = float(pnl_series[winning].mean()) if winning.any() else 0
            avg_loss_usd = float(pnl_series[losing].mean()) if losing.any() else 0
            largest_win = float(pnl_series.max()) if not pnl_series.empty else 0
            largest_loss = float(pnl_series.min()) if not pnl_series.empty else 0
            gross_wins = float(pnl_series[winning].sum()) if winning.any() else 0
            gross_losses = abs(float(pnl_series[losing].sum())) if losing.any() else 0
            profit_factor = gross_wins / gross_losses if gross_losses > 0 else float("inf")
        else:
            winning_trades = losing_trades = 0
            win_rate = avg_win_usd = avg_loss_usd = 0
            largest_win = largest_loss = 0
            profit_factor = 0

        if return_col:
            return_series = trades[return_col].astype(float)
            avg_trade_return = float(return_series.mean()) * 100
            avg_win_pct = float(return_series[return_series > 0].mean()) * 100 if (return_series > 0).any() else 0
            avg_loss_pct = float(return_series[return_series < 0].mean()) * 100 if (return_series < 0).any() else 0
        else:
            avg_trade_return = avg_win_pct = avg_loss_pct = 0

        # Duration
        dur_col = _find_column(trades, ["Duration", "duration"])
        if dur_col:
            try:
                durations = pd.to_timedelta(trades[dur_col])
                avg_hold_sec = int(durations.mean().total_seconds())
            except Exception:
                avg_hold_sec = 0
        else:
            avg_hold_sec = 0
    else:
        winning_trades = losing_trades = 0
        win_rate = profit_factor = 0
        avg_trade_return = avg_win_pct = avg_loss_pct = 0
        largest_win = largest_loss = avg_win_usd = avg_loss_usd = 0
        avg_hold_sec = 0

    # Portfolio-level metrics
    max_dd = _safe_float(stats.get("Max Drawdown [%]", 0))
    sharpe = _safe_float(stats.get("Sharpe Ratio", 0))
    sortino = _safe_float(stats.get("Sortino Ratio", 0))
    calmar = _safe_float(stats.get("Calmar Ratio", 0))

    # Equity curve (subsample if too large)
    equity = portfolio.value()
    equity_curve = _build_equity_curve(equity, max_points=500)

    # Trade log
    trade_log = _build_trade_log(trades, max_trades=1000)

    return BacktestResponse(
        backtest_id=request.backtest_id,
        status="completed",
        final_capital_usd=round(final_value, 4),
        total_return_pct=round(total_return_pct, 4),
        max_drawdown_pct=round(abs(max_dd), 4),
        sharpe_ratio=round(sharpe, 4),
        sortino_ratio=round(sortino, 4),
        calmar_ratio=round(calmar, 4),
        win_rate=round(win_rate, 4),
        profit_factor=round(min(profit_factor, 9999.9999), 4),
        total_trades=total_trades_count,
        winning_trades=winning_trades,
        losing_trades=losing_trades,
        avg_trade_return_pct=round(avg_trade_return, 4),
        avg_win_pct=round(avg_win_pct, 4),
        avg_loss_pct=round(avg_loss_pct, 4),
        largest_win_usd=round(largest_win, 4),
        largest_loss_usd=round(largest_loss, 4),
        avg_hold_duration_sec=avg_hold_sec,
        execution_time_ms=execution_time_ms,
        candles_processed=candles_processed,
        equity_curve=equity_curve,
        trade_log=trade_log,
    )


def _build_equity_curve(equity: pd.Series, max_points: int = 500) -> list[dict]:
    """Build equity curve, subsampling if needed."""
    if len(equity) > max_points:
        step = len(equity) // max_points
        equity = equity.iloc[::step]

    return [
        {"time": str(t), "equity": round(float(v), 2)}
        for t, v in equity.items()
    ]


def _build_trade_log(trades: pd.DataFrame, max_trades: int = 1000) -> list[dict]:
    """Build trade log from VectorBT trades DataFrame."""
    if trades.empty:
        return []

    log = []
    for _, row in trades.head(max_trades).iterrows():
        entry = {}
        for col in row.index:
            val = row[col]
            if pd.isna(val):
                entry[col] = None
            elif isinstance(val, (np.integer,)):
                entry[col] = int(val)
            elif isinstance(val, (np.floating,)):
                entry[col] = round(float(val), 6)
            elif isinstance(val, pd.Timestamp):
                entry[col] = str(val)
            else:
                entry[col] = str(val)
        log.append(entry)

    return log


def _safe_float(val, default: float = 0.0) -> float:
    """Safely convert to float, handling NaN/Inf."""
    try:
        f = float(val)
        if np.isnan(f) or np.isinf(f):
            return default
        return f
    except (TypeError, ValueError):
        return default


def _find_column(df: pd.DataFrame, candidates: list[str]) -> str | None:
    """Find first matching column name from candidates."""
    for c in candidates:
        if c in df.columns:
            return c
    return None


def _timeframe_to_freq(timeframe: str) -> str:
    """Convert Stella timeframe to pandas frequency string."""
    mapping = {
        "1m": "1min",
        "5m": "5min",
        "15m": "15min",
        "30m": "30min",
        "1h": "1h",
        "4h": "4h",
        "1d": "1D",
    }
    return mapping.get(timeframe, "1h")
