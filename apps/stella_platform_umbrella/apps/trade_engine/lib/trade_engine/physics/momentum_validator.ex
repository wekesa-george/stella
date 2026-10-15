defmodule TradeEngine.Physics.MomentumValidator do
  @moduledoc """
  🔍 STEP 5: BTCUSDT Momentum Validation & Diagnostics
  
  Purpose:
  - Validate extreme momentum values (BTC: -31.31)
  - Ensure data quality
  - Normalize momentum by price scale
  - Provide diagnostic insights
  """

  require Logger
  alias TradeEngine.Exchanges.Binance.KlineStream

  @doc """
  Deep analysis of momentum for a specific symbol
  Returns detailed diagnostics and validation
  """
  def analyze_momentum(symbol) do
    symbol_upper = String.upcase(symbol)
    
    case KlineStream.get_recent_candles(symbol_upper, 20) do
      candles when is_list(candles) and length(candles) >= 5 ->
        perform_diagnostic(symbol_upper, candles)
      
      _ ->
        {:error, "Insufficient candle data"}
    end
  end

  # ========================================================================
  # MAIN DIAGNOSTIC ANALYSIS
  # ========================================================================

  defp perform_diagnostic(symbol, candles) do
    prices = extract_prices(candles)
    
    Logger.info("""
    
    🔍 MOMENTUM DIAGNOSTIC: #{symbol}
    ═════════════════════════════════════════════════════════════════
    """)

    # 1. Basic statistics
    basic_stats = calculate_basic_stats(prices)
    log_basic_stats(symbol, basic_stats)

    # 2. Momentum calculation breakdown
    momentum_breakdown = calculate_momentum_breakdown(prices)
    log_momentum_breakdown(symbol, momentum_breakdown)

    # 3. Price range analysis
    price_range = analyze_price_range(prices)
    log_price_range(symbol, price_range)

    # 4. Volatility analysis
    volatility = analyze_volatility(prices)
    log_volatility(symbol, volatility)

    # 5. Normalized momentum (by price scale)
    normalized = normalize_momentum(
      momentum_breakdown.momentum,
      basic_stats.mean_price,
      symbol
    )
    log_normalized_momentum(symbol, normalized)

    # 6. Data quality check
    quality = check_data_quality(candles, prices)
    log_data_quality(symbol, quality)

    # 7. Timeframe validation
    timeframe_check = validate_timeframe(candles)
    log_timeframe_validation(symbol, timeframe_check)

    Logger.info("═════════════════════════════════════════════════════════════════\n")

    {
      :ok,
      %{
        symbol: symbol,
        basic_stats: basic_stats,
        momentum: momentum_breakdown,
        price_range: price_range,
        volatility: volatility,
        normalized_momentum: normalized,
        data_quality: quality,
        timeframe_validation: timeframe_check,
        verdict: generate_verdict(momentum_breakdown, normalized, quality)
      }
    }
  end

  # ========================================================================
  # 1. BASIC STATISTICS
  # ========================================================================

  defp calculate_basic_stats(prices) do
    n = length(prices)
    mean = Enum.sum(prices) / n
    variance = Enum.reduce(prices, 0, fn p, acc ->
      acc + ((p - mean) ** 2)
    end) / n
    std_dev = :math.sqrt(variance)

    %{
      count: n,
      min_price: Enum.min(prices),
      max_price: Enum.max(prices),
      mean_price: Float.round(mean, 2),
      median_price: calculate_median(prices),
      std_dev: Float.round(std_dev, 2),
      variance: Float.round(variance, 2)
    }
  end

  defp calculate_median(prices) do
    sorted = Enum.sort(prices)
    n = length(sorted)
    
    case rem(n, 2) do
      0 ->
        (Enum.at(sorted, div(n, 2) - 1) + Enum.at(sorted, div(n, 2))) / 2
      1 ->
        Enum.at(sorted, div(n, 2))
    end
    |> Float.round(2)
  end

  defp log_basic_stats(symbol, stats) do
    Logger.info("""
    📊 BASIC STATISTICS
    ├─ Candles analyzed: #{stats.count}
    ├─ Price range: $#{stats.min_price} to $#{stats.max_price}
    ├─ Mean price: $#{stats.mean_price}
    ├─ Median price: $#{stats.median_price}
    ├─ Std deviation: $#{stats.std_dev}
    └─ Variance: #{stats.variance}
    """)
  end

  # ========================================================================
  # 2. MOMENTUM CALCULATION BREAKDOWN
  # ========================================================================

  defp calculate_momentum_breakdown(prices) do
    n = length(prices)
    x_vals = Enum.to_list(0..(n - 1)) |> Enum.map(&(&1 * 1.0))

    mean_x = Enum.sum(x_vals) / n
    mean_y = Enum.sum(prices) / n

    numerator = Enum.zip(x_vals, prices)
      |> Enum.reduce(0.0, fn {x, y}, acc ->
        acc + (x - mean_x) * (y - mean_y)
      end)

    denominator = Enum.map(x_vals, fn x ->
      (x - mean_x) ** 2
    end) |> Enum.sum()

    momentum = if denominator > 0, do: numerator / denominator, else: 0.0

    %{
      momentum: Float.round(momentum, 6),
      numerator: Float.round(numerator, 2),
      denominator: Float.round(denominator, 2),
      mean_x: Float.round(mean_x, 2),
      mean_y: Float.round(mean_y, 2),
      slope_direction: if(momentum > 0, do: "UPWARD ↑", else: "DOWNWARD ↓"),
      strength: classify_momentum_strength(abs(momentum))
    }
  end

  defp classify_momentum_strength(abs_momentum) do
    cond do
      abs_momentum > 10 -> "EXTREME 🔴"
      abs_momentum > 1 -> "VERY STRONG 🟥"
      abs_momentum > 0.1 -> "STRONG 🟧"
      abs_momentum > 0.01 -> "MODERATE 🟨"
      abs_momentum > 0.001 -> "WEAK 🟩"
      true -> "MINIMAL 🟦"
    end
  end

  defp log_momentum_breakdown(symbol, momentum) do
    Logger.info("""
    📈 MOMENTUM CALCULATION
    ├─ Momentum (v₀): #{momentum.momentum}
    ├─ Direction: #{momentum.slope_direction}
    ├─ Strength: #{momentum.strength}
    ├─ Linear regression numerator: #{momentum.numerator}
    ├─ Linear regression denominator: #{momentum.denominator}
    ├─ Mean X: #{momentum.mean_x}
    └─ Mean Y: #{momentum.mean_y}
    """)
  end

  # ========================================================================
  # 3. PRICE RANGE ANALYSIS
  # ========================================================================

  defp analyze_price_range(prices) do
    min_price = Enum.min(prices)
    max_price = Enum.max(prices)
    range = max_price - min_price
    range_percent = (range / Enum.at(prices, -1)) * 100

    %{
      min: Float.round(min_price, 2),
      max: Float.round(max_price, 2),
      range: Float.round(range, 2),
      range_percent: Float.round(range_percent, 2),
      first_price: Float.round(Enum.at(prices, 0), 2),
      last_price: Float.round(Enum.at(prices, -1), 2),
      net_change: Float.round(Enum.at(prices, -1) - Enum.at(prices, 0), 2),
      net_change_percent: Float.round(
        ((Enum.at(prices, -1) - Enum.at(prices, 0)) / Enum.at(prices, 0)) * 100,
        2
      )
    }
  end

  defp log_price_range(symbol, range) do
    Logger.info("""
    💹 PRICE RANGE ANALYSIS
    ├─ Min price: $#{range.min}
    ├─ Max price: $#{range.max}
    ├─ Range: $#{range.range} (#{range.range_percent}%)
    ├─ First price: $#{range.first_price}
    ├─ Last price: $#{range.last_price}
    ├─ Net change: $#{range.net_change}
    └─ Net change %: #{range.net_change_percent}%
    """)
  end

  # ========================================================================
  # 4. VOLATILITY ANALYSIS
  # ========================================================================

  defp analyze_volatility(prices) do
    changes = Enum.chunk_every(prices, 2, 1)
      |> Enum.filter(&(length(&1) == 2))
      |> Enum.map(fn [a, b] -> b - a end)

    mean_price = Enum.sum(prices) / length(prices)
    avg_change = Enum.sum(changes) / length(changes)
    avg_abs_change = Enum.reduce(changes, 0, fn change, acc ->
      acc + abs(change)
    end) / length(changes)

    volatility_percent = (avg_abs_change / mean_price) * 100

    %{
      avg_change: Float.round(avg_change, 6),
      avg_abs_change: Float.round(avg_abs_change, 6),
      volatility_percent: Float.round(volatility_percent, 4),
      volatility_level: classify_volatility(volatility_percent)
    }
  end

  defp classify_volatility(vol_percent) do
    cond do
      vol_percent > 5 -> "EXTREME 🔴"
      vol_percent > 2 -> "VERY HIGH 🟥"
      vol_percent > 1 -> "HIGH 🟧"
      vol_percent > 0.5 -> "MODERATE 🟨"
      vol_percent > 0.1 -> "LOW 🟩"
      true -> "MINIMAL 🟦"
    end
  end

  defp log_volatility(symbol, vol) do
    Logger.info("""
    📊 VOLATILITY ANALYSIS
    ├─ Avg change per candle: #{vol.avg_change}
    ├─ Avg absolute change: #{vol.avg_abs_change}
    ├─ Volatility: #{vol.volatility_percent}%
    └─ Level: #{vol.volatility_level}
    """)
  end

  # ========================================================================
  # 5. NORMALIZED MOMENTUM
  # ========================================================================

  @doc """
  Normalize momentum by price scale
  BTC ($93k) and DOGE ($0.15) can't be compared directly
  
  Formula: normalized = (momentum / mean_price) * 100
  """
  defp normalize_momentum(momentum, mean_price, symbol) do
    if mean_price > 0 do
      normalized = (momentum / mean_price) * 100
      
      %{
        raw_momentum: Float.round(momentum, 6),
        normalized_momentum: Float.round(normalized, 6),
        price_scale: Float.round(mean_price, 2),
        interpretation: interpret_normalized(normalized, symbol)
      }
    else
      %{error: "Invalid mean price"}
    end
  end

  defp interpret_normalized(normalized, symbol) do
    case symbol do
      "BTCUSDT" ->
        cond do
          abs(normalized) > 0.01 -> "EXTREME MOMENTUM for #{symbol}"
          abs(normalized) > 0.005 -> "VERY STRONG MOMENTUM for #{symbol}"
          abs(normalized) > 0.001 -> "STRONG MOMENTUM for #{symbol}"
          true -> "NORMAL MOMENTUM for #{symbol}"
        end
      _ ->
        cond do
          abs(normalized) > 0.1 -> "EXTREME MOMENTUM for #{symbol}"
          abs(normalized) > 0.05 -> "VERY STRONG MOMENTUM for #{symbol}"
          abs(normalized) > 0.01 -> "STRONG MOMENTUM for #{symbol}"
          true -> "NORMAL MOMENTUM for #{symbol}"
        end
    end
  end

  defp log_normalized_momentum(symbol, normalized) do
    Logger.info("""
    📐 NORMALIZED MOMENTUM (Scale-adjusted)
    ├─ Raw momentum: #{normalized.raw_momentum}
    ├─ Normalized: #{normalized.normalized_momentum}
    ├─ Price scale (mean): $#{normalized.price_scale}
    └─ Interpretation: #{normalized.interpretation}
    """)
  end

  # ========================================================================
  # 6. DATA QUALITY CHECK
  # ========================================================================

  defp check_data_quality(candles, prices) do
    # Check for missing or null prices
    valid_prices = Enum.filter(prices, &(&1 > 0))
    missing_count = length(prices) - length(valid_prices)

    # Check for gaps in timestamps
    timestamps = Enum.map(candles, & &1.timestamp)
    gaps = detect_timestamp_gaps(timestamps)

    # Check for duplicates
    duplicates = length(prices) - length(Enum.uniq(prices))

    %{
      total_candles: length(candles),
      valid_prices: length(valid_prices),
      missing_prices: missing_count,
      duplicate_prices: duplicates,
      timestamp_gaps: gaps,
      quality_score: calculate_quality_score(missing_count, gaps, duplicates),
      status: if(missing_count == 0 and gaps == 0 and duplicates == 0,
        do: "✅ EXCELLENT",
        else: "⚠️ CHECK NEEDED"
      )
    }
  end

  defp detect_timestamp_gaps(timestamps) do
    timestamps
    |> Enum.chunk_every(2, 1)
    |> Enum.filter(&(length(&1) == 2))
    |> Enum.count(fn [t1, t2] ->
      diff = DateTime.diff(t2, t1, :second)
      diff > 330  # More than 5.5 minutes (5m candles)
    end)
  end

  defp calculate_quality_score(missing, gaps, duplicates) do
    penalty = missing * 10 + gaps * 5 + duplicates * 3
    score = max(0, 100 - penalty)
    Float.round(score, 1)
  end

  defp log_data_quality(symbol, quality) do
    Logger.info("""
    🔍 DATA QUALITY CHECK
    ├─ Total candles: #{quality.total_candles}
    ├─ Valid prices: #{quality.valid_prices}
    ├─ Missing prices: #{quality.missing_prices}
    ├─ Duplicate prices: #{quality.duplicate_prices}
    ├─ Timestamp gaps: #{quality.timestamp_gaps}
    ├─ Quality score: #{quality.quality_score}%
    └─ Status: #{quality.status}
    """)
  end

  # ========================================================================
  # 7. TIMEFRAME VALIDATION
  # ========================================================================

  defp validate_timeframe(candles) do
    case candles do
      [] ->
        %{
          timeframe: "UNKNOWN",
          candles_count: 0,
          status: "❌ NO CANDLES"
        }

      candles ->
        timeframes = Enum.map(candles, & &1.timeframe) |> Enum.uniq()
        
        %{
          detected_timeframes: timeframes,
          candles_count: length(candles),
          primary_timeframe: Enum.at(timeframes, 0),
          status: if(length(timeframes) == 1, do: "✅ CONSISTENT", else: "⚠️ MIXED")
        }
    end
  end

  defp log_timeframe_validation(symbol, timeframe) do
    Logger.info("""
    ⏱️ TIMEFRAME VALIDATION
    ├─ Candles: #{timeframe.candles_count}
    ├─ Primary timeframe: #{timeframe.primary_timeframe}
    ├─ Detected timeframes: #{inspect(timeframe.detected_timeframes)}
    └─ Status: #{timeframe.status}
    """)
  end

  # ========================================================================
  # VERDICT GENERATION
  # ========================================================================

  defp generate_verdict(momentum, normalized, quality) do
    %{
      momentum_valid: verdict_momentum_valid(momentum),
      data_quality_ok: quality.quality_score >= 80,
      momentum_trustworthy: quality.quality_score >= 80 and normalized.normalized_momentum != 0,
      recommendation: generate_recommendation(momentum, quality)
    }
  end

  defp verdict_momentum_valid(momentum) do
    momentum.strength not in ["MINIMAL 🟦"]
  end

  defp generate_recommendation(momentum, quality) do
    cond do
      quality.quality_score < 50 ->
        "⚠️ DATA QUALITY TOO LOW - Review candle data"
      momentum.strength == "MINIMAL 🟦" ->
        "✅ Momentum is minimal - Market is undecided"
      true ->
        "✅ Momentum appears valid - Physics model tracking correctly"
    end
  end

  # ========================================================================
  # HELPER FUNCTIONS
  # ========================================================================

  defp extract_prices(candles) do
    Enum.map(candles, fn candle ->
      case candle.close do
        %Decimal{} = d -> Decimal.to_float(d)
        n when is_number(n) -> n * 1.0
        _ -> 0.0
      end
    end)
    |> Enum.filter(&(&1 > 0))
  end
end