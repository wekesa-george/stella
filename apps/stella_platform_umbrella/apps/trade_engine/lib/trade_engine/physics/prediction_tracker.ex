defmodule TradeEngine.Physics.PredictionTracker do
  @moduledoc """
  📊 STEP 4: Prediction Accuracy Tracking
  
  Compares predicted prices (from signal) to actual market prices
  Validates physics model accuracy
  """

  use GenServer
  require Logger

  alias TradeEngine.Exchanges.Binance.TickerStream

  @pubsub TradeEngine.PubSub

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def get_tracking_stats do
    GenServer.call(__MODULE__, :get_stats, 10_000)
  end

  def get_symbol_accuracy(symbol) do
    GenServer.call(__MODULE__, {:get_symbol_accuracy, symbol}, 10_000)
  end

  # ========================================================================
  # GENSERVER INIT
  # ========================================================================

  @impl true
  def init(_opts) do
    Logger.info("""
    
    📊 PREDICTION TRACKER INITIALIZED - STEP 4
    ═════════════════════════════════════════════════════════════════
    Tracking prediction accuracy in real-time
    Comparing predicted vs actual prices at: 5m, 15m, 30m, 60m intervals
    ═════════════════════════════════════════════════════════════════
    """)

    # Subscribe to price updates
    Phoenix.PubSub.subscribe(@pubsub, "signals:all")
    Phoenix.PubSub.subscribe(@pubsub, "ticker:update")

    state = %{
      signals: %{},           # Current signals by symbol
      predictions: %{},       # Predictions by symbol
      accuracy_data: %{},     # Historical accuracy
      started_at: DateTime.utc_now()
    }

    {:ok, state}
  end

  # ========================================================================
  # GENSERVER HANDLERS
  # ========================================================================

  @impl true
  def handle_call(:get_stats, _from, state) do
    stats = calculate_overall_stats(state.accuracy_data)
    {:reply, stats, state}
  end

  @impl true
  def handle_call({:get_symbol_accuracy, symbol}, _from, state) do
    accuracy = Map.get(state.accuracy_data, String.upcase(symbol))
    {:reply, accuracy, state}
  end

  # ========================================================================
  # PUBSUB HANDLERS
  # ========================================================================

  @impl true
  def handle_info({:signal, signal}, state) do
    symbol = signal.symbol
    
    # Store the signal with timestamp
    signal_data = %{
      symbol: symbol,
      timestamp: DateTime.utc_now(),
      current_price: signal.current_price,
      momentum: signal.momentum,
      direction: signal.direction,
      confidence: signal.confidence,
      
      # Predictions
      predictions: %{
        "5m" => signal.target_5m,
        "15m" => signal.target_15m,
        "30m" => signal.target_30m,
        "60m" => signal.target_60m
      },
      
      # Energy zones
      balance_point: signal.balance_point,
      energy_zones: signal.energy_zones,
      
      # Track results
      results: %{}  # Will be filled as prices come in
    }

    new_signals = Map.put(state.signals, symbol, signal_data)
    new_predictions = schedule_predictions(symbol, signal_data)

    Logger.info("📊 [#{symbol}] Stored signal for accuracy tracking")
    Logger.info("   Predictions: 5m=$#{signal.target_5m}, 15m=$#{signal.target_15m}, 30m=$#{signal.target_30m}, 60m=$#{signal.target_60m}")

    {:noreply, %{state | signals: new_signals, predictions: new_predictions}}
  end

  @impl true
  def handle_info({:ticker_update, ticker}, state) do
    symbol = ticker.symbol
    current_price = ticker.last_price

    case Map.get(state.signals, symbol) do
      nil ->
        {:noreply, state}

      signal_data ->
        updated_signal = evaluate_predictions(signal_data, current_price)
        updated_accuracy = update_accuracy_data(state.accuracy_data, symbol, updated_signal)
        updated_signals = Map.put(state.signals, symbol, updated_signal)

        {:noreply, %{state | signals: updated_signals, accuracy_data: updated_accuracy}}
    end
  end

  def handle_info(_msg, state), do: {:noreply, state}

  # ========================================================================
  # PREDICTION SCHEDULING
  # ========================================================================

  defp schedule_predictions(symbol, signal_data) do
    # Schedule checks at 5m, 15m, 30m, 60m intervals
    # In real system, use Process.send_after/3
    
    %{
      symbol: symbol,
      created_at: DateTime.utc_now(),
      checks: %{
        "5m" => nil,
        "15m" => nil,
        "30m" => nil,
        "60m" => nil
      }
    }
  end

  # ========================================================================
  # EVALUATE PREDICTIONS vs ACTUAL
  # ========================================================================

  defp evaluate_predictions(signal_data, actual_price) do
    predictions = signal_data.predictions
    signal_time = signal_data.timestamp
    now = DateTime.utc_now()
    
    # Calculate elapsed time in minutes
    elapsed_minutes = DateTime.diff(now, signal_time, :second) / 60

    # Check which predictions are now due
    results = Enum.reduce(["5m", "15m", "30m", "60m"], signal_data.results, fn timeframe, acc ->
      {minutes, _} = Integer.parse(timeframe)
      
      if elapsed_minutes >= minutes and not Map.has_key?(acc, timeframe) do
        predicted_price = predictions[timeframe]
        
        # Calculate accuracy
        accuracy = calculate_accuracy(predicted_price, actual_price)
        direction_correct = check_direction(predicted_price, actual_price, signal_data.direction)
        error_percent = ((actual_price - predicted_price) / predicted_price) * 100
        
        result = %{
          predicted: predicted_price,
          actual: actual_price,
          accuracy: accuracy,
          error_percent: Float.round(error_percent, 2),
          direction_correct: direction_correct,
          checked_at: now
        }
        
        Logger.info("""
        ✅ [#{signal_data.symbol}] #{timeframe} Prediction Result
           Predicted: $#{predicted_price}
           Actual: $#{actual_price}
           Accuracy: #{accuracy}%
           Error: #{error_percent}%
           Direction: #{if direction_correct, do: "✅ CORRECT", else: "❌ WRONG"}
        """)
        
        Map.put(acc, timeframe, result)
      else
        acc
      end
    end)

    Map.put(signal_data, :results, results)
  end

  # ========================================================================
  # ACCURACY CALCULATIONS
  # ========================================================================

  @doc """
  Calculate accuracy as percentage match
  100% = exact match
  0% = completely wrong
  """
  defp calculate_accuracy(predicted, actual) when predicted > 0 and actual > 0 do
    error = abs(actual - predicted) / predicted
    accuracy = max(0, (1 - error) * 100)
    Float.round(accuracy, 1)
  end
  defp calculate_accuracy(_, _), do: 0.0

  @doc """
  Check if predicted direction matches actual movement
  """
  defp check_direction(predicted, actual, direction) do
    case direction do
      :long -> actual > predicted  # Should go UP
      :short -> actual < predicted  # Should go DOWN
      :neutral -> true  # Always correct for neutral
    end
  end

  # ========================================================================
  # ACCURACY DATA AGGREGATION
  # ========================================================================

  defp update_accuracy_data(accuracy_data, symbol, signal_data) do
    symbol_upper = String.upcase(symbol)
    
    # Calculate accuracy metrics for this signal
    results = signal_data.results
    
    if map_size(results) > 0 do
      accuracies = Enum.map(results, fn {_timeframe, result} ->
        result.accuracy
      end)
      
      avg_accuracy = Enum.sum(accuracies) / length(accuracies)
      
      current_data = Map.get(accuracy_data, symbol_upper, %{
        total_signals: 0,
        successful_predictions: 0,
        accuracy_history: [],
        avg_accuracy: 0.0
      })
      
      successful = Enum.count(results, fn {_tf, result} ->
        result.accuracy >= 80.0
      end)
      
      updated = %{
        symbol: symbol_upper,
        total_signals: current_data.total_signals + 1,
        successful_predictions: current_data.successful_predictions + successful,
        accuracy_history: [avg_accuracy | current_data.accuracy_history],
        avg_accuracy: Float.round(Enum.sum(accuracies) / length(accuracies), 1),
        latest_results: results,
        last_updated: DateTime.utc_now()
      }
      
      Map.put(accuracy_data, symbol_upper, updated)
    else
      accuracy_data
    end
  end

  # ========================================================================
  # OVERALL STATS CALCULATION
  # ========================================================================

  defp calculate_overall_stats(accuracy_data) when map_size(accuracy_data) == 0 do
    %{
      status: "No accuracy data yet",
      total_symbols: 0,
      total_signals: 0,
      avg_accuracy: 0.0,
      by_symbol: %{}
    }
  end

  defp calculate_overall_stats(accuracy_data) do
    symbol_stats = Enum.map(accuracy_data, fn {symbol, data} ->
      {symbol, data}
    end)

    total_signals = Enum.reduce(symbol_stats, 0, fn {_sym, data}, acc ->
      acc + data.total_signals
    end)

    total_successful = Enum.reduce(symbol_stats, 0, fn {_sym, data}, acc ->
      acc + data.successful_predictions
    end)

    avg_accuracy = if total_signals > 0 do
      all_accuracies = Enum.flat_map(symbol_stats, fn {_sym, data} ->
        data.accuracy_history
      end)
      Enum.sum(all_accuracies) / length(all_accuracies)
    else
      0.0
    end

    success_rate = if total_signals > 0 do
      (total_successful / (total_signals * 4)) * 100  # 4 predictions per signal
    else
      0.0
    end

    by_symbol_map = Enum.into(symbol_stats, %{}, fn {symbol, data} ->
      {symbol, %{
        total: data.total_signals,
        successful: data.successful_predictions,
        accuracy: Float.round(data.avg_accuracy, 1)
      }}
    end)

    %{
      status: "Tracking #{map_size(accuracy_data)} symbols",
      total_symbols: map_size(accuracy_data),
      total_signals: total_signals,
      total_predictions: total_signals * 4,
      successful_predictions: total_successful,
      avg_accuracy: Float.round(avg_accuracy, 1),
      success_rate: Float.round(success_rate, 1),
      by_symbol: by_symbol_map,
      last_updated: DateTime.utc_now()
    }
  end
end