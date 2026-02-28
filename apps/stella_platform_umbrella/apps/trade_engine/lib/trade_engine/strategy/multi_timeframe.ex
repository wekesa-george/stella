defmodule TradeEngine.Strategy.MultiTimeframe do
  @moduledoc """
  ✅ ENHANCED MULTI-TIMEFRAME STRATEGY WITH DETAILED PHYSICS LOGGING
  
  CRITICAL FIXES FROM CODE 2:
  ✅ Direct BinanceClient.fetch_klines (no History module retries)
  ✅ Aggressive timeouts: 1s per TF, 4s total
  ✅ Parallel fetching with individual timeouts
  ✅ Hierarchical signal determination (macro→intermediate→trigger)
  ✅ Return partial results if some timeframes timeout
  
  ENHANCED LOGGING:
  ✅ Peak price + time to peak
  ✅ Dip price + time to dip
  ✅ Velocity % + Acceleration
  ✅ Signal classification + Current price
  ✅ Confidence scores per category
  """

  require Logger
  alias TradeEngine.Physics.Projectile

  @velocity_threshold_pct 0.0001  # Lowered from 0.0005 (0.01%)
  @min_r_squared 0.3              # Lowered from 0.4

  # ✅ COMBINED: All 7 timeframes with optimized candle counts
  @timeframes [
    %{name: "1d", candles: 20, weight: 0.20, category: :macro},
    %{name: "4h", candles: 12, weight: 0.20, category: :macro},
    %{name: "1h", candles: 12, weight: 0.18, category: :intermediate},
    %{name: "30m", candles: 12, weight: 0.18, category: :intermediate},
    %{name: "15m", candles: 20, weight: 0.12, category: :trigger},
    %{name: "5m", candles: 30, weight: 0.08, category: :trigger},
    %{name: "1m", candles: 15, weight: 0.04, category: :trigger}
  ]

  # ⚡ AGGRESSIVE TIMEOUTS (from Code 2)
  @per_timeframe_timeout_ms 1_000
  @total_analysis_timeout_ms 4_000
  @max_concurrent_timeframes 3
  @http_timeout_ms 2_000

  # ========== PUBLIC API ==========

  @doc """
  Analyze symbol across multiple timeframes with detailed logging
  Returns partial results if some timeframes timeout
  """
  def analyze_alignment(symbol, exchange, live_data \\ nil, order_book \\ nil) do
    if String.ends_with?(symbol, "USDC") do
      {:error, "USDC_skip"}
    else
      start_time = System.monotonic_time(:millisecond)
      
      task = Task.async(fn ->
        fetch_and_analyze_all_timeframes(symbol, exchange, live_data, order_book, start_time)
      end)

      case Task.yield(task, @total_analysis_timeout_ms) || Task.shutdown(task, :brutal_kill) do
        {:ok, {:ok, signal}} ->
          elapsed = System.monotonic_time(:millisecond) - start_time
          log_signal_summary(symbol, signal, elapsed)
          {:ok, signal}
        
        {:ok, {:error, reason}} ->
          Logger.warn("❌ #{symbol} analysis failed: #{reason}")
          {:error, reason}
        
        nil ->
          Logger.debug("⏭️ #{symbol} analysis timeout (#{@total_analysis_timeout_ms}ms)")
          {:error, "analysis_timeout"}
        
        {:exit, _} ->
          Logger.debug("⏭️ #{symbol} analysis crashed")
          {:error, "analysis_crash"}
      end
    end
  end

  @doc "Get individual timeframe analysis with detailed physics"
  def analyze_single_timeframe(symbol, exchange, timeframe, live_data \\ nil, order_book \\ nil) do
    tf_config = Enum.find(@timeframes, &(&1.name == timeframe))
    
    if tf_config do
      case fetch_klines_direct(symbol, timeframe, tf_config.candles) do
        {:ok, candles} when is_list(candles) and length(candles) > 0 ->
          series = add_live_candle(candles, live_data)
          
          case Projectile.analyze_with_flow(series, order_book) do
            {:ok, physics} ->
              analysis = build_analysis(physics, timeframe)
              log_timeframe_physics(symbol, timeframe, analysis, physics)
              {:ok, analysis}
            
            {:error, reason} -> 
              Logger.warn("Physics analysis failed for #{symbol}:#{timeframe} - #{inspect(reason)}")
              {:error, "physics_failed"}
          end
        
        {:error, reason} -> 
          Logger.warn("Klines fetch failed for #{symbol}:#{timeframe} - #{inspect(reason)}")
          {:error, reason}
        
        _ -> {:error, "fetch_failed"}
      end
    else
      {:error, "Unknown timeframe: #{timeframe}"}
    end
  end

  # ========== CORE ANALYSIS ==========

  defp fetch_and_analyze_all_timeframes(symbol, _exchange, live_data, order_book, start_time) do
    symbol_clean = symbol |> String.replace("/", "") |> String.upcase()

    # ⚡ Fetch all 7 timeframes in parallel (3 concurrent)
    results =
      @timeframes
      |> Task.async_stream(
        fn tf_config ->
          elapsed = System.monotonic_time(:millisecond) - start_time
          remaining = @total_analysis_timeout_ms - elapsed

          if remaining < 200 do
            {tf_config.name, {:error, "time_budget_exceeded"}, tf_config}
          else
            case fetch_and_analyze_single(symbol_clean, tf_config, live_data, order_book) do
              {:ok, analysis} -> {tf_config.name, analysis, tf_config}
              {:error, reason} -> {tf_config.name, {:error, reason}, tf_config}
            end
          end
        end,
        max_concurrency: @max_concurrent_timeframes,
        timeout: @per_timeframe_timeout_ms + 500
      )
      |> Enum.map(fn
        {:ok, result} -> result
        {:exit, _} -> nil
      end)
      |> Enum.filter(&(&1 != nil))

    # ⚡ Process whatever timeframes we got (min 2)
    analyzed_tfs =
      results
      |> Enum.map(fn {tf_name, result, tf_config} ->
        case result do
          {:error, _} -> nil
          analysis -> {tf_name, analysis, tf_config}
        end
      end)
      |> Enum.reject(&is_nil/1)

    if Enum.count(analyzed_tfs) >= 2 do
      signal = determine_hierarchical_signal(analyzed_tfs)
      current_price = get_current_price_from_analysis(analyzed_tfs)
      {:ok, Map.put(signal, :current_price, current_price)}
    else
      {:error, "insufficient_data (got #{Enum.count(analyzed_tfs)}, need 2+)"}
    end
  end

  # ⚡ Fetch + analyze single timeframe with timeout
  defp fetch_and_analyze_single(symbol, tf_config, live_data, order_book) do
    task = Task.async(fn ->
      case fetch_klines_direct(symbol, tf_config.name, tf_config.candles) do
        {:ok, candles} when is_list(candles) and length(candles) > 0 ->
          series = add_live_candle(candles, live_data)
          
          case Projectile.analyze_with_flow(series, order_book) do
            {:ok, physics} ->
              analysis = build_analysis(physics, tf_config.name)
              log_timeframe_physics(symbol, tf_config.name, analysis, physics)
              {:ok, analysis}
            
            {:error, _} -> {:error, "physics_failed"}
          end
        
        {:error, reason} -> {:error, reason}
        _ -> {:error, "invalid_response"}
      end
    end)

    case Task.yield(task, @per_timeframe_timeout_ms) || Task.shutdown(task, :brutal_kill) do
      {:ok, result} -> result
      nil -> {:error, "timeout"}
      {:exit, _} -> {:error, "crash"}
    end
  end

  # ⚡ Direct AlpacaClient call (NO History module retries)
  defp fetch_klines_direct(symbol, timeframe, limit) do
    task = Task.async(fn ->
      try do
        alpaca_timeframe = convert_timeframe_to_alpaca(timeframe)
        
        case TradeEngine.Orchestrator.Alpaca.Client.get_bars(symbol, alpaca_timeframe, limit) do
          {:ok, bars} when is_list(bars) ->
            formatted = Enum.map(bars, fn bar ->
              %{
                open: parse_decimal(bar["o"]),
                high: parse_decimal(bar["h"]),
                low: parse_decimal(bar["l"]),
                close: parse_decimal(bar["c"]),
                volume: parse_decimal(bar["v"] || 0),
                quote_asset_volume: parse_decimal(bar["v"] || 0),
                taker_buy_volume: parse_decimal(0),
                taker_buy_quote_volume: parse_decimal(0)
              }
            end)
            {:ok, formatted}
          
          {:error, reason} -> {:error, reason}
        end
      rescue
        _e -> {:error, "exception"}
      end
    end)

    case Task.yield(task, 800) || Task.shutdown(task, :brutal_kill) do
      {:ok, result} -> result
      nil -> {:error, "timeout"}
      {:exit, _} -> {:error, "crash"}
    end
  end

  # Convert Elixir timeframe format to Alpaca format
  defp convert_timeframe_to_alpaca(timeframe) do
    case timeframe do
      "1m" -> "1Min"
      "5m" -> "5Min"
      "15m" -> "15Min"
      "30m" -> "30Min"
      "1h" -> "1Hour"
      "4h" -> "4Hour"
      "1d" -> "1Day"
      other -> other
    end
  end

  defp add_live_candle(candles, nil), do: candles
  defp add_live_candle(candles, live_data) do
    live_candle = %{
      close: Decimal.from_float(live_data["current_price"] * 1.0),
      volume: Decimal.new(0),
      taker_buy_volume: Decimal.new(0)
    }
    candles ++ [live_candle]
  end

  # ========== SIGNAL DETERMINATION (from Code 2) ==========

  defp determine_hierarchical_signal(analyzed_timeframes) do
    macro_tfs = Enum.filter(analyzed_timeframes, fn {_name, _analysis, config} -> config.category == :macro end)
    intermediate_tfs = Enum.filter(analyzed_timeframes, fn {_name, _analysis, config} -> config.category == :intermediate end)
    trigger_tfs = Enum.filter(analyzed_timeframes, fn {_name, _analysis, config} -> config.category == :trigger end)

    macro_signal = get_category_consensus(macro_tfs)
    intermediate_signal = get_category_consensus(intermediate_tfs)
    trigger_signal = get_category_consensus(trigger_tfs)

    macro_confidence = calculate_category_confidence(macro_tfs)
    intermediate_confidence = calculate_category_confidence(intermediate_tfs)
    trigger_confidence = calculate_category_confidence(trigger_tfs)

    determine_final_signal(
      macro_signal, intermediate_signal, trigger_signal,
      macro_confidence, intermediate_confidence, trigger_confidence,
      analyzed_timeframes
    )
  end

  defp get_category_consensus(timeframes) do
    signals = Enum.map(timeframes, fn {_name, analysis, _config} -> analysis.signal end)
    
    bullish_count = Enum.count(signals, &(&1 == :bullish))
    bearish_count = Enum.count(signals, &(&1 == :bearish))
    total = Enum.count(signals)

    cond do
      bullish_count >= (total / 2 |> ceil) -> :bullish
      bearish_count >= (total / 2 |> ceil) -> :bearish
      true -> :neutral
    end
  end

  defp calculate_category_confidence(timeframes) do
    if Enum.empty?(timeframes) do
      0.0
    else
      Enum.reduce(timeframes, 0.0, fn {_name, analysis, _config}, acc ->
        acc + analysis.r_squared
      end) / Enum.count(timeframes)
    end
  end

  defp determine_final_signal(macro, intermediate, trigger, m_conf, i_conf, t_conf, all_tfs) do
    case {macro, intermediate, trigger} do
      {:bullish, :bullish, :bullish} ->
        %{
          direction: :bullish,
          strength: :very_strong,
          confidence: (m_conf * 0.3 + i_conf * 0.3 + t_conf * 0.4),
          macro_direction: macro,
          intermediate_direction: intermediate,
          trigger_direction: trigger,
          macro_confidence: m_conf,
          intermediate_confidence: i_conf,
          trigger_confidence: t_conf,
          details: build_signal_details(all_tfs)
        }

      {:bearish, :bearish, :bearish} ->
        %{
          direction: :bearish,
          strength: :very_strong,
          confidence: (m_conf * 0.3 + i_conf * 0.3 + t_conf * 0.4),
          macro_direction: macro,
          intermediate_direction: intermediate,
          trigger_direction: trigger,
          macro_confidence: m_conf,
          intermediate_confidence: i_conf,
          trigger_confidence: t_conf,
          details: build_signal_details(all_tfs)
        }

      {:bullish, :bullish, _} ->
        %{
          direction: :bullish,
          strength: :strong,
          confidence: (m_conf * 0.3 + i_conf * 0.4 + t_conf * 0.3),
          macro_direction: macro,
          intermediate_direction: intermediate,
          trigger_direction: trigger,
          macro_confidence: m_conf,
          intermediate_confidence: i_conf,
          trigger_confidence: t_conf,
          details: build_signal_details(all_tfs)
        }

      {:bearish, :bearish, _} ->
        %{
          direction: :bearish,
          strength: :strong,
          confidence: (m_conf * 0.3 + i_conf * 0.4 + t_conf * 0.3),
          macro_direction: macro,
          intermediate_direction: intermediate,
          trigger_direction: trigger,
          macro_confidence: m_conf,
          intermediate_confidence: i_conf,
          trigger_confidence: t_conf,
          details: build_signal_details(all_tfs)
        }

      {:bullish, :neutral, :bullish} ->
        %{
          direction: :bullish,
          strength: :moderate,
          confidence: (m_conf * 0.3 + i_conf * 0.3 + t_conf * 0.4),
          macro_direction: macro,
          intermediate_direction: intermediate,
          trigger_direction: trigger,
          macro_confidence: m_conf,
          intermediate_confidence: i_conf,
          trigger_confidence: t_conf,
          details: build_signal_details(all_tfs)
        }

      {:bearish, :neutral, :bearish} ->
        %{
          direction: :bearish,
          strength: :moderate,
          confidence: (m_conf * 0.3 + i_conf * 0.3 + t_conf * 0.4),
          macro_direction: macro,
          intermediate_direction: intermediate,
          trigger_direction: trigger,
          macro_confidence: m_conf,
          intermediate_confidence: i_conf,
          trigger_confidence: t_conf,
          details: build_signal_details(all_tfs)
        }

      {:bullish, :neutral, :neutral} ->
        %{
          direction: :bullish,
          strength: :setup_forming,
          confidence: m_conf * 0.5,
          macro_direction: macro,
          intermediate_direction: intermediate,
          trigger_direction: trigger,
          macro_confidence: m_conf,
          intermediate_confidence: i_conf,
          trigger_confidence: t_conf,
          details: build_signal_details(all_tfs)
        }

      {:bearish, :neutral, :neutral} ->
        %{
          direction: :bearish,
          strength: :setup_forming,
          confidence: m_conf * 0.5,
          macro_direction: macro,
          intermediate_direction: intermediate,
          trigger_direction: trigger,
          macro_confidence: m_conf,
          intermediate_confidence: i_conf,
          trigger_confidence: t_conf,
          details: build_signal_details(all_tfs)
        }

      _ ->
        %{
          direction: :neutral,
          strength: :no_signal,
          confidence: 0.0,
          macro_direction: macro,
          intermediate_direction: intermediate,
          trigger_direction: trigger,
          macro_confidence: m_conf,
          intermediate_confidence: i_conf,
          trigger_confidence: t_conf,
          details: build_signal_details(all_tfs)
        }
    end
  end

  defp build_signal_details(all_tfs) do
    Enum.map(all_tfs, fn {tf_name, analysis, config} ->
      %{
        timeframe: tf_name,
        category: config.category,
        signal: analysis.signal,
        r_squared: analysis.r_squared,
        velocity: analysis.v0,
        velocity_pct: analysis.velocity_pct,
        acceleration: analysis.acceleration,
        peak_price: analysis.peak_price,
        peak_time_ms: analysis.peak_time_ms,
        dip_price: analysis.dip_price,
        dip_time_ms: analysis.dip_time_ms,
        current_price: analysis.current_price,
        pressure_ratio: analysis.pressure_ratio,
        confidence: analysis.r_squared,
        targets: analysis.targets
      }
    end)
  end

  defp get_current_price_from_analysis(analyzed_timeframes) do
    case Enum.find(analyzed_timeframes, fn {_name, analysis, _config} -> analysis.current_price != 0.0 end) do
      {_name, analysis, _config} ->
        format_price(analysis.current_price)
      nil ->
        nil
    end
  end

  # ========== PHYSICS ANALYSIS BUILDING ==========

  defp build_analysis(physics, timeframe) do
    p0_float = to_float(physics.current_price)
    v_pct = if p0_float != 0, do: physics.velocity / p0_float, else: 0.0
    
    # Calculate peak/dip from candles if available
    {peak_price, peak_time_ms, dip_price, dip_time_ms} = 
      extract_peak_dip_info(physics)

    %{
      p0: physics.current_price,
      v0: physics.velocity,
      velocity_pct: v_pct,
      acceleration: physics.acceleration,
      r_squared: physics.r_squared,
      pressure_ratio: Map.get(physics, :pressure_ratio, 0.5),
      targets: physics.targets,
      timeframe: timeframe,
      signal: classify_signal(physics),
      current_price: physics.current_price,
      peak_price: peak_price,
      peak_time_ms: peak_time_ms,
      dip_price: dip_price,
      dip_time_ms: dip_time_ms
    }
  end

  defp extract_peak_dip_info(physics) do
    # Extract from physics candles if available
    candles = Map.get(physics, :candles, [])
    
    if Enum.empty?(candles) do
      {nil, nil, nil, nil}
    else
      closes = Enum.map(candles, &to_float/1)
      peak_price = Enum.max(closes)
      dip_price = Enum.min(closes)
      
      peak_idx = Enum.find_index(closes, &(&1 == peak_price)) || 0
      dip_idx = Enum.find_index(closes, &(&1 == dip_price)) || 0
      
      candle_duration_ms = 5 * 60 * 1000  # Approximate: 5m candle
      peak_time_ms = peak_idx * candle_duration_ms
      dip_time_ms = dip_idx * candle_duration_ms
      
      {peak_price, peak_time_ms, dip_price, dip_time_ms}
    end
  end

  defp classify_signal(physics) do
    p0_float = to_float(physics.current_price)
    v_pct = if p0_float != 0, do: physics.velocity / p0_float, else: 0.0

    cond do
      v_pct > @velocity_threshold_pct and physics.acceleration > 0 and physics.r_squared > @min_r_squared -> 
        :bullish
      
      v_pct < -@velocity_threshold_pct and physics.acceleration < 0 and physics.r_squared > @min_r_squared -> 
        :bearish
      
      v_pct > @velocity_threshold_pct and physics.acceleration < 0 -> 
        :weak_bullish
      
      v_pct < -@velocity_threshold_pct and physics.acceleration > 0 -> 
        :weak_bearish
      
      true -> 
        :neutral
    end
  end

  # ========== LOGGING ==========

  defp log_timeframe_physics(symbol, timeframe, analysis, _physics) do
    IO.puts("""
    
    ═══════════════════════════════════════════════════════════════
    📊 #{symbol} [#{timeframe}]
    ═══════════════════════════════════════════════════════════════
    💰 Current Price: #{format_price(analysis.current_price)}
    📈 Velocity: #{Float.round(analysis.v0, 8)} (#{Float.round(analysis.velocity_pct * 100, 4)}%)
    ⚡ Acceleration: #{Float.round(analysis.acceleration, 8)}
    📉 R² (Fit): #{Float.round(analysis.r_squared, 4)}
    🎯 Signal: #{inspect(analysis.signal)}
    
    📍 Peak/Dip:
    🔺 Peak: #{format_price(analysis.peak_price)} @ #{analysis.peak_time_ms}ms
    🔻 Dip: #{format_price(analysis.dip_price)} @ #{analysis.dip_time_ms}ms
    ═══════════════════════════════════════════════════════════════
    """)
  end

  defp log_signal_summary(symbol, signal, elapsed) do
    IO.puts("""
    
    ✅ FINAL SIGNAL - #{symbol} (#{elapsed}ms)
    ════════════════════════════════════════════════
    Direction: #{inspect(signal.direction)} 
    Strength: #{inspect(signal.strength)}
    Confidence: #{Float.round(signal.confidence * 100, 2)}%
    
    📊 Hierarchy:
    🔴 Macro: #{inspect(signal.macro_direction)} (#{Float.round(signal.macro_confidence * 100, 1)}%)
    🟠 Intermediate: #{inspect(signal.intermediate_direction)} (#{Float.round(signal.intermediate_confidence * 100, 1)}%)
    🟡 Trigger: #{inspect(signal.trigger_direction)} (#{Float.round(signal.trigger_confidence * 100, 1)}%)
    
    💰 Current Price: #{signal.current_price}
    📈 Timeframes Analyzed: #{Enum.count(signal.details)}
    
    📍 Details by Timeframe:
    #{format_details(signal.details)}
    ════════════════════════════════════════════════
    """)
  end

  defp format_details(details) do
    Enum.map_join(details, "\n", fn d ->
      """
      #{d.timeframe}:
        Signal: #{inspect(d.signal)} | R²: #{Float.round(d.r_squared, 4)} | Vel: #{Float.round(d.velocity_pct * 100, 4)}%
        Accel: #{Float.round(d.acceleration, 8)} | Peak: #{format_price(d.peak_price)} | Dip: #{format_price(d.dip_price)}
      """
    end)
  end

  # ========== HELPERS ==========

  defp to_float(value) when is_float(value), do: value
  defp to_float(value) when is_number(value), do: value / 1.0
  defp to_float(%Decimal{} = dec), do: Decimal.to_float(dec)
  defp to_float(_), do: 0.0

  defp format_price(nil), do: "N/A"
  defp format_price(price) do
    p = to_float(price)
    cond do
      p >= 100 -> "$#{Float.round(p, 2)}"
      p >= 1 -> "$#{Float.round(p, 4)}"
      true -> "$#{Float.round(p, 8)}"
    end
  end

  defp parse_decimal(value) when is_float(value) do
    Decimal.from_float(value)
  end

  defp parse_decimal(value) when is_binary(value) do
    case Decimal.parse(value) do
      {decimal, ""} -> decimal
      :error -> Decimal.new("0")
    end
  end

  defp parse_decimal(value) when is_integer(value) do
    Decimal.new(value)
  end

  defp parse_decimal(value) do
    case Decimal.cast(value) do
      {:ok, decimal} -> decimal
      :error -> Decimal.new("0")
    end
  end

  # ========== CONFIG ==========

  def get_timeframes do
    @timeframes
  end

  def get_timeframe_config(tf_name) do
    Enum.find(@timeframes, &(&1.name == tf_name))
  end
end