defmodule TradeEngine.AI.Bridge do
  @moduledoc """
  Bridge module connecting MarginScalper to the RL Brain.

  This module provides the `consult_rl_brain/2` function that replaces
  or augments the existing physics-based signal filtering with AI decisions.

  ## Integration Modes

  1. **Replacement Mode**: AI completely replaces physics filtering
  2. **Augmentation Mode**: AI confirms/overrides physics decisions
  3. **Shadow Mode**: AI runs in parallel for comparison (no effect on trades)

  ## Usage in MarginScalper

  ```elixir
  # In process_signal/2 or similar:
  case TradeEngine.AI.Bridge.consult_rl_brain(signal, state) do
    {:trade, :long, confidence} -> 
      open_position(:long, signal, confidence, state)
    {:trade, :short, confidence} -> 
      open_position(:short, signal, confidence, state)
    {:hold, reason} -> 
      {:noreply, state}
  end
  ```
  """

  alias TradeEngine.AI.{Brain, FeatureExtractor}
  require Logger

  # Minimum confidence to execute a trade
  @min_trade_confidence 0.65
  
  # Shadow mode - AI runs but doesn't affect trades (for comparison)
  @shadow_mode false

  @doc """
  Consult the RL Brain for a trading decision.

  ## Parameters
  - `signal` - The physics signal from candle analysis
  - `state` - Current MarginScalper state (for position context)

  ## Returns
  - `{:trade, :long | :short, confidence}` - Execute trade
  - `{:hold, reason}` - Do not trade
  - `{:error, reason}` - Brain error (fallback to physics)
  """
  @spec consult_rl_brain(map(), map()) :: 
    {:trade, :long | :short, float()} | 
    {:hold, atom()} | 
    {:error, term()}
  def consult_rl_brain(signal, state) do
    # Find existing position for this symbol (if any)
    position = find_position(signal, state)
    
    # Extract features for AI
    features = FeatureExtractor.extract(signal, position)
    
    # Add context about existing positions
    features = Map.put(features, :has_position, not is_nil(position))
    
    case Brain.decide(features) do
      {:ok, decision} ->
        process_decision(decision, signal, state)
        
      {:error, reason} ->
        Logger.warning("[AI.Bridge] Brain error: #{inspect(reason)}")
        {:error, reason}
    end
  end

  @doc """
  Synchronous version for hot path (avoids GenServer call overhead).
  Use when microseconds matter.
  """
  @spec consult_rl_brain_sync(map(), map()) :: 
    {:trade, :long | :short, float()} | {:hold, atom()}
  def consult_rl_brain_sync(signal, state) do
    position = find_position(signal, state)
    features = FeatureExtractor.extract(signal, position)
    
    case Brain.decide_sync(features) do
      {:ok, decision} -> process_decision(decision, signal, state)
      _ -> {:hold, :brain_unavailable}
    end
  end

  @doc """
  Record the outcome of a trade for training data collection.
  Call this when a position is closed.
  """
  @spec record_trade_outcome(map(), map(), float()) :: :ok
  def record_trade_outcome(entry_signal, exit_info, pnl) do
    features = FeatureExtractor.from_signal_map(entry_signal)
    
    # Determine what action was taken
    action = case entry_signal[:direction] || entry_signal["direction"] do
      d when d in [:long, "long"] -> :long
      d when d in [:short, "short"] -> :short
      _ -> :hold
    end
    
    # Calculate reward based on PnL and efficiency
    reward = calculate_reward(pnl, exit_info)
    
    Brain.record_outcome(features, action, reward)
  end

  @doc """
  Get comparison stats between AI and physics decisions.
  Useful for validating AI before going live.
  """
  @spec comparison_stats() :: map()
  def comparison_stats do
    case Brain.status() do
      %{mode: :inference} = status ->
        Map.merge(status, %{
          ai_active: true,
          shadow_mode: @shadow_mode
        })
      status ->
        Map.merge(status, %{
          ai_active: false,
          training_mode: true
        })
    end
  end

  # ============================================================================
  # Private Functions
  # ============================================================================

  defp process_decision(decision, signal, _state) do
    %{action: action, confidence: confidence, mode: mode} = decision
    
    # Log AI decision for monitoring
    log_decision(decision, signal)
    
    # Shadow mode - return hold but log what AI would have done
    if @shadow_mode do
      Logger.debug("[AI.Bridge] SHADOW: Would #{action} with #{Float.round(confidence * 100, 1)}% confidence")
      {:hold, :shadow_mode}
    else
      case action do
        :hold ->
          {:hold, :ai_hold}
          
        direction when direction in [:long, :short] ->
          if confidence >= @min_trade_confidence do
            {:trade, direction, confidence}
          else
            {:hold, :low_confidence}
          end
      end
    end
  end

  defp find_position(signal, state) do
    symbol = signal[:symbol] || signal["symbol"]
    positions = state[:positions] || state.positions || []
    
    Enum.find(positions, fn pos ->
      pos_symbol = pos[:symbol] || pos.symbol
      pos_symbol == symbol
    end)
  end

  defp calculate_reward(pnl, exit_info) do
    # Base reward from P&L (scaled)
    base_reward = cond do
      pnl > 0 -> min(pnl / 10.0, 1.0)  # Cap positive reward at 1.0
      pnl < 0 -> max(pnl / 10.0, -1.0)  # Cap negative reward at -1.0
      true -> 0.0
    end
    
    # Bonus for efficient exits (hitting take-profit)
    exit_type = exit_info[:exit_type] || exit_info["exit_type"]
    efficiency_bonus = case exit_type do
      :take_profit -> 0.2
      :trailing_stop -> 0.1
      :stop_loss -> -0.1
      :timeout -> -0.05
      _ -> 0.0
    end
    
    # Final reward clamped to [-1, 1]
    (base_reward + efficiency_bonus)
    |> max(-1.0)
    |> min(1.0)
  end

  defp log_decision(decision, signal) do
    symbol = signal[:symbol] || signal["symbol"]
    
    Logger.debug(
      "[AI.Bridge] #{symbol} -> #{decision.action} " <>
      "(#{Float.round(decision.confidence * 100, 1)}% | #{decision.mode})"
    )
  end
end