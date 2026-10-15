defmodule TradeEngine.Physics.RegimeDetector do
  @moduledoc """
  Detects market regime from price data.

  Regimes:
  - :trending_up — clear uptrend, good for longs
  - :trending_down — clear downtrend, good for shorts
  - :ranging — sideways/choppy, avoid trading
  - :volatile — high volatility regime, trade with caution

  Uses three complementary methods:
  1. ADX-like directional index — positive vs negative price changes
  2. Kaufman efficiency ratio — net change / sum of absolute changes
  3. Volatility regime — recent ATR vs overall ATR
  """

  @doc """
  Detect current market regime from candle data.
  Returns %{regime: atom, strength: float 0-1, details: map}

  Requires at least 20 candles for meaningful detection.
  """
  def detect(candles) when is_list(candles) and length(candles) >= 20 do
    prices = extract_closes(candles)
    highs = extract_highs(candles)
    lows = extract_lows(candles)

    # 1. Kaufman Efficiency Ratio
    efficiency_ratio = calculate_efficiency_ratio(prices)

    # 2. ADX-like directional bias
    {directional_bias, net_direction} = calculate_directional_bias(prices)

    # 3. Volatility regime (recent vs overall ATR)
    volatility_ratio = calculate_volatility_ratio(highs, lows, prices)

    # Classify regime
    {regime, strength} = classify_regime(efficiency_ratio, directional_bias, net_direction, volatility_ratio)

    %{
      regime: regime,
      strength: Float.round(strength * 1.0, 4),
      details: %{
        efficiency_ratio: Float.round(efficiency_ratio * 1.0, 4),
        directional_bias: Float.round(directional_bias * 1.0, 4),
        net_direction: net_direction,
        volatility_ratio: Float.round(volatility_ratio * 1.0, 4)
      }
    }
  end

  def detect(_candles) do
    %{
      regime: :unknown,
      strength: 0.0,
      details: %{
        efficiency_ratio: 0.0,
        directional_bias: 0.0,
        net_direction: :flat,
        volatility_ratio: 1.0
      }
    }
  end

  # ========================================================================
  # EFFICIENCY RATIO (Kaufman)
  # ========================================================================
  # Net price change / Sum of absolute candle-to-candle changes
  # Close to 1.0 = trending, close to 0 = ranging/choppy

  defp calculate_efficiency_ratio(prices) when length(prices) >= 2 do
    first_price = List.first(prices)
    last_price = List.last(prices)

    net_change = abs(last_price - first_price)

    sum_abs_changes =
      prices
      |> Enum.chunk_every(2, 1, :discard)
      |> Enum.reduce(0.0, fn [a, b], acc -> acc + abs(b - a) end)

    if sum_abs_changes > 0.0 do
      min(net_change / sum_abs_changes, 1.0)
    else
      0.0
    end
  end

  defp calculate_efficiency_ratio(_), do: 0.0

  # ========================================================================
  # DIRECTIONAL BIAS (ADX-like)
  # ========================================================================
  # Compare sum of positive vs negative price changes over the window.
  # High ratio = trending, low ratio = ranging.
  # Returns {bias 0-1, direction :up/:down/:flat}

  defp calculate_directional_bias(prices) when length(prices) >= 2 do
    changes =
      prices
      |> Enum.chunk_every(2, 1, :discard)
      |> Enum.map(fn [a, b] -> b - a end)

    positive_sum = changes |> Enum.filter(&(&1 > 0)) |> Enum.sum()
    negative_sum = changes |> Enum.filter(&(&1 < 0)) |> Enum.map(&abs/1) |> Enum.sum()

    total = positive_sum + negative_sum

    if total > 0.0 do
      bias = abs(positive_sum - negative_sum) / total

      direction =
        cond do
          positive_sum > negative_sum * 1.2 -> :up
          negative_sum > positive_sum * 1.2 -> :down
          true -> :flat
        end

      {min(bias, 1.0), direction}
    else
      {0.0, :flat}
    end
  end

  defp calculate_directional_bias(_), do: {0.0, :flat}

  # ========================================================================
  # VOLATILITY REGIME
  # ========================================================================
  # Compare recent ATR (last 5 candles) vs overall ATR (all candles).
  # If recent >> overall = volatile breakout.

  defp calculate_volatility_ratio(highs, lows, closes)
       when length(highs) >= 6 and length(lows) >= 6 and length(closes) >= 6 do
    overall_atr = calculate_atr(highs, lows, closes)
    n = length(highs)

    recent_highs = Enum.slice(highs, (n - 5)..(n - 1))
    recent_lows = Enum.slice(lows, (n - 5)..(n - 1))
    recent_closes = Enum.slice(closes, (n - 5)..(n - 1))

    recent_atr = calculate_atr(recent_highs, recent_lows, recent_closes)

    if overall_atr > 0.0 do
      recent_atr / overall_atr
    else
      1.0
    end
  end

  defp calculate_volatility_ratio(_, _, _), do: 1.0

  defp calculate_atr(highs, lows, closes) when length(highs) >= 2 do
    # True Range = max(high - low, |high - prev_close|, |low - prev_close|)
    prev_closes = Enum.slice(closes, 0..(length(closes) - 2))
    current_highs = Enum.slice(highs, 1..(length(highs) - 1))
    current_lows = Enum.slice(lows, 1..(length(lows) - 1))

    true_ranges =
      Enum.zip([current_highs, current_lows, prev_closes])
      |> Enum.map(fn {h, l, pc} ->
        hl = h - l
        hpc = abs(h - pc)
        lpc = abs(l - pc)
        Enum.max([hl, hpc, lpc])
      end)

    if length(true_ranges) > 0 do
      Enum.sum(true_ranges) / length(true_ranges)
    else
      0.0
    end
  end

  defp calculate_atr(_, _, _), do: 0.0

  # ========================================================================
  # REGIME CLASSIFICATION
  # ========================================================================

  defp classify_regime(efficiency_ratio, directional_bias, net_direction, volatility_ratio) do
    cond do
      # Volatile regime takes priority if recent volatility is much higher than normal
      volatility_ratio > 1.5 ->
        strength = min((volatility_ratio - 1.0) / 2.0, 1.0)
        {:volatile, strength}

      # Trending: high efficiency + clear directional bias
      efficiency_ratio > 0.3 and directional_bias > 0.6 ->
        strength = min((efficiency_ratio + directional_bias) / 2.0, 1.0)

        regime =
          case net_direction do
            :up -> :trending_up
            :down -> :trending_down
            :flat -> :ranging
          end

        {regime, strength}

      # Ranging: low efficiency ratio means price going nowhere
      efficiency_ratio < 0.15 ->
        strength = min((1.0 - efficiency_ratio) * 0.8, 1.0)
        {:ranging, strength}

      # Borderline cases — use best fit
      efficiency_ratio > 0.25 and directional_bias > 0.4 ->
        # Weakly trending
        strength = min((efficiency_ratio + directional_bias) / 3.0, 0.7)

        regime =
          case net_direction do
            :up -> :trending_up
            :down -> :trending_down
            :flat -> :ranging
          end

        {regime, strength}

      directional_bias < 0.3 ->
        # More ranging than trending
        strength = min((1.0 - directional_bias) * 0.5, 0.8)
        {:ranging, strength}

      true ->
        # Default: weak ranging
        {:ranging, 0.3}
    end
  end

  # ========================================================================
  # PRICE EXTRACTION HELPERS
  # ========================================================================

  defp extract_closes(candles) do
    Enum.map(candles, fn c ->
      case c.close do
        %Decimal{} = d -> Decimal.to_float(d)
        n when is_number(n) -> n * 1.0
        _ -> 0.0
      end
    end)
  end

  defp extract_highs(candles) do
    Enum.map(candles, fn c ->
      case c.high do
        %Decimal{} = d -> Decimal.to_float(d)
        n when is_number(n) -> n * 1.0
        _ -> 0.0
      end
    end)
  end

  defp extract_lows(candles) do
    Enum.map(candles, fn c ->
      case c.low do
        %Decimal{} = d -> Decimal.to_float(d)
        n when is_number(n) -> n * 1.0
        _ -> 0.0
      end
    end)
  end
end
