"""FastAPI application for the VectorBT backtesting worker."""

import sys
import logging

from fastapi import FastAPI, HTTPException
from app.models import BacktestRequest, BacktestResponse, HealthResponse
from app.runner import run_backtest

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Stella VectorBT Worker",
    description="Backtesting worker for Stella trading platform",
    version="0.1.0",
)


@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint."""
    try:
        import vectorbt as vbt
        vbt_version = vbt.__version__
    except Exception:
        vbt_version = "unknown"

    return HealthResponse(
        status="ok",
        vectorbt_version=vbt_version,
        python_version=sys.version,
    )


@app.post("/run", response_model=BacktestResponse)
async def run(request: BacktestRequest):
    """Run a backtest with the given configuration."""
    logger.info(
        f"Backtest request: {request.backtest_id} | "
        f"{request.strategy_type} | {request.trading_pair} | "
        f"{request.timeframe} | {request.start_date} -> {request.end_date}"
    )

    try:
        result = run_backtest(request)
        logger.info(
            f"Backtest {request.backtest_id} {result.status}: "
            f"{result.total_trades} trades, "
            f"{result.total_return_pct}% return, "
            f"{result.execution_time_ms}ms"
        )
        return result
    except Exception as e:
        logger.error(f"Backtest {request.backtest_id} failed: {e}")
        return BacktestResponse(
            backtest_id=request.backtest_id,
            status="failed",
            error_message=str(e),
        )
