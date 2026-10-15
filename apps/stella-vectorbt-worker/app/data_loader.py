"""Load OHLCV data from PostgreSQL (TimescaleDB) for backtesting."""

import os
import pandas as pd
from sqlalchemy import create_engine, text
from datetime import datetime

# Default DB connection from environment
DEFAULT_DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:REDACTED@170.168.103.207:3212/stella_platform_new"
)

TIMEFRAME_TABLES = {
    "1m": "market_data.ohlcv_1m",
    "5m": "market_data.ohlcv_5m",
    "15m": "market_data.ohlcv_15m",
    "1h": "market_data.ohlcv_1h",
    "1d": "market_data.ohlcv_1d",
}


def load_ohlcv(
    exchange: str,
    pair: str,
    timeframe: str,
    start: datetime,
    end: datetime,
    db_url: str | None = None,
) -> pd.DataFrame:
    """
    Load OHLCV data from the database.

    Returns a pandas DataFrame with columns: open, high, low, close, volume
    indexed by datetime.
    """
    table = TIMEFRAME_TABLES.get(timeframe)
    if not table:
        raise ValueError(f"Unsupported timeframe: {timeframe}. Supported: {list(TIMEFRAME_TABLES.keys())}")

    url = db_url or DEFAULT_DB_URL
    engine = create_engine(url)

    query = text(f"""
        SELECT time, open, high, low, close, volume, quote_volume, trade_count
        FROM {table}
        WHERE exchange_code = :exchange
          AND trading_pair = :pair
          AND time >= :start
          AND time < :end
        ORDER BY time ASC
    """)

    with engine.connect() as conn:
        df = pd.read_sql(
            query,
            conn,
            params={"exchange": exchange, "pair": pair, "start": start, "end": end},
            parse_dates=["time"],
        )

    if df.empty:
        raise ValueError(
            f"No OHLCV data found for {exchange}/{pair} {timeframe} "
            f"from {start} to {end}. Run backfill first."
        )

    df = df.set_index("time")

    # Convert decimal columns to float
    for col in ["open", "high", "low", "close", "volume", "quote_volume"]:
        if col in df.columns:
            df[col] = df[col].astype(float)

    return df
