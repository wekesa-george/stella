defmodule TradeEngine.Strategy.SignalDisplay do
  @moduledoc """
  📊 SIGNAL DISPLAY - Real-time terminal display of trading signals
  
  Displays signals with full physics metrics:
  - Asset & Price
  - Signal direction & confidence
  - Velocity ($/min)
  - Acceleration ($/min²)
  - R² value
  - Peak/Dip predictions with timing
  """

  use GenServer
  require Logger

  @pubsub TradeEngine.PubSub
  @refresh_interval 5_000  # Refresh display every 5 seconds

  # ============================================================================
  # PUBLIC API
  # ============================================================================

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc "Show current signals table"
  def show do
    GenServer.call(__MODULE__, :show)
  end

  @doc "Enable/disable auto-display"
  def auto_display(enabled) do
    GenServer.cast(__MODULE__, {:auto_display, enabled})
  end

  @doc "Display signals once (can be called from IEx)"
  def print_signals do
    signals = TradeEngine.Strategy.CandleBridge.get_signals()
    print_table(signals)
  end

  # ============================================================================
  # GENSERVER CALLBACKS
  # ============================================================================

  @impl true
  def init(_opts) do
    Logger.info("📊 SignalDisplay started")
    
    # Subscribe to signals
    Phoenix.PubSub.subscribe(@pubsub, "signals:all")
    
    state = %{
      signals: %{},
      auto_display: false,
      last_display: nil
    }
    
    {:ok, state}
  end

  @impl true
  def handle_call(:show, _from, state) do
    signals = TradeEngine.Strategy.CandleBridge.get_signals()
    print_table(signals)
    {:reply, :ok, state}
  end

  @impl true
  def handle_cast({:auto_display, enabled}, state) do
    if enabled do
      schedule_display()
    end
    {:noreply, %{state | auto_display: enabled}}
  end

  @impl true
  def handle_info({:signal, signal}, state) do
    new_signals = Map.put(state.signals, signal.symbol, signal)
    
    if state.auto_display do
      print_single_signal(signal)
    end
    
    {:noreply, %{state | signals: new_signals}}
  end

  @impl true
  def handle_info(:display_tick, state) do
    if state.auto_display do
      signals = TradeEngine.Strategy.CandleBridge.get_signals()
      print_table(signals)
      schedule_display()
    end
    {:noreply, %{state | last_display: DateTime.utc_now()}}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  # ============================================================================
  # DISPLAY FUNCTIONS
  # ============================================================================

  defp print_table(signals) when map_size(signals) == 0 do
    IO.puts("\n⚠️  No signals available yet. Wait for candle close.\n")
  end

  defp print_table(signals) do
    # Sort by confidence descending
    sorted = signals
      |> Enum.sort_by(fn {_k, v} -> -v.confidence end)
    
    IO.puts("\n")
    IO.puts(String.duplicate("═", 140))
    IO.puts("║ 📊 TRADING SIGNALS - #{DateTime.utc_now() |> Calendar.strftime("%Y-%m-%d %H:%M:%S")} UTC")
    IO.puts(String.duplicate("═", 140))
    
    # Header
    IO.puts(format_header())
    IO.puts(String.duplicate("─", 140))
    
    # Rows
    Enum.each(sorted, fn {_symbol, signal} ->
      IO.puts(format_row(signal))
    end)
    
    IO.puts(String.duplicate("═", 140))
    
    # Summary
    print_summary(signals)
    
    IO.puts("")
  end

  defp format_header do
    "│ " <>
    pad("ASSET", 10) <>
    pad("PRICE", 12) <>
    pad("SIGNAL", 8) <>
    pad("CONF", 6) <>
    pad("VEL $/m", 10) <>
    pad("ACC $/m²", 10) <>
    pad("R²", 6) <>
    pad("PEAK $", 12) <>
    pad("PEAK T", 8) <>
    pad("DIP $", 12) <>
    pad("DIP T", 8) <>
    pad("WALL", 10) <>
    " │"
  end

  defp format_row(signal) do
    price = get_price_float(signal.current_price)
    
    # Convert velocity to $/min (velocity is fractional, multiply by price)
    vel_per_min = signal.velocity * price
    
    # Convert acceleration to $/min² 
    acc_per_min2 = signal.acceleration * price
    
    # Calculate peak and dip from targets
    {peak_price, peak_time, dip_price, dip_time} = calculate_peak_dip(signal, price)
    
    # Direction with color indicator
    direction = case signal.direction do
      :long -> "🟢 LONG"
      :short -> "🔴 SHORT"
      _ -> "⚪ NEUT"
    end
    
    # Wall indicator
    wall = case get_in_safe(signal, [:order_flow, :wall]) do
      :buy_wall -> "🟢 BUY"
      :sell_wall -> "🔴 SELL"
      _ -> "⚪ BAL"
    end
    
    "│ " <>
    pad(signal.symbol, 10) <>
    pad(format_price(price), 12) <>
    pad(direction, 8) <>
    pad("#{signal.confidence}%", 6) <>
    pad(format_velocity(vel_per_min), 10) <>
    pad(format_acceleration(acc_per_min2), 10) <>
    pad(format_r2(signal.r_squared), 6) <>
    pad(format_price(peak_price), 12) <>
    pad("#{peak_time}m", 8) <>
    pad(format_price(dip_price), 12) <>
    pad("#{dip_time}m", 8) <>
    pad(wall, 10) <>
    " │"
  end

  defp calculate_peak_dip(signal, current_price) do
    velocity = signal.velocity * current_price
    acceleration = signal.acceleration * current_price
    
    # Physics: time to peak/dip when velocity = 0
    # v = v0 + a*t => t = -v0/a
    
    if acceleration != 0 do
      time_to_extremum = -velocity / acceleration
      
      if time_to_extremum > 0 do
        # Price at extremum: p = p0 + v0*t + 0.5*a*t²
        extremum_price = current_price + velocity * time_to_extremum + 0.5 * acceleration * time_to_extremum * time_to_extremum
        
        if acceleration < 0 do
          # Decelerating upward = peak
          {extremum_price, round(time_to_extremum), current_price * 0.98, 30}
        else
          # Accelerating downward = dip
          {current_price * 1.02, 30, extremum_price, round(time_to_extremum)}
        end
      else
        # Use targets from signal
        {signal.target_30m || current_price, 30, current_price * 0.98, 30}
      end
    else
      # No acceleration, use linear projection
      target_5m = signal.target_5m || current_price
      {target_5m * 1.01, 30, target_5m * 0.99, 30}
    end
  end

  defp print_single_signal(signal) do
    price = get_price_float(signal.current_price)
    vel_per_min = signal.velocity * price
    
    direction_emoji = case signal.direction do
      :long -> "🟢"
      :short -> "🔴"
      _ -> "⚪"
    end
    
    IO.puts("#{direction_emoji} #{signal.symbol} | #{signal.direction} #{signal.confidence}% | $#{format_price(price)} | Vel: #{format_velocity(vel_per_min)}/min")
  end

  defp print_summary(signals) do
    total = map_size(signals)
    longs = Enum.count(signals, fn {_, v} -> v.direction == :long end)
    shorts = Enum.count(signals, fn {_, v} -> v.direction == :short end)
    neutrals = total - longs - shorts
    
    high_conf = Enum.count(signals, fn {_, v} -> v.confidence >= 60 end)
    
    avg_conf = if total > 0 do
      signals |> Enum.map(fn {_, v} -> v.confidence end) |> Enum.sum() |> div(total)
    else
      0
    end
    
    IO.puts("│ Summary: #{total} signals | 🟢 #{longs} LONG | 🔴 #{shorts} SHORT | ⚪ #{neutrals} NEUTRAL | High Conf (≥60%): #{high_conf} | Avg Conf: #{avg_conf}%")
  end

  # ============================================================================
  # FORMATTING HELPERS
  # ============================================================================

  defp pad(str, width) do
    str = to_string(str)
    len = String.length(str)
    if len >= width do
      String.slice(str, 0, width)
    else
      str <> String.duplicate(" ", width - len)
    end
  end

  defp format_price(price) when is_float(price) do
    cond do
      price >= 1000 -> :erlang.float_to_binary(price, decimals: 2)
      price >= 1 -> :erlang.float_to_binary(price, decimals: 4)
      price >= 0.01 -> :erlang.float_to_binary(price, decimals: 6)
      true -> :erlang.float_to_binary(price, decimals: 8)
    end
  end
  defp format_price(_), do: "N/A"

  defp format_velocity(vel) when is_float(vel) do
    sign = if vel >= 0, do: "+", else: ""
    cond do
      abs(vel) >= 100 -> "#{sign}$#{:erlang.float_to_binary(vel, decimals: 0)}"
      abs(vel) >= 1 -> "#{sign}$#{:erlang.float_to_binary(vel, decimals: 2)}"
      abs(vel) >= 0.01 -> "#{sign}$#{:erlang.float_to_binary(vel, decimals: 4)}"
      true -> "#{sign}$#{:erlang.float_to_binary(vel, decimals: 6)}"
    end
  end
  defp format_velocity(_), do: "N/A"

  defp format_acceleration(acc) when is_float(acc) do
    sign = if acc >= 0, do: "+", else: ""
    cond do
      abs(acc) >= 100 -> "#{sign}$#{:erlang.float_to_binary(acc, decimals: 0)}"
      abs(acc) >= 1 -> "#{sign}$#{:erlang.float_to_binary(acc, decimals: 2)}"
      abs(acc) >= 0.01 -> "#{sign}$#{:erlang.float_to_binary(acc, decimals: 4)}"
      true -> "#{sign}$#{:erlang.float_to_binary(acc, decimals: 6)}"
    end
  end
  defp format_acceleration(_), do: "N/A"

  defp format_r2(r2) when is_float(r2) do
    :erlang.float_to_binary(r2, decimals: 3)
  end
  defp format_r2(_), do: "N/A"

  defp get_price_float(%Decimal{} = d), do: Decimal.to_float(d)
  defp get_price_float(n) when is_number(n), do: n * 1.0
  defp get_price_float(_), do: 0.0

  defp get_in_safe(map, keys) do
    Enum.reduce_while(keys, map, fn key, acc ->
      case acc do
        %{^key => val} -> {:cont, val}
        _ -> {:halt, nil}
      end
    end)
  end

  defp schedule_display do
    Process.send_after(self(), :display_tick, @refresh_interval)
  end
end