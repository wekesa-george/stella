# Run this in IEx to debug why signals are neutral
# FIXED VERSION - Handles Decimal conversion and adds better error handling

alias TradeEngine.Strategy.MultiTimeframe

# Helper function to safely convert to float
safe_to_float = fn(value) ->
  case value do
    %Decimal{} = dec -> 
      Decimal.to_float(dec)
    num when is_float(num) -> 
      num
    num when is_integer(num) -> 
      num * 1.0
    str when is_binary(str) ->
      case Float.parse(str) do
        {num, _} -> num
        :error -> raise "Cannot convert #{str} to float"
      end
    _ -> 
      raise "Unsupported type for conversion: #{inspect(value)}"
  end
end

# 1. Test single symbol analysis
symbol = "BTCUSD"
IO.puts("\n=== Testing #{symbol} ===\n")

case MultiTimeframe.analyze_alignment(symbol, "alpaca") do
  {:ok, signal} ->
    IO.puts("Direction: #{inspect(signal.direction)}")
    IO.puts("Strength: #{inspect(signal.strength)}")
    IO.puts("Confidence: #{Float.round(signal.confidence * 100, 1)}%")
    IO.puts("Timeframes analyzed: #{Map.get(signal, :timeframes_analyzed, 0)}")
    IO.puts("\nTimeframe Details:")
    
    if signal.details do
      Enum.each(signal.details, fn detail ->
        IO.puts("  #{detail.timeframe}:")
        IO.puts("    Signal: #{inspect(detail.signal)}")
        IO.puts("    R²: #{Float.round(detail.r_squared, 3)}")
        IO.puts("    Velocity: #{Float.round(detail.v0, 6)}")
        IO.puts("    Accel: #{Float.round(detail.acceleration, 6)}")
        IO.puts("    Price: $#{Float.round(detail.p0, 2)}")
      end)
    end
  
  {:error, reason} ->
    IO.puts("❌ Error: #{inspect(reason)}")
end

# 2. Check what thresholds are being used
IO.puts("\n=== Signal Classification Thresholds ===")
IO.puts("Min R²: 0.4")
IO.puts("Velocity threshold: 0.0005 (0.05%)")

# 3. Test physics on single timeframe
IO.puts("\n=== Testing Single Timeframe (5m) ===")
case MultiTimeframe.analyze_single_timeframe(symbol, "alpaca", "5m") do
  {:ok, physics} ->
    try do
      p0_float = safe_to_float.(physics.current_price)
      v_pct = physics.velocity / p0_float
      
      IO.puts("Current price: $#{Float.round(safe_to_float.(p0_float), 2)}")
      IO.puts("Velocity: #{Float.round(physics.velocity, 6)}")
      IO.puts("Acceleration: #{Float.round(physics.acceleration, 6)}")
      IO.puts("R²: #{Float.round(physics.r_squared, 3)}")
      IO.puts("Targets: #{inspect(physics.targets)}")
      
      IO.puts("\nVelocity %: #{Float.round(v_pct * 100, 4)}%")
      IO.puts("Threshold: 0.05%")
      
      signal = cond do
        v_pct > 0.0005 and physics.acceleration > 0 and physics.r_squared > 0.4 -> 
          :bullish
        v_pct < -0.0005 and physics.acceleration < 0 and physics.r_squared > 0.4 -> 
          :bearish
        v_pct > 0.0005 and physics.acceleration < 0 -> 
          :weak_bullish
        v_pct < -0.0005 and physics.acceleration > 0 -> 
          :weak_bearish
        true -> 
          :neutral
      end
      
      IO.puts("Classification: #{inspect(signal)}")
    rescue
      e ->
        IO.puts("❌ Error during analysis: #{inspect(e)}")
        IO.puts("Stack trace: #{inspect(__STACKTRACE__)}")
    end
  
  {:error, reason} ->
    IO.puts("❌ Error fetching physics data: #{inspect(reason)}")
end

IO.puts("\n=== Recommendations ===")
IO.puts("1. ✅ Decimal conversion is now safe")
IO.puts("2. If velocity % is too small (< 0.05%), market is consolidating")
IO.puts("3. If R² is too low (< 0.4), trend is weak/noisy")
IO.puts("4. Consider lowering @velocity_threshold_pct to 0.0001 (0.01%)")
IO.puts("5. Consider lowering @min_r_squared to 0.3")
IO.puts("\n=== Timeout Issue Debugging ===")
IO.puts("The repeated 'timeout' errors suggest:")
IO.puts("• Alpaca API is slow or rate-limited during kline requests")
IO.puts("• Check your API throttle settings (currently 160 req/min)")
IO.puts("• Verify Alpaca crypto bars endpoint is responding")
IO.puts("• Consider increasing timeout duration in config")
IO.puts("• Ensure network connectivity to Alpaca API")
