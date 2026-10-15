"""
Fetch 2yr of 5m candles from Binance and insert into market_data.ohlcv_5m.
"""
import time
from datetime import datetime, timezone

import pandas as pd
import requests
from sqlalchemy import create_engine, text

DEV_DB_URL = (
    "postgresql://postgres:REDACTED"
    "@170.168.103.207:3212/stella_platform_new"
)

BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines"
BATCH_SIZE = 1000  # Binance max per request
RATE_LIMIT_MS = 300  # ms between requests

PAIRS = [
    ("BNBUSDT", "2024-03-13"),
    ("SOLUSDT", "2024-03-13"),
    ("JUPUSDT", "2024-03-13"),
    ("VIRTUALUSDT", "2025-04-11"),
]

END_DATE = "2026-03-13"


def fetch_klines(symbol, interval, start_ms, end_ms):
    """Fetch one batch of klines from Binance."""
    params = {
        "symbol": symbol,
        "interval": interval,
        "startTime": start_ms,
        "endTime": end_ms,
        "limit": BATCH_SIZE,
    }
    resp = requests.get(BINANCE_KLINES_URL, params=params, timeout=15)
    if resp.status_code == 429:
        print(f"  Rate limited, waiting 10s...")
        time.sleep(10)
        return fetch_klines(symbol, interval, start_ms, end_ms)
    resp.raise_for_status()
    return resp.json()


def fetch_all_candles(symbol, interval, start_date, end_date):
    """Fetch all candles for a symbol/interval between dates."""
    start_ms = int(datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp() * 1000)
    end_ms = int(datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp() * 1000)

    interval_ms = 5 * 60 * 1000  # 5m in ms

    all_candles = []
    current_start = start_ms
    batch_num = 0

    while current_start < end_ms:
        batch_num += 1
        klines = fetch_klines(symbol, interval, current_start, end_ms)

        if not klines:
            break

        for k in klines:
            all_candles.append({
                "time": datetime.fromtimestamp(k[0] / 1000, tz=timezone.utc),
                "exchange_code": "binance",
                "trading_pair": symbol,
                "open": float(k[1]),
                "high": float(k[2]),
                "low": float(k[3]),
                "close": float(k[4]),
                "volume": float(k[5]),
                "quote_volume": float(k[7]),
                "trade_count": int(k[8]),
                "is_complete": True,
            })

        last_time_ms = klines[-1][0]
        current_start = last_time_ms + interval_ms

        if batch_num % 10 == 0:
            print(f"  {symbol}: batch {batch_num}, {len(all_candles):,} candles so far, last: {datetime.fromtimestamp(last_time_ms/1000, tz=timezone.utc).strftime('%Y-%m-%d %H:%M')}")

        time.sleep(RATE_LIMIT_MS / 1000)

    print(f"  {symbol}: DONE — {len(all_candles):,} candles fetched")
    return all_candles


def insert_candles(engine, candles, batch_size=5000):
    """Bulk insert candles into market_data.ohlcv_5m."""
    if not candles:
        return 0

    df = pd.DataFrame(candles)
    total = 0

    with engine.connect() as conn:
        for i in range(0, len(df), batch_size):
            batch = df.iloc[i:i + batch_size]
            values_parts = []
            params = {}

            for j, (_, row) in enumerate(batch.iterrows()):
                idx = i + j
                values_parts.append(
                    f"(:t{idx}, :ec{idx}, :tp{idx}, :o{idx}, :h{idx}, :l{idx}, :c{idx}, :v{idx}, :qv{idx}, :tc{idx}, :ic{idx})"
                )
                params[f"t{idx}"] = row["time"]
                params[f"ec{idx}"] = row["exchange_code"]
                params[f"tp{idx}"] = row["trading_pair"]
                params[f"o{idx}"] = row["open"]
                params[f"h{idx}"] = row["high"]
                params[f"l{idx}"] = row["low"]
                params[f"c{idx}"] = row["close"]
                params[f"v{idx}"] = row["volume"]
                params[f"qv{idx}"] = row["quote_volume"]
                params[f"tc{idx}"] = row["trade_count"]
                params[f"ic{idx}"] = row["is_complete"]

            sql = text(f"""
                INSERT INTO market_data.ohlcv_5m
                    (time, exchange_code, trading_pair, open, high, low, close, volume, quote_volume, trade_count, is_complete)
                VALUES {', '.join(values_parts)}
                ON CONFLICT DO NOTHING
            """)
            conn.execute(sql, params)
            conn.commit()
            total += len(batch)
            print(f"    Inserted batch {i//batch_size + 1}: {len(batch)} rows (total: {total:,})")

    return total


def main():
    engine = create_engine(DEV_DB_URL)

    # Verify table exists
    with engine.connect() as conn:
        result = conn.execute(text("SELECT COUNT(*) FROM market_data.ohlcv_5m LIMIT 1"))
        print(f"ohlcv_5m table exists, current rows: {result.scalar()}")

    for symbol, start_date in PAIRS:
        print(f"\n{'='*60}")
        print(f"  Fetching {symbol}: {start_date} → {END_DATE}")
        print(f"{'='*60}")

        candles = fetch_all_candles(symbol, "5m", start_date, END_DATE)

        if candles:
            print(f"  Inserting {len(candles):,} candles into DB...")
            inserted = insert_candles(engine, candles)
            print(f"  {symbol}: {inserted:,} rows inserted")
        else:
            print(f"  {symbol}: No candles fetched!")

    # Verify
    print(f"\n{'='*60}")
    print("  VERIFICATION")
    print(f"{'='*60}")
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT trading_pair, COUNT(*), MIN(time), MAX(time)
            FROM market_data.ohlcv_5m
            WHERE trading_pair IN ('BNBUSDT', 'SOLUSDT', 'JUPUSDT', 'VIRTUALUSDT')
            GROUP BY trading_pair
            ORDER BY trading_pair
        """))
        for row in result:
            print(f"  {row[0]}: {row[1]:,} candles | {row[2]} → {row[3]}")


if __name__ == "__main__":
    main()
