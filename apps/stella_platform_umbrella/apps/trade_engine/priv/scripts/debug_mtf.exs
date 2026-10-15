# ============================================================================
# FILE 7: debug_binance_httpoison.exs
# RUN WITH: mix run debug_binance_httpoison.exs
# ============================================================================

require Logger

Logger.configure(level: :debug)

defmodule TestBinanceHTTPoison do
  require Logger
  alias TradeEngine.MarketData.History

  def run do
    IO.puts("\n" <> String.duplicate("=", 80))
    IO.puts("🧪 TESTING BINANCE API WITH HTTPOISON")
    IO.puts(String.duplicate("=", 80) <> "\n")

    symbol = "BTC/USDT"
    exchange = "binance"

    # Test 1: Single fetch
    IO.puts("TEST 1: Fetch single timeframe")
    IO.puts(String.duplicate("-", 80))
    test_single_fetch(exchange, symbol)

    # Test 2: Multiple timeframes
    IO.puts("\nTEST 2: Fetch multiple timeframes (with throttle)")
    IO.puts(String.duplicate("-", 80))
    test_multiple_timeframes(exchange, symbol)

    # Test 3: Verify data structure
    IO.puts("\nTEST 3: Verify candle data structure")
    IO.puts(String.duplicate("-", 80))
    test_data_structure(exchange, symbol)

    IO.puts("\n" <> String.duplicate("=", 80))
    IO.puts("✅ TESTS COMPLETE")
    IO.puts(String.duplicate("=", 80) <> "\n")
  end

  defp test_single_fetch(exchange, symbol) do
    start = System.monotonic_time(:millisecond)

    case History.fetch_candles(exchange, symbol, "5m", 10) do
      {:ok, candles} ->
        elapsed = System.monotonic_time(:millisecond) - start
        IO.puts("  ✅ SUCCESS in #{elapsed}ms")
        IO.puts("  Fetched: #{length(candles)} candles")

        if not Enum.empty?(candles) do
          first = List.first(candles)
          IO.puts("  First candle:")
          IO.puts("    Close: $#{first.close}")
          IO.puts("    Volume: #{first.volume}")
        end

      {:error, reason} ->
        IO.puts("  ❌ ERROR: #{inspect(reason)}")
    end
  end

  defp test_multiple_timeframes(exchange, symbol) do
    timeframes = ["1m", "5m", "15m", "30m", "1h"]
    start = System.monotonic_time(:millisecond)

    results =
      Enum.map(timeframes, fn tf ->
        case History.fetch_candles(exchange, symbol, tf, 20) do
          {:ok, candles} -> {tf, :ok, length(candles)}
          {:error, reason} -> {tf, :error, reason}
        end
      end)

    elapsed = System.monotonic_time(:millisecond) - start

    IO.puts("  Results (#{elapsed}ms total, should be ~1000ms with throttle):")

    Enum.each(results, fn
      {tf, :ok, count} -> IO.puts("    ✅ #{String.pad_trailing(tf, 4)}: #{count} candles")
      {tf, :error, reason} -> IO.puts("    ❌ #{String.pad_trailing(tf, 4)}: #{inspect(reason)}")
    end)
  end

  defp test_data_structure(exchange, symbol) do
    case History.fetch_candles(exchange, symbol, "1h", 5) do
      {:ok, candles} ->
        if not Enum.empty?(candles) do
          candle = List.first(candles)
          IO.puts("  ✅ Candle structure verified:")
          IO.puts("     Close: #{inspect(candle.close)} (Decimal)")
          IO.puts("     Volume: #{inspect(candle.volume)} (Decimal)")
          IO.puts("     Open: #{inspect(candle.open)} (Decimal)")
          IO.puts("     High: #{inspect(candle.high)} (Decimal)")
          IO.puts("     Low: #{inspect(candle.low)} (Decimal)")
        else
          IO.puts("  ⚠️  No candles returned")
        end

      {:error, reason} ->
        IO.puts("  ❌ Error: #{inspect(reason)}")
    end
  end
end

TestBinanceHTTPoison.run()