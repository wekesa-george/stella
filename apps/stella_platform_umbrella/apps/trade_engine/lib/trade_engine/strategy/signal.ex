defmodule TradeEngine.Strategy.Signal do
  @moduledoc """
  Advanced Signal Classification for Physics-Based Trading.
  Transforms raw kinematic data (Velocity, Acceleration, Pressure) into 
  actionable trading contexts (Rocket, Exhaustion, Bull Trap, etc.).
  
  Updated to use the Financial Physics Engine (Phase 3).
  """

  alias TradeEngine.Physics.Engine
  alias TradeEngine.Physics.Constants

  @doc """
  Analyzes market physics to determine the trading signal and context.
  Now accepts raw candles to perform full physics extraction.
  """
  def analyze_candles(candles) do
    # Use the new Physics Engine to generate signal
    engine_signal = Engine.generate_entry_signal(candles)
    
    if engine_signal.valid do
      %{
        signal: engine_signal.direction,
        context: determine_context(engine_signal),
        score: engine_signal.confidence,
        reason: "Physics validation passed. #{engine_signal.direction} momentum.",
        metadata: engine_signal
      }
    else
      %{
        signal: :neutral,
        context: "WAIT",
        score: 0,
        reason: engine_signal.reason,
        metadata: engine_signal
      }
    end
  end

  @doc """
  Legacy analyzer for backward compatibility.
  """
  def analyze(v0, a, pressure, current_price, target_30m) do
    # 1. Determine Kinematic State (Motion)
    motion_state = classify_motion(v0, a)
    
    # 2. Determine Order Flow State (Fuel)
    flow_state = classify_flow(pressure)
    
    # 3. Check for Divergence
    macro_slope = (target_30m - current_price) / 30.0
    divergence = check_divergence(v0, macro_slope)

    # 4. Synthesize Signal
    {signal, context, reason} = synthesize(motion_state, flow_state, divergence, a)
    
    # 5. Calculate Numeric Score
    score = calculate_score(signal, v0, a, pressure)

    %{
      signal: signal,
      context: context,
      score: score,
      reason: reason
    }
  end

  defp determine_context(signal) do
    # Map Engine signal to context string
    case signal.direction do
      :bullish -> 
        if signal.confidence > 80, do: "🚀 ROCKET", else: "📈 UPTREND"
      :bearish ->
        if signal.confidence > 80, do: "💧 WATERFALL", else: "📉 DOWNTREND"
      _ -> "➡️ CHOP"
    end
  end

  # --- 1. Kinematic Classification ---
  defp classify_motion(v, a) do
    cond do
      v > 0 and a > 0 -> :accelerating_up   # Rocket
      v > 0 and a < 0 -> :decelerating_up   # Ball thrown up (Gravity fighting)
      v < 0 and a < 0 -> :accelerating_down # Waterfall
      v < 0 and a > 0 -> :decelerating_down # Bungee jump (Support fighting)
      true -> :neutral
    end
  end

  # --- 2. Flow Classification ---
  defp classify_flow(p) do
    cond do
      p >= 0.60 -> :strong_buying
      p >= 0.52 -> :buying
      p <= 0.40 -> :strong_selling
      p <= 0.48 -> :selling
      true -> :neutral
    end
  end

  # --- 3. Divergence Check ---
  defp check_divergence(v_now, v_macro) do
    cond do
      v_now > 0 and v_macro < 0 -> :bearish_divergence # Going up now, but 30m target is lower
      v_now < 0 and v_macro > 0 -> :bullish_divergence # Going down now, but 30m target is higher
      true -> :aligned
    end
  end

  # --- 4. Synthesis Logic (The Brain) ---
  
  # SCENARIO A: ROCKET (Up & Speeding Up)
  defp synthesize(:accelerating_up, :strong_buying, :aligned, _) do
    {:strong_bullish, "🚀 ROCKET", "Price accelerating UP with strong buying pressure."}
  end
  
  # SCENARIO B: EXHAUSTION (Up but Heavy Gravity)
  # High negative acceleration indicates a wall
  defp synthesize(:decelerating_up, _, :bearish_divergence, a) when a < -0.05 do
    {:weak_bearish, "🧱 EXHAUSTION WALL", "Price rising but hitting heavy resistance. 30m target is lower."}
  end
  
  # SCENARIO C: BULL TRAP (Up but No Fuel)
  defp synthesize(:decelerating_up, :selling, _, _) do
    {:bearish, "⚠️ BULL TRAP", "Price floating up on low volume. Sellers are in control."}
  end

  # SCENARIO D: STANDARD PULLBACK (Up, Slowing, but Flow is Good)
  defp synthesize(:decelerating_up, :buying, :aligned, _) do
    {:bullish, "🪂 GLIDE", "Upward trend slowing naturally, but buyers still present."}
  end

  # SCENARIO E: WATERFALL (Down & Speeding Down)
  defp synthesize(:accelerating_down, :strong_selling, :aligned, _) do
    {:strong_bearish, "💧 WATERFALL", "Price crashing with increasing speed and selling pressure."}
  end

  # SCENARIO F: CATCHING KNIFE (Down but Decelerating)
  defp synthesize(:decelerating_down, :strong_buying, :bullish_divergence, _) do
    {:weak_bullish, "✋ ABSORPTION", "Selling absorbing into buy wall. Decelerating drop."}
  end

  # Defaults / Fallbacks
  defp synthesize(:accelerating_up, _, _, _), do: {:bullish, "📈 BREAKOUT", "Accelerating upwards."}
  defp synthesize(:accelerating_down, _, _, _), do: {:bearish, "📉 DUMP", "Accelerating downwards."}
  defp synthesize(:decelerating_up, _, _, _), do: {:weak_bullish, "∩ TOPPING", "Upward momentum fading."}
  defp synthesize(:decelerating_down, _, _, _), do: {:weak_bearish, "∪ BOTTOMING", "Downward momentum fading."}
  defp synthesize(_, _, _, _), do: {:neutral, "➡️ CHOP", "No clear physics signal."}

  # --- 5. Scoring ---
  defp calculate_score(signal, v, a, p) do
    base = case signal do
      :strong_bullish -> 90
      :bullish -> 70
      :weak_bullish -> 40
      :neutral -> 0
      :weak_bearish -> -40
      :bearish -> -70
      :strong_bearish -> -90
    end
    
    # Adjust based on raw physics intensity
    # If Order Flow is massive (>70% or <30%), boost score
    flow_boost = if p > 0.7 or p < 0.3, do: 10, else: 0
    
    # If Acceleration is massive, boost score (confirms trend strength)
    acc_boost = if abs(a) > 0.1, do: 5, else: 0

    base + flow_boost + acc_boost
  end
end