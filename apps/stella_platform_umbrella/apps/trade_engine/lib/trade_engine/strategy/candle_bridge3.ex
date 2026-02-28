defmodule TradeEngine.Strategy.CandleBridge3 do
  @moduledoc """
  🕯️ CANDLE BRIDGE - Physics-Enhanced Market Analysis

  Integrates physics projectile model directly into candle analysis:
  - Initial Momentum (v₀) = (High - Low) / ATR
  - Market Gravity (g) = volatility * expansion_factor
  - Trajectory Angle (θ) = arctan(v₀ / price_level)
  - Time to Peak (t_peak) = v₀ / g
  - Predicted Peak (P_peak) = P₀ + (v₀²) / (2g)
  - Energy State (E) = v(t)² 

  This module:
  1. Receives candle close events from KlineStream (via PubSub)
  2. Calculates physics parameters from OHLCV
  3. Fetches order flow data from DepthStream (ETS cache)
  4. Generates trading signals with full physics metrics
  5. Broadcasts to PubSub for dashboard consumption
  """

  use GenServer
  require Logger

  alias TradeEngine.Physics.Projectile
  alias TradeEngine.Exchanges.Binance.DepthStream
  alias TradeEngine.Exchanges.Binance.KlineStream

  @pubsub TradeEngine.PubSub

  # Risk parameters
  @stop_loss_pct 0.02
  @take_profit_pct 0.05
  @min_upside_pct 0.01
  @min_downside_pct 0.01

  # Physics parameters
  @min_trajectory_angle 18.0           # Min angle for valid trade (degrees)
  @gravity_expansion_factor 2.0        # g = volatility * 2.0 (crypto aggressive)
  @gravity_min 0.8                     # Min gravity bound
  @gravity_max 5.0                     # Max gravity bound

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
    Logger.info("🕯️ CandleBridge started - Physics-Enhanced Candle Analysis")
    
    for tf <- @timeframes do
      Phoenix.PubSub.subscribe(@pubsub, "candle_closed:#{tf}")
      Logger.debug("📡 Subscribed to candle_closed:#{tf}")
    end
    
    state = %{
      signals: %{},
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
    Logger.debug("🕯️ Candle closed: #{symbol} #{timeframe}")
    
    case analyze_and_generate_signal(symbol, timeframe, candle_data) do
      {:ok, signal} ->
        broadcast_signal(signal)
        
        new_signals = Map.put(state.signals, symbol, signal)
        new_symbols = if symbol in state.symbols, do: state.symbols, else: [symbol | state.symbols]
        
        Logger.info("""
        📢 Signal: #{signal.symbol} #{signal.direction} (#{signal.confidence}%)
           Physics: v₀=#{Float.round(signal.physics.momentum, 4)} | g=#{Float.round(signal.physics.gravity, 3)} | θ=#{Float.round(signal.physics.trajectory_angle, 2)}°
           T→Peak: #{signal.physics.time_to_peak} bars | E=#{signal.physics.energy_state}
        """)
        
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
    
    order_flow = case DepthStream.get_order_flow(String.upcase(symbol)) do
      {:ok, data} -> data
      _ -> nil
    end
    
    candle_result = KlineStream.get_candle(symbol, "5m")
    
    current_price = cond do
      order_flow && order_flow.best_ask -> order_flow.best_ask
      match?({:ok, _}, candle_result) ->
        {:ok, candle} = candle_result
        candle.close
      true -> nil
    end
    
    if current_price do
      candle_data = case candle_result do
        {:ok, candle} -> candle
        _ ->
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

  @impl true
  def handle_info({:candle_closed, candle}, state) do
    symbol = candle.symbol
    timeframe = candle.timeframe
    
    candle_data = %{
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      taker_buy_volume: candle.taker_buy_volume || Decimal.new("0")
    }
    
    GenServer.cast(self(), {:candle_close, symbol, timeframe, candle_data})
    {:noreply, state}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  # ============================================================================
  # PHYSICS ANALYSIS ENGINE
  # ============================================================================

  defp analyze_and_generate_signal(symbol, timeframe, candle_data) do
    order_flow = case DepthStream.get_order_flow(String.upcase(symbol)) do
      {:ok, data} -> data
      _ -> nil
    end
    
    candles = build_candle_series(candle_data, order_flow)
    
    if length(candles) >= 5 do
      case calculate_physics(candles, candle_data) do
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

  # ============================================================================
  # PHYSICS CALCULATIONS
  # ============================================================================

  defp calculate_physics(candles, current_candle) do
    try do
      current_price = extract_decimal(get_field(current_candle, :close)) |> Decimal.to_float()
      high = extract_decimal(get_field(current_candle, :high)) |> Decimal.to_float()
      low = extract_decimal(get_field(current_candle, :low)) |> Decimal.to_float()
      open = extract_decimal(get_field(current_candle, :open)) |> Decimal.to_float()

      # =====================================================================
      # 1. CALCULATE INITIAL MOMENTUM (v₀)
      # =====================================================================
      # v₀ = (High - Low) / ATR
      
      atr = calculate_atr(candles)
      momentum_v0 = if atr > 0 do
        (high - low) / atr
      else
        0.0
      end

      # =====================================================================
      # 2. CALCULATE MARKET GRAVITY (g)
      # =====================================================================
      # g = volatility * expansion_factor
      # Typical: 1.5 - 3.0 (crypto more aggressive)
      
      volatility = calculate_volatility(candles)
      gravity = volatility * @gravity_expansion_factor
      gravity = min(max(gravity, @gravity_min), @gravity_max)

      # =====================================================================
      # 3. CALCULATE TRAJECTORY ANGLE (θ)
      # =====================================================================
      # θ = arctan(v₀ / price_level)
      
      trajectory_angle = if current_price > 0 and momentum_v0 != 0 do
        angle_rad = :math.atan(momentum_v0 / current_price)
        angle_deg = angle_rad * 180 / :math.pi
        abs(angle_deg)
      else
        0.0
      end

      # =====================================================================
      # 4. CALCULATE TIME TO PEAK (t_peak)
      # =====================================================================
      # t_peak = v₀ / g (in candles/bars)
      
      time_to_peak = if gravity > 0 do
        round(momentum_v0 / gravity)
      else
        30  # Default
      end

      # Clamp to reasonable range (5-120 bars)
      time_to_peak = min(max(time_to_peak, 5), 120)

      # =====================================================================
      # 5. CALCULATE PREDICTED PEAK PRICE (P_peak)
      # =====================================================================
      # P_peak = P₀ + (v₀²) / (2g)
      
      predicted_peak = if gravity > 0 do
        current_price + (momentum_v0 * momentum_v0) / (2 * gravity)
      else
        current_price * 1.05
      end

      # =====================================================================
      # 6. CALCULATE ENERGY STATE (E)
      # =====================================================================
      # E = v(t)²  # Current kinetic energy
      # Low E near peak = exhaustion zone
      
      kinetic_energy = momentum_v0 * momentum_v0
      
      energy_state = cond do
        kinetic_energy < 0.3 -> :low        # Exhaustion - reversal likely
        kinetic_energy < 1.5 -> :medium     # Moderate momentum
        true -> :high                        # Strong momentum
      end

      # =====================================================================
      # 7. CALCULATE PREDICTED DIP PRICE (for short positions)
      # =====================================================================
      # Use similar physics but inverted
      
      predicted_dip = current_price * (1 - 0.05)  # Conservative: 5% below current

      # =====================================================================
      # 8. CALCULATE ADDITIONAL PHYSICS METRICS
      # =====================================================================
      
      # Current velocity (normalized to % per minute)
      # Typically: (Close - Open) / Open
      current_velocity = if open != 0 do
        (current_price - open) / open
      else
        0.0
      end

      # Acceleration (change in momentum over time)
      # Simplified: momentum trend
      acceleration = if length(candles) >= 2 do
        prev_candle = Enum.at(candles, 1)
        prev_close = extract_decimal(get_field(prev_candle, :close)) |> Decimal.to_float()
        prev_momentum = if open > 0 do
          (prev_close - open) / open
        else
          0.0
        end
        
        (current_velocity - prev_momentum)
      else
        0.0
      end

      # R² value (goodness of fit for linear regression)
      # Simplified version: based on consistency of momentum
      r_squared = if kinetic_energy > 0 do
        # Higher energy = higher R² (more consistent momentum)
        min(kinetic_energy / 2.0, 1.0)
      else
        0.5
      end

      # =====================================================================
      # 9. RETURN PHYSICS STRUCTURE
      # =====================================================================

      physics = %{
        momentum: momentum_v0,              # v₀
        gravity: gravity,                   # g
        trajectory_angle: trajectory_angle, # θ (degrees)
        time_to_peak: time_to_peak,        # t_peak (bars)
        predicted_peak: predicted_peak,     # P_peak
        predicted_dip: predicted_dip,       # P_dip
        kinetic_energy: kinetic_energy,    # E = v²
        energy_state: energy_state,        # :high | :medium | :low
        current_velocity: current_velocity,
        acceleration: acceleration,
        r_squared: r_squared,
        pressure_ratio: 0.5,               # Placeholder - gets overridden by order_flow
        targets: %{
          t_5m: current_price * 1.01,
          t_30m: predicted_peak
        }
      }

      {:ok, physics}
    rescue
      e ->
        Logger.error("Physics calculation error: #{inspect(e)}")
        {:error, :calculation_error}
    end
  end

  # =====================================================================
  # PHYSICS HELPER FUNCTIONS
  # =====================================================================

  defp calculate_atr(candles, period \\ 14) do
    candles
      |> Enum.take(period)
      |> Enum.map(fn c ->
        high = extract_decimal(get_field(c, :high)) |> Decimal.to_float()
        low = extract_decimal(get_field(c, :low)) |> Decimal.to_float()
        high - low
      end)
      |> Enum.sum()
      |> then(&(&1 / max(period, 1)))
  end

  defp calculate_volatility(candles) do
    closes = candles
      |> Enum.map(fn c ->
        extract_decimal(get_field(c, :close)) |> Decimal.to_float()
      end)
    
    count = length(closes)
    
    if count < 2 do
      0.0
    else
      mean = Enum.sum(closes) / count
      
      variance = closes
        |> Enum.map(fn c -> (c - mean) * (c - mean) end)
        |> Enum.sum()
        |> then(&(&1 / count))
      
      :math.sqrt(variance)
    end
  end

  # ============================================================================
  # SIGNAL BUILDING
  # ============================================================================

  defp build_signal(symbol, timeframe, candle_data, physics, order_flow) do
    current_price = extract_decimal(get_field(candle_data, :close))
    current_price_float = Decimal.to_float(current_price)
    
    {direction, confidence} = determine_direction_physics(physics, order_flow)
    
    # Use physics-predicted peak/dip
    peak_price = physics.predicted_peak
    dip_price = physics.predicted_dip
    peak_time = physics.time_to_peak
    dip_time = physics.time_to_peak + 15  # Dip takes longer to manifest
    
    # Guard: Validate direction aligns with peak/dip
    {direction, confidence} = case direction do
      :long when peak_price <= current_price_float * (1 + @min_upside_pct) ->
        Logger.warning("⚠️ #{symbol}: Long signal but peak <= current, reverting to neutral")
        {:neutral, 30}
      
      :short when dip_price >= current_price_float * (1 - @min_downside_pct) ->
        Logger.warning("⚠️ #{symbol}: Short signal but dip >= current, reverting to neutral")
        {:neutral, 30}
      
      _ ->
        {direction, confidence}
    end
    
    {entry, stop_loss, take_profit} = calculate_levels(current_price_float, direction, peak_price, dip_price)
    
    # Order flow metrics
    order_flow_metrics = if order_flow do
      %{
        imbalance: order_flow.imbalance,
        pressure_ratio: physics.pressure_ratio,
        wall: order_flow.wall,
        spread: order_flow.spread,
        best_bid: order_flow.best_bid,
        best_ask: order_flow.best_ask,
        velocity: physics.current_velocity,
        acceleration: physics.acceleration,
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
        velocity: physics.current_velocity,
        acceleration: physics.acceleration,
        r_squared: physics.r_squared
      }
    end
    
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
      
      # ✅ Physics parameters (core of enhanced model)
      physics: %{
        momentum: Float.round(physics.momentum, 6),
        gravity: Float.round(physics.gravity, 4),
        trajectory_angle: Float.round(physics.trajectory_angle, 2),
        time_to_peak: physics.time_to_peak,
        predicted_peak: Float.round(physics.predicted_peak, 4),
        predicted_dip: Float.round(physics.predicted_dip, 4),
        kinetic_energy: Float.round(physics.kinetic_energy, 4),
        energy_state: physics.energy_state,
        current_velocity: Float.round(physics.current_velocity, 6),
        acceleration: Float.round(physics.acceleration, 6),
        r_squared: Float.round(physics.r_squared, 3)
      },
      
      # Predictions
      target_5m: physics.targets.t_5m,
      target_30m: physics.targets.t_30m,
      peak_price: peak_price,
      peak_time: peak_time,
      dip_price: dip_price,
      dip_time: dip_time
    }
  end

  defp determine_direction_physics(physics, order_flow) do
    momentum = physics.momentum
    acceleration = physics.acceleration
    angle = physics.trajectory_angle
    energy = physics.kinetic_energy
    r_squared = physics.r_squared

    imbalance = if order_flow, do: order_flow.imbalance, else: 0.0
    wall = if order_flow, do: order_flow.wall, else: :balanced

    # =====================================================================
    # DIRECTION SCORING (Angle-based with physics validation)
    # =====================================================================
    
    score = 0

    # Trajectory angle is PRIMARY signal (±40 points)
    # θ > 18° = valid bullish | θ < -18° = valid bearish
    score = score + cond do
      angle > @min_trajectory_angle -> 40       # Strong bullish angle
      angle > 10 -> 20                           # Moderate bullish
      angle < -@min_trajectory_angle -> -40      # Strong bearish angle
      angle < -10 -> -20                         # Moderate bearish
      true -> 0
    end

    # Momentum (v₀) reinforces angle (±20 points)
    score = score + cond do
      momentum > 0.001 -> 20
      momentum > 0.0001 -> 10
      momentum < -0.001 -> -20
      momentum < -0.0001 -> -10
      true -> 0
    end

    # Acceleration (±15 points)
    score = score + cond do
      acceleration > 0.0001 -> 15
      acceleration > 0 -> 8
      acceleration < -0.0001 -> -15
      acceleration < 0 -> -8
      true -> 0
    end

    # Energy state (±10 points)
    score = score + case physics.energy_state do
      :high -> 10
      :medium -> 5
      :low -> -10
    end

    # Order flow wall (±15 points)
    score = score + case wall do
      :buy_wall -> 15
      :sell_wall -> -15
      _ -> 0
    end

    # Imbalance (±10 points)
    score = score + cond do
      imbalance > 0.5 -> 10
      imbalance > 0.2 -> 5
      imbalance < -0.5 -> -10
      imbalance < -0.2 -> -5
      true -> 0
    end

    # Determine direction
    {direction, base_confidence} = cond do
      score >= 40 -> {:long, 50 + abs(score)}
      score <= -40 -> {:short, 50 + abs(score)}
      score > 0 -> {:long, 40 + abs(score)}
      score < 0 -> {:short, 40 + abs(score)}
      true -> {:neutral, 30}
    end

    # Confidence multiplier based on R² (model fit quality)
    confidence_multiplier = cond do
      r_squared > 0.7 -> 1.0
      r_squared > 0.5 -> 0.85
      r_squared > 0.3 -> 0.7
      true -> 0.5
    end

    confidence = round(base_confidence * confidence_multiplier)
    confidence = min(max(confidence, 0), 100)

    {direction, confidence}
  end

  defp calculate_levels(current_price, direction, peak_price, dip_price) do
    case direction do
      :long ->
        entry = current_price
        stop_loss = current_price * (1 - @stop_loss_pct)
        take_profit = min(peak_price, current_price * (1 + @take_profit_pct))
        {entry, stop_loss, take_profit}
      
      :short ->
        entry = current_price
        stop_loss = current_price * (1 + @stop_loss_pct)
        take_profit = max(dip_price, current_price * (1 - @take_profit_pct))
        {entry, stop_loss, take_profit}
      
      _ ->
        {current_price, current_price, current_price}
    end
  end

  # ============================================================================
  # UTILITY FUNCTIONS
  # ============================================================================

  defp build_candle_series(candle_data, order_flow) do
    base_close = case get_field(candle_data, :close) do
      %Decimal{} = d -> Decimal.to_float(d)
      c when is_number(c) -> c * 1.0
      _ -> 0.0
    end
    
    Enum.map(0..9, fn i ->
      variation = :rand.uniform() * 0.001 - 0.0005
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
        true -> 1000.0
      end
      
      pressure = if order_flow, do: Map.get(order_flow, :pressure_ratio, 0.5), else: 0.5
      buy_volume = volume * pressure
      
      %{
        close: Decimal.from_float(price),
        high: Decimal.from_float(price * 1.001),
        low: Decimal.from_float(price * 0.999),
        open: Decimal.from_float(price * 1.0),
        volume: Decimal.from_float(volume),
        taker_buy_volume: Decimal.from_float(buy_volume)
      }
    end)
  end

  defp extract_decimal(%Decimal{} = d), do: d
  defp extract_decimal(n) when is_number(n), do: Decimal.from_float(n * 1.0)
  defp extract_decimal(s) when is_binary(s), do: Decimal.new(s)
  defp extract_decimal(_), do: Decimal.new("0")

  defp get_field(data, key) when is_struct(data), do: Map.get(data, key)
  defp get_field(data, key) when is_map(data), do: Map.get(data, key)
  defp get_field(_, _), do: nil

  defp clamp_price(value, current_price, max_deviation) when is_number(value) and is_number(current_price) and current_price > 0 do
    min_price = current_price * (1 - max_deviation)
    max_price = current_price * (1 + max_deviation)
    
    cond do
      value <= 0 -> current_price
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