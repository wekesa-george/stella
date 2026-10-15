"""Pydantic request/response models for the VectorBT worker."""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class BacktestRequest(BaseModel):
    """Request to run a backtest."""
    backtest_id: str
    strategy_type: str
    trading_pair: str
    exchange_code: str = "binance"
    timeframe: str = "1h"
    start_date: datetime
    end_date: datetime
    initial_capital_usd: float = 10000.0
    config_snapshot: dict = Field(default_factory=dict)

    # DB connection for loading OHLCV data
    db_url: Optional[str] = None


class TradeEntry(BaseModel):
    """Single trade in the trade log."""
    entry_time: str
    exit_time: str
    side: str
    entry_price: float
    exit_price: float
    size: float
    pnl: float
    return_pct: float
    duration_sec: int


class EquityPoint(BaseModel):
    """Single point on the equity curve."""
    time: str
    equity: float


class BacktestResponse(BaseModel):
    """Response with backtest results."""
    backtest_id: str
    status: str  # "completed" or "failed"

    # Metrics
    final_capital_usd: Optional[float] = None
    total_return_pct: Optional[float] = None
    max_drawdown_pct: Optional[float] = None
    sharpe_ratio: Optional[float] = None
    sortino_ratio: Optional[float] = None
    calmar_ratio: Optional[float] = None
    win_rate: Optional[float] = None
    profit_factor: Optional[float] = None
    total_trades: Optional[int] = None
    winning_trades: Optional[int] = None
    losing_trades: Optional[int] = None
    avg_trade_return_pct: Optional[float] = None
    avg_win_pct: Optional[float] = None
    avg_loss_pct: Optional[float] = None
    largest_win_usd: Optional[float] = None
    largest_loss_usd: Optional[float] = None
    avg_hold_duration_sec: Optional[int] = None
    execution_time_ms: Optional[int] = None
    candles_processed: Optional[int] = None

    # Detailed data
    equity_curve: list[dict] = Field(default_factory=list)
    trade_log: list[dict] = Field(default_factory=list)

    # Error info (if failed)
    error_message: Optional[str] = None


class HealthResponse(BaseModel):
    """Health check response."""
    status: str = "ok"
    vectorbt_version: str = ""
    python_version: str = ""
