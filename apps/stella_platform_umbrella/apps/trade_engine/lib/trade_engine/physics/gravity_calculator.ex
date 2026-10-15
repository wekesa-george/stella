# ============================================================================
# GRAVITY CALCULATOR - COMPLETE REWRITE (WORKING VERSION)
# ============================================================================
defmodule TradeEngine.Physics.GravityCalculator do
  @moduledoc "Calculate market gravity (g) - SIMPLIFIED & FIXED"
  require Logger

  @doc "Calculate gravity from candle data"
  def calculate_gravity(candles, _order_flow \\ nil) when is_list(candles) do
    n = length(candles)
    
    cond do
      n < 2 ->
        Logger.warning("⚠️ Gravity: Need at least 2 candles, got #{n}")
        0.0001
      
      true ->
        try do
          # Extract prices as floats
          closes = extract_closes(candles)
          highs = extract_highs(candles)
          lows = extract_lows(candles)
          
          # Debug: check if we have data
          if Enum.empty?(closes) or Enum.empty?(highs) or Enum.empty?(lows) do
            Logger.error("❌ Gravity: Failed to extract prices")
            0.0001
          else
            # Calculate simple volatility (high-low range as % of close)
            mean_close = Enum.sum(closes) / length(closes)
            
            if mean_close <= 0 do
              Logger.error("❌ Gravity: Invalid mean close: #{mean_close}")
              0.0001
            else
              # 1. CALCULATE VOLATILITY (range as % of price)
              volatility = calculate_volatility_simple(closes, highs, lows, mean_close)
              
              # 2. CALCULATE MOMENTUM DECAY
              decay = calculate_decay(closes)
              
              # 3. CALCULATE DIRECTION REVERSALS
              reversals = calculate_reversals(closes)
              
              # COMBINE COMPONENTS
              # Volatility: 60% weight
              # Decay: 30% weight
              # Reversals: 10% weight
              total = (volatility * 0.6) + (decay * 0.3) + (reversals * 0.1)
              
              # Clamp to valid range: 0.0001 to 0.05
              gravity = cond do
                total < 0.0001 -> 0.0001
                total > 0.05 -> 0.05
                true -> total
              end
              
              gravity = Float.round(gravity, 6)
              
              Logger.debug("✅ Gravity: #{gravity} (vol:#{Float.round(volatility, 4)} decay:#{Float.round(decay, 4)} rev:#{Float.round(reversals, 4)})")
              
              gravity
            end
          end
        rescue
          e ->
            Logger.error("❌ Gravity calculation crashed: #{inspect(e)}")
            0.0001
        end
    end
  end

  # ========================================================================
  # VOLATILITY: Simple range-based calculation
  # ========================================================================
  
  defp calculate_volatility_simple(closes, highs, lows, mean_close) do
    # Method 1: Average (High - Low) as % of price
    ranges = Enum.zip([highs, lows])
      |> Enum.map(fn {h, l} -> h - l end)
    
    avg_range = Enum.sum(ranges) / length(ranges)
    volatility_pct = avg_range / mean_close
    
    # Convert to gravity scale: 0.5% volatility = 0.0001 gravity, 5% = 0.001
    # Formula: gravity = volatility_pct / 50
    gravity_vol = volatility_pct / 50.0
    
    # Clamp to 0.00005 - 0.01
    gravity_vol = max(gravity_vol, 0.00005)
    gravity_vol = min(gravity_vol, 0.01)
    
    Float.round(gravity_vol, 6)
  end

  # ========================================================================
  # DECAY: Check if momentum is slowing
  # ========================================================================
  
    defp calculate_decay(closes) when length(closes) < 3, do: 0.0

    defp calculate_decay(closes) do
    # Convert all closes to floats
    closes_f = Enum.map(closes, fn
        %Decimal{} = d -> Decimal.to_float(d)
        n when is_number(n) -> n * 1.0
    end)

    # Helper: sum of absolute changes for valid 2-element chunks
    sum_abs_changes = fn prices ->
        prices
        |> Enum.chunk_every(2, 1)
        |> Enum.filter(fn chunk -> length(chunk) == 2 end)
        |> Enum.map(fn [a, b] -> abs(b - a) end)
        |> Enum.sum()
    end

    recent_changes = closes_f |> Enum.slice(-3..-1) |> sum_abs_changes.()
    older_changes  = closes_f |> Enum.slice(0..2) |> sum_abs_changes.()

    if older_changes == 0 do
        0.0
    else
        decay_ratio = 1.0 - (recent_changes / older_changes)
        decay_ratio = Kernel.max(decay_ratio, 0.0)
        decay_ratio = Kernel.min(decay_ratio, 1.0)

        decay_gravity = decay_ratio * 0.005
        Float.round(decay_gravity, 6)
    end
    end



  # ========================================================================
  # REVERSALS: Count direction changes
  # ========================================================================
  
    defp calculate_reversals(closes) when length(closes) < 2, do: 0.0

    defp calculate_reversals(closes) do
    # Convert to floats
    closes_f = Enum.map(closes, fn
        %Decimal{} = d -> Decimal.to_float(d)
        n when is_number(n) -> n * 1.0
    end)

    # Safe calculation of changes
    changes =
        closes_f
        |> Enum.chunk_every(2, 1)
        |> Enum.filter(fn chunk -> length(chunk) == 2 end)
        |> Enum.map(fn [a, b] -> b - a end)

    # Count reversals (sign changes)
    reversals =
        changes
        |> Enum.chunk_every(2, 1)
        |> Enum.filter(fn chunk -> length(chunk) == 2 end)
        |> Enum.count(fn [a, b] -> a * b < 0 end)

    if length(changes) == 0 do
        0.0
    else
        # Reversal rate: reversals / total changes
        reversal_rate = reversals / length(changes)
        # Scale to gravity
        reversal_gravity = reversal_rate * 0.01
        Float.round(reversal_gravity, 6)
    end
    end


  # ========================================================================
  # HELPER: Extract prices safely
  # ========================================================================
  
  defp extract_closes(candles) do
    candles
    |> Enum.map(&safe_float(&1.close))
    |> Enum.filter(&(&1 > 0))
  end
  
  defp extract_highs(candles) do
    candles
    |> Enum.map(&safe_float(&1.high))
    |> Enum.filter(&(&1 > 0))
  end
  
  defp extract_lows(candles) do
    candles
    |> Enum.map(&safe_float(&1.low))
    |> Enum.filter(&(&1 > 0))
  end
  
  defp safe_float(%Decimal{} = d) do
    Decimal.to_float(d)
  end
  defp safe_float(n) when is_float(n) do
    n
  end
  defp safe_float(n) when is_integer(n) do
    n * 1.0
  end
  defp safe_float(_) do
    -1.0  # Invalid marker
  end
end