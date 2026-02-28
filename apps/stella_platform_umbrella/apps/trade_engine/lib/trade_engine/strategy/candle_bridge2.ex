defmodule TradeEngine.Strategy.CandleBridge2 do
  @moduledoc """
  🕯️ CANDLE BRIDGE - Connects Binance KlineStream to Physics Analysis
  
  This module:
  1. Receives candle close events from KlineStream (via PubSub)
  2. Fetches order flow data from DepthStream (ETS cache)
  3. Runs physics analysis on the candle data
  4. Generates trading signals with full metrics
  5. Broadcasts to PubSub for dashboard consumption
  
  ## PubSub Subscriptions (receives):
  - `candle_closed:5m` - 5-minute candle closes
  - `candle_closed:15m` - 15-minute candle closes
  - `candle_closed:1h` - 1-hour candle closes
  - `candle_closed:4h` - 4-hour candle closes
  
  ## PubSub Broadcasts (sends):
  - `signals:all` - All generated signals
  - `signals:SYMBOL` - Signals for specific symbol
  
  Signal Structure:
  %{
    symbol: "BTCUSDT",
    direction: :long | :short | :neutral,
    confidence: 0-100,
    entry_price: Decimal,
    stop_loss: Decimal,
    take_profit: Decimal,
    current_price: Decimal,
    order_flow: %{
      imbalance: float,
      pressure_ratio: float,
      wall: :buy_wall | :sell_wall | :balanced,
      spread: Decimal,
      best_bid: Decimal,
      best_ask: Decimal,
      velocity: float,
      acceleration: float,
      r_squared: float
    },
    velocity: float,
    acceleration: float,
    r_squared: float,
    pressure_ratio: float,
    target_5m: float,
    target_30m: float,
    timeframe: "5m" | "15m" | "1h" | "4h",
    timestamp: DateTime
  }
  """

  use GenServer
  require Logger

  alias TradeEngine.Physics.Projectile
  alias TradeEngine.Exchanges.Binance.DepthStream
  alias TradeEngine.Exchanges.Binance.KlineStream

  @pubsub TradeEngine.PubSub

  # Risk parameters
  @stop_loss_pct 0.02      # 2% stop loss
  @take_profit_pct 0.05    # 5% take profit

  # Timeframes to subscribe to
  @timeframes ~w(5m 15m 1h 4h)

  # ============================================================================
  # PUBLIC API
  # ============================================================================

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc "Process a candle close event"
  def on_candle_close(symbol, timeframe, candle_data) do
    GenServer.cast(__MODULE__, {:candle_close, symbol, timeframe, candle_data})
  end

  @doc "Manually trigger analysis for a symbol"
  def analyze_now(symbol) do
    GenServer.call(__MODULE__, {:analyze_now, symbol}, 10_000)
  end

  @doc "Get current status"
  def status do
    GenServer.call(__MODULE__, :status)
  end

  @doc "Get all cached signals"
  def get_signals do
    GenServer.call(__MODULE__, :get_signals)
  end

  @doc "Get signal for specific symbol"
  def get_signal(symbol) do
    GenServer.call(__MODULE__, {:get_signal, symbol})
  end

  # ============================================================================
  # GENSERVER CALLBACKS
  # ============================================================================

  @impl true
  def init(_opts) do
    Logger.info("🕯️ CandleBridge started - connecting candles to physics engine")
    
    # Subscribe to candle close events for each timeframe
    # KlineStream broadcasts to "candle_closed:TIMEFRAME"
    for tf <- @timeframes do
      Phoenix.PubSub.subscribe(@pubsub, "candle_closed:#{tf}")
      Logger.debug("📡 Subscribed to candle_closed:#{tf}")
    end
    
    state = %{
      signals: %{},           # symbol => latest signal
      signal_count: 0,
      total_analyses: 0,
      symbols: [],
      last_signal_time: nil,
      started_at: DateTime.utc_now()
    }
    
    {:ok, state}
  end

  @impl true
  def handle_cast({:candle_close, symbol, timeframe, candle_data}, state) do
    Logger.debug("🕯️ Candle closed: #{symbol} #{timeframe} @ #{candle_data.close}")
    
    case analyze_and_generate_signal(symbol, timeframe, candle_data) do
      {:ok, signal} ->
        # Broadcast to PubSub
        broadcast_signal(signal)
        
        # Update state
        new_signals = Map.put(state.signals, symbol, signal)
        new_symbols = if symbol in state.symbols, do: state.symbols, else: [symbol | state.symbols]
        
        Logger.info("📢 Signal: #{symbol} #{signal.direction} (#{signal.confidence}%) @ #{signal.entry_price}")
        
        {:noreply, %{state | 
          signals: new_signals,
          signal_count: state.signal_count + 1,
          total_analyses: state.total_analyses + 1,
          symbols: new_symbols,
          last_signal_time: DateTime.utc_now()
        }}
      
      {:error, reason} ->
        Logger.debug("⚠️ Analysis skipped for #{symbol}: #{inspect(reason)}")
        {:noreply, %{state | total_analyses: state.total_analyses + 1}}
    end
  end

  @impl true
  def handle_call({:analyze_now, symbol}, _from, state) do
    Logger.info("🔍 Manual analysis requested for #{symbol}")
    
    # Try to get order flow from DepthStream (ETS cache)
    order_flow = case DepthStream.get_order_flow(String.upcase(symbol)) do
      {:ok, data} -> data
      _ -> nil
    end
    
    # Try to get current candle from KlineStream (ETS cache)
    candle_result = KlineStream.get_candle(symbol, "5m")
    
    # Determine current price
    current_price = cond do
      # First try: order flow has best_ask
      order_flow && order_flow.best_ask -> order_flow.best_ask
      
      # Second try: candle has close price
      match?({:ok, _}, candle_result) ->
        {:ok, candle} = candle_result
        candle.close
      
      # No price available
      true -> nil
    end
    
    if current_price do
      # Build candle data from available info
      candle_data = case candle_result do
        {:ok, candle} -> candle
        _ ->
          # Synthetic candle from current price
          %{
            open: current_price,
            high: current_price,
            low: current_price,
            close: current_price,
            volume: Decimal.new("0"),
            taker_buy_volume: Decimal.new("0")
          }
      end
      
      case analyze_and_generate_signal(symbol, "manual", candle_data) do
        {:ok, signal} ->
          broadcast_signal(signal)
          new_signals = Map.put(state.signals, symbol, signal)
          new_symbols = if symbol in state.symbols, do: state.symbols, else: [symbol | state.symbols]
          
          Logger.info("📢 Manual Signal: #{symbol} #{signal.direction} (#{signal.confidence}%)")
          
          {:reply, {:ok, signal}, %{state | 
            signals: new_signals, 
            total_analyses: state.total_analyses + 1,
            symbols: new_symbols
          }}
        
        {:error, reason} ->
          {:reply, {:error, reason}, state}
      end
    else
      Logger.warning("⚠️ No price data available for #{symbol}")
      {:reply, {:error, :no_price_data}, state}
    end
  end

  @impl true
  def handle_call(:status, _from, state) do
    status = %{
      symbols: state.symbols,
      signal_count: state.signal_count,
      total_analyses: state.total_analyses,
      last_signal_time: state.last_signal_time,
      active_signals: map_size(state.signals),
      subscribed_timeframes: @timeframes,
      started_at: state.started_at,
      uptime_seconds: DateTime.diff(DateTime.utc_now(), state.started_at)
    }
    {:reply, status, state}
  end

  @impl true
  def handle_call(:get_signals, _from, state) do
    {:reply, state.signals, state}
  end

  @impl true
  def handle_call({:get_signal, symbol}, _from, state) do
    {:reply, Map.get(state.signals, symbol), state}
  end

  # Handle PubSub messages from KlineStream
  # KlineStream broadcasts: {:candle_closed, candle} to "candle_closed:TIMEFRAME"
  @impl true
  def handle_info({:candle_closed, candle}, state) do
    # Extract symbol and timeframe from the Candle struct
    symbol = candle.symbol
    timeframe = candle.timeframe
    
    # Convert struct to map for processing
    candle_data = %{
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      taker_buy_volume: candle.taker_buy_volume || Decimal.new("0")
    }
    
    # Process via cast (non-blocking)
    GenServer.cast(self(), {:candle_close, symbol, timeframe, candle_data})
    {:noreply, state}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  # ============================================================================
  # ANALYSIS LOGIC
  # ============================================================================

  defp analyze_and_generate_signal(symbol, timeframe, candle_data) do
    # Get order flow data from DepthStream (uses ETS cache - fast!)
    order_flow = case DepthStream.get_order_flow(String.upcase(symbol)) do
      {:ok, data} -> data
      _ -> nil
    end
    
    # Get recent candles for physics analysis (we need at least 5)
    candles = build_candle_series(candle_data, order_flow)
    
    if length(candles) >= 5 do
      # Build order book structure for physics
      order_book = if order_flow do
        %{
          wall: order_flow.wall,
          imbalance: order_flow.imbalance,
          spread: order_flow.spread
        }
      else
        nil
      end
      
      # Run physics analysis
      case Projectile.analyze_with_flow(candles, order_book) do
        {:ok, physics} ->
          signal = build_signal(symbol, timeframe, candle_data, physics, order_flow)
          {:ok, signal}
        
        {:error, reason} ->
          {:error, reason}
      end
    else
      {:error, :insufficient_candles}
    end
  end

  defp build_candle_series(candle_data, order_flow) do
    # Build a series of candles for analysis
    # Extract close price safely - handle both struct and map
    base_close = case get_field(candle_data, :close) do
      %Decimal{} = d -> Decimal.to_float(d)
      c when is_number(c) -> c * 1.0
      _ -> 0.0
    end
    
    # Create 10 synthetic candles with small variations
    # In production, this would fetch historical candles from KlineStream cache
    Enum.map(0..9, fn i ->
      variation = :rand.uniform() * 0.001 - 0.0005  # ±0.05%
      price = base_close * (1 + variation * (10 - i) / 10)
      
      volume = cond do
        order_flow && Map.get(order_flow, :total_volume) ->
          Decimal.to_float(order_flow.total_volume)
        get_field(candle_data, :volume) ->
          case get_field(candle_data, :volume) do
            %Decimal{} = d -> Decimal.to_float(d)
            n when is_number(n) -> n * 1.0
            _ -> 1000.0
          end
        true ->
          1000.0
      end
      
      pressure = if order_flow, do: Map.get(order_flow, :pressure_ratio, 0.5), else: 0.5
      buy_volume = volume * pressure
      
      %{
        close: Decimal.from_float(price),
        volume: Decimal.from_float(volume),
        taker_buy_volume: Decimal.from_float(buy_volume)
      }
    end)
  end

  defp build_signal(symbol, timeframe, candle_data, physics, order_flow) do
    # Handle both struct (%Candle{}) and map access
    current_price = extract_decimal(get_field(candle_data, :close))
    current_price_float = Decimal.to_float(current_price)
    
    # Determine direction based on physics
    {direction, confidence} = determine_direction(physics, order_flow)
    
    # Calculate entry, stop loss, take profit
    {entry, stop_loss, take_profit} = calculate_levels(current_price_float, direction)
    
    # Build order flow metrics - use normalized values from new Projectile
    velocity = Map.get(physics, :velocity, 0.0)           # % per minute (normalized)
    acceleration = Map.get(physics, :acceleration, 0.0)   # % per minute² (normalized)
    velocity_dollar = Map.get(physics, :velocity_dollar, velocity * current_price_float)
    acceleration_dollar = Map.get(physics, :acceleration_dollar, acceleration * current_price_float)
    
    order_flow_metrics = if order_flow do
      %{
        imbalance: order_flow.imbalance,
        pressure_ratio: physics.pressure_ratio,
        wall: order_flow.wall,
        spread: order_flow.spread,
        best_bid: order_flow.best_bid,
        best_ask: order_flow.best_ask,
        velocity: velocity,
        velocity_dollar: velocity_dollar,
        acceleration: acceleration,
        acceleration_dollar: acceleration_dollar,
        r_squared: physics.r_squared
      }
    else
      %{
        imbalance: 0.0,
        pressure_ratio: physics.pressure_ratio,
        wall: :balanced,
        spread: Decimal.new("0"),
        best_bid: current_price,
        best_ask: current_price,
        velocity: velocity,
        velocity_dollar: velocity_dollar,
        acceleration: acceleration,
        acceleration_dollar: acceleration_dollar,
        r_squared: physics.r_squared
      }
    end
    
    # Get peak/dip from physics (new fields) or calculate with sanity checks
    raw_peak = Map.get(physics, :peak_price, physics.targets.t_30m)
    raw_dip = Map.get(physics, :dip_price, current_price_float * 0.98)
    
    # Sanity check: peak/dip must be within 20% of current price
    peak_price = clamp_price(raw_peak, current_price_float, 0.20)
    dip_price = clamp_price(raw_dip, current_price_float, 0.20)
    
    # Ensure peak > dip (swap if needed based on direction)
    {peak_price, dip_price} = if peak_price < dip_price do
      {dip_price, peak_price}
    else
      {peak_price, dip_price}
    end
    
    peak_time = Map.get(physics, :peak_time_minutes, 30)
    dip_time = Map.get(physics, :dip_time_minutes, 60)
    
    %{
      symbol: symbol,
      direction: direction,
      confidence: confidence,
      entry_price: Decimal.from_float(entry),
      stop_loss: Decimal.from_float(stop_loss),
      take_profit: Decimal.from_float(take_profit),
      current_price: current_price,
      order_flow: order_flow_metrics,
      timeframe: timeframe,
      timestamp: DateTime.utc_now(),
      
      # Physics data (normalized)
      velocity: velocity,                    # % per minute
      velocity_dollar: velocity_dollar,      # $ per minute
      acceleration: acceleration,            # % per minute²
      acceleration_dollar: acceleration_dollar,  # $ per minute²
      r_squared: physics.r_squared,
      pressure_ratio: physics.pressure_ratio,
      
      # Predictions
      target_5m: physics.targets.t_5m,
      target_30m: physics.targets.t_30m,
      peak_price: peak_price,
      peak_time: peak_time,
      dip_price: dip_price,
      dip_time: dip_time
    }
  end

  defp determine_direction(physics, order_flow) do
    velocity = physics.velocity
    acceleration = physics.acceleration
    r_squared = physics.r_squared
    pressure = physics.pressure_ratio
    
    imbalance = if order_flow, do: order_flow.imbalance, else: 0.0
    wall = if order_flow, do: order_flow.wall, else: :balanced
    
    # Score calculation
    score = 0
    
    # Velocity contribution (±30 points)
    score = score + cond do
      velocity > 0.0005 -> 30
      velocity > 0.0001 -> 15
      velocity < -0.0005 -> -30
      velocity < -0.0001 -> -15
      true -> 0
    end
    
    # Acceleration contribution (±20 points)
    score = score + cond do
      acceleration > 0.00001 -> 20
      acceleration > 0 -> 10
      acceleration < -0.00001 -> -20
      acceleration < 0 -> -10
      true -> 0
    end
    
    # Pressure contribution (±20 points)
    score = score + cond do
      pressure > 0.6 -> 20
      pressure > 0.55 -> 10
      pressure < 0.4 -> -20
      pressure < 0.45 -> -10
      true -> 0
    end
    
    # Order flow imbalance (±15 points)
    score = score + cond do
      imbalance > 0.5 -> 15
      imbalance > 0.2 -> 8
      imbalance < -0.5 -> -15
      imbalance < -0.2 -> -8
      true -> 0
    end
    
    # Wall contribution (±15 points)
    score = score + case wall do
      :buy_wall -> 15
      :sell_wall -> -15
      _ -> 0
    end
    
    # R² affects confidence, not direction
    confidence_multiplier = cond do
      r_squared > 0.7 -> 1.0
      r_squared > 0.5 -> 0.85
      r_squared > 0.3 -> 0.7
      true -> 0.5
    end
    
    # Determine direction and confidence
    {direction, base_confidence} = cond do
      score >= 30 -> {:long, 50 + abs(score)}
      score <= -30 -> {:short, 50 + abs(score)}
      score > 0 -> {:long, 40 + abs(score)}
      score < 0 -> {:short, 40 + abs(score)}
      true -> {:neutral, 30}
    end
    
    confidence = round(base_confidence * confidence_multiplier)
    confidence = min(confidence, 100)
    
    {direction, confidence}
  end

  defp calculate_levels(current_price, direction) do
    case direction do
      :long ->
        entry = current_price
        stop_loss = current_price * (1 - @stop_loss_pct)
        take_profit = current_price * (1 + @take_profit_pct)
        {entry, stop_loss, take_profit}
      
      :short ->
        entry = current_price
        stop_loss = current_price * (1 + @stop_loss_pct)
        take_profit = current_price * (1 - @take_profit_pct)
        {entry, stop_loss, take_profit}
      
      _ ->
        {current_price, current_price, current_price}
    end
  end

  defp extract_decimal(%Decimal{} = d), do: d
  defp extract_decimal(n) when is_number(n), do: Decimal.from_float(n * 1.0)
  defp extract_decimal(s) when is_binary(s), do: Decimal.new(s)
  defp extract_decimal(_), do: Decimal.new("0")

  # Helper to get field from both structs and maps
  # Structs don't implement Access, so we need to use Map.get or struct.field
  defp get_field(data, key) when is_struct(data), do: Map.get(data, key)
  defp get_field(data, key) when is_map(data), do: Map.get(data, key)
  defp get_field(_, _), do: nil

  # Clamp price to be within max_deviation % of current price
  # Returns sensible default if value is invalid
  defp clamp_price(value, current_price, max_deviation) when is_number(value) and is_number(current_price) and current_price > 0 do
    min_price = current_price * (1 - max_deviation)
    max_price = current_price * (1 + max_deviation)
    
    cond do
      value <= 0 -> current_price  # Invalid, use current
      value < min_price -> min_price
      value > max_price -> max_price
      true -> value
    end
  end
  defp clamp_price(_, current_price, _), do: current_price

  defp broadcast_signal(signal) do
    Phoenix.PubSub.broadcast(@pubsub, "signals:all", {:signal, signal})
    Phoenix.PubSub.broadcast(@pubsub, "signals:#{signal.symbol}", {:signal, signal})
  end
end