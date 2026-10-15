#!/bin/bash
# ==============================================================================
# Stella OHLCV Backfill Script
# Fetches historical candles from Binance mainnet REST API and inserts into
# the TimescaleDB market_data.ohlcv_* tables.
#
# Usage:
#   ./scripts/backfill_candles.sh ETHUSDT 5m 6   # 6 months of 5m candles
#   ./scripts/backfill_candles.sh BTCUSDT 1m 3   # 3 months of 1m candles
#   ./scripts/backfill_candles.sh ETHUSDT 1h 12  # 12 months of 1h candles
# ==============================================================================

set -uo pipefail

PAIR="${1:?Usage: $0 PAIR TIMEFRAME MONTHS_BACK}"
TIMEFRAME="${2:?Usage: $0 PAIR TIMEFRAME MONTHS_BACK}"
MONTHS="${3:-6}"

# Binance mainnet (not testnet — we need real historical data)
BINANCE_API="https://api.binance.com/api/v3/klines"

# DB connection (prod)
DB_HOST="88.216.70.194"
DB_PORT="6786"
DB_NAME="stella_platform_new"
DB_USER="postgres"
DB_PASS="REDACTED"

# Map timeframe to table
case "$TIMEFRAME" in
  1m)  TABLE="market_data.ohlcv_1m" ;;
  5m)  TABLE="market_data.ohlcv_5m" ;;
  15m) TABLE="market_data.ohlcv_15m" ;;
  1h)  TABLE="market_data.ohlcv_1h" ;;
  1d)  TABLE="market_data.ohlcv_1d" ;;
  *)   echo "Unsupported timeframe: $TIMEFRAME (use 1m, 5m, 15m, 1h, 1d)"; exit 1 ;;
esac

# Map timeframe to milliseconds
case "$TIMEFRAME" in
  1m)  TF_MS=60000 ;;
  5m)  TF_MS=300000 ;;
  15m) TF_MS=900000 ;;
  1h)  TF_MS=3600000 ;;
  1d)  TF_MS=86400000 ;;
esac

# Calculate time range
END_MS=$(($(date +%s) * 1000))
START_MS=$((END_MS - (MONTHS * 30 * 24 * 3600 * 1000)))

echo "================================================================"
echo "Backfill: $PAIR $TIMEFRAME -> $TABLE"
echo "Range: $(date -r $((START_MS / 1000)) '+%Y-%m-%d') to $(date -r $((END_MS / 1000)) '+%Y-%m-%d')"
echo "================================================================"

TOTAL_CANDLES=0
BATCH=0
CURRENT_START=$START_MS
LIMIT=1000

while [ "$CURRENT_START" -lt "$END_MS" ]; do
  BATCH=$((BATCH + 1))

  # Fetch from Binance
  RESPONSE=$(curl -s "${BINANCE_API}?symbol=${PAIR}&interval=${TIMEFRAME}&startTime=${CURRENT_START}&endTime=${END_MS}&limit=${LIMIT}")

  # Check for errors
  if echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if isinstance(d, list) else 1)" 2>/dev/null; then
    COUNT=$(echo "$RESPONSE" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
  else
    echo "ERROR: Binance API returned non-array response:"
    echo "$RESPONSE" | head -200
    echo ""
    echo "Waiting 10s and retrying..."
    sleep 10
    continue
  fi

  if [ "$COUNT" -eq 0 ]; then
    echo "No more candles. Done."
    break
  fi

  # Build SQL VALUES from JSON
  SQL_VALUES=$(echo "$RESPONSE" | python3 -c "
import sys, json
from datetime import datetime, timezone

rows = json.load(sys.stdin)
vals = []
for r in rows:
    ts = datetime.fromtimestamp(r[0] / 1000, tz=timezone.utc).strftime('%Y-%m-%d %H:%M:%S+00')
    o, h, l, c = r[1], r[2], r[3], r[4]
    vol, qvol, trades = r[5], r[7], r[8]
    vals.append(f\"('{ts}', 'binance', '${PAIR}', {o}, {h}, {l}, {c}, {vol}, {qvol}, {trades}, true)\")
print(',\\n'.join(vals))
")

  # Insert into DB
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -q -c "
    INSERT INTO ${TABLE} (time, exchange_code, trading_pair, open, high, low, close, volume, quote_volume, trade_count, is_complete)
    VALUES ${SQL_VALUES}
    ON CONFLICT DO NOTHING;
  " 2>/dev/null

  TOTAL_CANDLES=$((TOTAL_CANDLES + COUNT))

  # Get last candle timestamp and advance
  LAST_TS=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)[-1][0])")
  CURRENT_START=$((LAST_TS + TF_MS))

  # Progress
  PCT=$(( (CURRENT_START - START_MS) * 100 / (END_MS - START_MS) ))
  if [ "$PCT" -gt 100 ]; then PCT=100; fi
  echo "  Batch $BATCH: +${COUNT} candles (${TOTAL_CANDLES} total, ${PCT}%)"

  # Rate limit: 500ms between requests
  sleep 0.5
done

echo ""
echo "================================================================"
echo "COMPLETE: ${TOTAL_CANDLES} candles inserted into ${TABLE}"
echo "================================================================"

# Verify
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
  SELECT count(*) as total_rows, min(time) as earliest, max(time) as latest
  FROM ${TABLE}
  WHERE trading_pair = '${PAIR}';
"
