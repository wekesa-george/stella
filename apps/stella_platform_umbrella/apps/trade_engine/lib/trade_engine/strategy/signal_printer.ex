defmodule TradeEngine.Strategy.SignalPrinter do
  @moduledoc """
  🖨️ Signal Printer - Fixed to handle velocity and negative momentum/angles
  
  KEY FIXES:
  1. ✅ Added :velocity field extraction
  2. ✅ Handles negative momentum (bearish)
  3. ✅ Handles negative angles (downtrend)
  4. ✅ Better column layout for all metrics
  """
  
  require Logger

  @doc "Display all signals in table format"
  def show do
    signals = TradeEngine.Strategy.CandleBridge.get_signals()
    print_table(signals)
  end

  @doc "Display signal for specific symbol"
  def show(symbol) do
    case TradeEngine.Strategy.CandleBridge.get_signal(symbol) do
      nil ->
        IO.puts("❌ No signal for #{symbol}")
      signal ->
        print_signal(signal)
    end
  end

  # ========================================================================
  # TABLE PRINTING
  # ========================================================================

  defp print_table(signals) when map_size(signals) == 0 do
    IO.puts("📊 No active signals")
  end

  defp print_table(signals) do
    header = """
    ╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗
    ║  📊 TRADING SIGNALS - #{DateTime.utc_now() |> DateTime.to_string()} UTC                                                 ║
    ╠══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╣
    ║ ASSET     │ PRICE       │ SIGNAL  │ CONF │ VEL (v/m)  │ ANG (θ°)  │  R²   │ PEAK $      │ PEAK T │ ENERGY │ STATE   │ WALL     ║
    ╠═══════════╪═════════════╪═════════╪══════╪════════════╪═══════════╪═══════╪═════════════╪════════╪════════╪═════════╪══════════╣
    """
    
    IO.puts(header)
    
    signals
    |> Map.values()
    |> Enum.sort_by(& &1.symbol)
    |> Enum.each(&print_row/1)
    
    footer = """
    ╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝
    """
    IO.puts(footer)
  end

  defp print_row(signal) do
    symbol = signal.symbol |> String.slice(0..7) |> String.pad_trailing(8)
    price = signal.current_price |> format_price(8)
    direction_str = format_direction(signal.direction, signal.confidence)
    confidence = signal.confidence |> format_int(4)
    
    # ✅ FIX: Extract velocity properly
    velocity = get_velocity(signal)
    velocity_str = format_float(velocity, 10)
    
    # ✅ FIX: Handle negative angles
    angle = signal.trajectory_angle || 0.0
    angle_str = format_float(angle, 9)
    
    peak_price = signal.peak_price |> format_price(11)
    peak_time = signal.peak_time |> Float.round(1) |> format_float(6)
    
    energy = signal.energy_state |> format_energy(6)
    state = format_state(signal.direction, signal.momentum, signal.gravity)
    
    wall = case signal.order_flow do
      %{wall: wall_type} -> format_wall(wall_type)
      _ -> "NONE     "
    end
    
    r_squared = calculate_r_squared(signal.momentum, signal.gravity) |> format_float(5)
    
    row = """
    ║ #{symbol} │ #{price} │ #{direction_str} │ #{confidence} │ #{velocity_str} │ #{angle_str} │ #{r_squared} │ #{peak_price} │ #{peak_time} │ #{energy} │ #{state} │ #{wall} ║
    """
    
    IO.write(row)
  end

  # ========================================================================
  # FORMATTING HELPERS
  # ========================================================================

  defp get_velocity(signal) do
    # ✅ FIX: Try velocity field first, fall back to momentum
    cond do
      Map.has_key?(signal, :velocity) and is_number(signal.velocity) ->
        signal.velocity
      Map.has_key?(signal, :momentum) and is_number(signal.momentum) ->
        signal.momentum
      true ->
        0.0
    end
  end

  defp format_price(nil, width), do: String.pad_leading("N/A", width)
  defp format_price(price, width) do
    case price do
      %Decimal{} = d ->
        d
        |> Decimal.to_float()
        |> Float.round(2)
        |> Float.to_string()
        |> String.slice(0..8)
        |> String.pad_leading(width)
      n when is_float(n) ->
        n
        |> Float.round(2)
        |> Float.to_string()
        |> String.pad_leading(width)
      _ ->
        String.pad_leading("ERR", width)
    end
  end

  defp format_float(nil, width), do: String.pad_leading("0.0", width)
  defp format_float(val, width) when is_float(val) do
    val
    |> Float.round(4)
    |> Float.to_string()
    |> String.pad_leading(width)
  end
  defp format_float(_, width), do: String.pad_leading("0.0", width)

  defp format_int(nil, width), do: String.pad_leading("0", width)
  defp format_int(val, width) when is_integer(val) do
    val
    |> Integer.to_string()
    |> String.pad_leading(width)
  end
  defp format_int(_, width), do: String.pad_leading("0", width)

  defp format_direction(:long, conf) do
    emoji = if conf >= 70, do: "✅", else: if conf >= 55, do: "🟢", else: "🟡"
    "#{emoji} LONG  "
  end
  defp format_direction(:short, conf) do
    emoji = if conf >= 70, do: "❌", else: if conf >= 55, do: "🔴", else: "🟠"
    "#{emoji} SHORT "
  end
  defp format_direction(_, _) do
    "➖ NEUT  "
  end

  defp format_energy(:high, width), do: String.pad_trailing("HIGH", width)
  defp format_energy(:medium, width), do: String.pad_trailing("MED", width)
  defp format_energy(:low, width), do: String.pad_trailing("LOW", width)
  defp format_energy(_, width), do: String.pad_trailing("?", width)

  defp format_state(direction, momentum, gravity) do
    momentum = if is_number(momentum), do: momentum, else: 0.0
    gravity = if is_number(gravity), do: gravity, else: 0.0001
    
    speed = abs(momentum)
    
    cond do
      # Bullish strong
      direction == :long and speed > 0.01 ->
        "STRONG▲"
      # Bullish weak
      direction == :long ->
        "WEAK▲ "
      # Bearish strong
      direction == :short and speed > 0.01 ->
        "STRONG▼"
      # Bearish weak
      direction == :short ->
        "WEAK▼ "
      # Neutral
      true ->
        "NEUT——"
    end
  end

  defp format_wall(wall_type) do
    case wall_type do
      :buy_wall -> "BUY    "
      :sell_wall -> "SELL   "
      :balanced -> "BAL    "
      _ -> "NONE   "
    end
  end

  defp calculate_r_squared(momentum, gravity) do
    if gravity > 0 and is_number(momentum) do
      # R² as correlation strength between momentum and gravity
      ratio = abs(momentum) / gravity
      min(ratio, 0.999)
    else
      0.0
    end
  end

  # ========================================================================
  # SINGLE SIGNAL DISPLAY
  # ========================================================================

  defp print_signal(signal) do
    IO.puts("""
    
    ╔════════════════════════════════════════════════════════════════════╗
    ║                       📊 SIGNAL DETAILS                            ║
    ╠════════════════════════════════════════════════════════════════════╣
    ║ Symbol:        #{String.pad_trailing(signal.symbol, 50)}
    ║ Direction:     #{format_signal_direction(signal.direction, signal.confidence)}
    ║ Confidence:    #{signal.confidence}%
    ║
    ║ PHYSICS MODEL
    ║ ├─ Momentum (v₀):      #{format_val(signal.momentum, 6)} (velocity slope)
    ║ ├─ Velocity (v):       #{format_val(get_velocity(signal), 6)} (current)
    ║ ├─ Gravity (g):        #{format_val(signal.gravity, 6)} (resistance)
    ║ ├─ Angle (θ):          #{format_val(signal.trajectory_angle, 6)}° (trajectory)
    ║ ├─ Kinetic Energy:     #{format_val(signal.kinetic_energy, 6)}
    ║ └─ Energy State:       #{signal.energy_state}
    ║
    ║ PRICE TARGETS
    ║ ├─ Current Price:      $#{format_decimal(signal.current_price)}
    ║ ├─ Entry Price:        $#{format_decimal(signal.entry_price)}
    ║ ├─ Peak/Trough Price:  $#{format_val(signal.peak_price, 2)}
    ║ ├─ Peak Time:          #{Float.round(signal.peak_time, 1)} candles
    ║ ├─ Stop Loss:          $#{format_decimal(signal.stop_loss)}
    ║ └─ Take Profit:        $#{format_decimal(signal.take_profit)}
    ║
    ║ PREDICTIONS
    ║ ├─ 5m:   $#{format_val(signal.target_5m, 2)}
    ║ ├─ 15m:  $#{format_val(signal.target_15m, 2)}
    ║ ├─ 30m:  $#{format_val(signal.target_30m, 2)}
    ║ └─ 60m:  $#{format_val(signal.target_60m, 2)}
    ║
    ║ Timestamp: #{DateTime.to_string(signal.timestamp)}
    ╚════════════════════════════════════════════════════════════════════╝
    """)
  end

  defp format_signal_direction(:long, conf) do
    emoji = if conf >= 70, do: "✅", else: if conf >= 55, do: "🟢", else: "🟡"
    "#{emoji} LONG (#{conf}% confidence)"
  end
  defp format_signal_direction(:short, conf) do
    emoji = if conf >= 70, do: "❌", else: if conf >= 55, do: "🔴", else: "🟠"
    "#{emoji} SHORT (#{conf}% confidence)"
  end
  defp format_signal_direction(_, conf) do
    "➖ NEUTRAL (#{conf}% confidence)"
  end

  defp format_val(nil, decimals), do: String.duplicate(" ", decimals + 2)
  defp format_val(val, decimals) when is_number(val) do
    val
    |> Float.round(decimals)
    |> Float.to_string()
  end
  defp format_val(_, decimals), do: String.duplicate(" ", decimals + 2)

  defp format_decimal(nil), do: "N/A"
  defp format_decimal(%Decimal{} = d) do
    d |> Decimal.to_float() |> Float.round(2) |> Float.to_string()
  end
  defp format_decimal(n) when is_number(n) do
    n |> Float.round(2) |> Float.to_string()
  end
  defp format_decimal(_), do: "ERR"
end