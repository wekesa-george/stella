# ============================================================================
# PHYSICS TRADING CONSOLE - REAL-TIME SIGNAL MONITOR
# ============================================================================
defmodule TradeEngine.Console.PhysicsMonitor do
  @moduledoc """
  🎮 PHYSICS TRADING CONSOLE
  
  Real-time monitoring of physics signals with all parameters:
  - Momentum (v₀) - initial velocity/speed
  - Acceleration (a) - rate of change
  - Gravity (g) - market selling pressure
  - Peak Price (P*) - predicted maximum
  - Peak Time (t*) - time to peak in candles
  - Dip Price - predicted bottom
  - Dip Time - time to bottom
  - Signal Type - bullish_lift, bearish_dump, bounce_zone
  - Confidence - signal strength %
  - Trajectory Angle (θ) - entry signal quality
  - Energy State - high/medium/low
  
  ## Usage
  
      Physics.signals()              # Show all active signals
      Physics.watch()                # Auto-refresh every 5s
      Physics.watch_symbol("BTC")    # Watch specific symbol
      Physics.details("BTCUSDT")     # Show detailed analysis
      Physics.compare()              # Compare all signals
      Physics.best_signals(60)       # Show signals > 60% confidence
      Physics.entry_opportunities()  # Show ready-to-trade signals
  """

  require Logger
  alias TradeEngine.Strategy.CandleBridge
  alias TradeEngine.Physics.SignalGenerator

  # ========================================================================
  # MAIN COMMANDS
  # ========================================================================

  @doc "Show all current trading signals with physics details"
  def signals(sort_by \\ :confidence) do
    case CandleBridge.get_signals() do
      signals when is_map(signals) ->
        signals_list = signals
          |> Map.values()
          |> Enum.filter(&is_signal?/1)
          |> sort_signals(sort_by)
        
        if Enum.empty?(signals_list) do
          IO.puts("\n📭 No active signals yet\n")
        else
          print_signals_table(signals_list)
        end
        signals_list

      _ ->
        IO.puts("\n❌ Failed to fetch signals\n")
        []
    end
  end

  @doc "Watch signals with auto-refresh (Ctrl+C to stop)"
  def watch(interval \\ 5000, filter \\ nil) do
    clear_screen()
    IO.puts("🔄 Physics Signal Monitor (refreshing every #{div(interval, 1000)}s) - Press Ctrl+C to stop\n")
    
    spawn(fn ->
      loop_watch(interval, filter)
    end)
    
    # Keep main process alive
    Process.sleep(:infinity)
  end

  @doc "Watch specific symbol continuously"
  def watch_symbol(symbol, interval \\ 5000) do
    symbol_upper = String.upcase(symbol)
    
    clear_screen()
    IO.puts("📡 Monitoring #{symbol_upper} - Press Ctrl+C to stop\n")
    
    spawn(fn ->
      loop_watch_symbol(symbol_upper, interval)
    end)
    
    Process.sleep(:infinity)
  end

  @doc "Show detailed analysis of specific symbol"
  def details(symbol) do
    symbol_upper = String.upcase(symbol)
    
    case CandleBridge.get_signal(symbol_upper) do
      signal when is_map(signal) ->
        print_signal_details(symbol_upper, signal)
      
      _ ->
        IO.puts("\n❌ No signal data for #{symbol_upper}\n")
    end
  end

  @doc "Compare all active signals side-by-side"
  def compare do
    signals = signals(:confidence)
    
    if Enum.empty?(signals) do
      IO.puts("\n📭 No signals to compare\n")
      :ok
    else
      print_comparison_table(signals)
    end
  end

  @doc "Show only high-confidence signals (>= threshold)"
  def best_signals(threshold \\ 60) do
    signals = signals()
      |> Enum.filter(fn sig -> sig.confidence >= threshold end)
    
    if Enum.empty?(signals) do
      IO.puts("\n🎯 No signals with confidence >= #{threshold}%\n")
    else
      IO.puts("\n✨ HIGH CONFIDENCE SIGNALS (>= #{threshold}%)\n")
      print_signals_table(signals)
    end
    
    signals
  end

  @doc "Show entry-ready signals (high confidence + good physics)"
  def entry_opportunities do
    signals = signals()
      |> Enum.filter(fn sig -> 
        sig.confidence >= 55 and 
        to_float(Map.get(sig, :trajectory_angle, 0)) >= 18.0 and
        Map.get(sig, :energy_state, :low) != :low
      end)
    
    if Enum.empty?(signals) do
      IO.puts("\n📭 No entry opportunities right now\n")
    else
      IO.puts("\n🚀 READY-TO-TRADE SIGNALS\n")
      print_signals_table(signals)
    end
    
    signals
  end

  @doc "Show physics comparison: momentum vs gravity"
  def physics_breakdown do
    signals = signals()
    
    IO.puts("\n")
    IO.puts("╔════════════════════════════════════════════════════════════════════════════╗")
    IO.puts("║               PHYSICS BREAKDOWN - MOMENTUM vs GRAVITY                      ║")
    IO.puts("╠════════════╪═══════════╪════════════╪════════════╪═════════════════════════╣")
    IO.puts("║ SYMBOL     │ MOMENTUM  │   GRAVITY  │  RATIO     │ INTERPRETATION         ║")
    IO.puts("╠════════════╪═══════════╪════════════╪════════════╪═════════════════════════╣")
    
    Enum.each(signals, fn sig ->
      symbol = pad(sig.symbol, 10)
      momentum = to_float(Map.get(sig, :momentum, 0.0)) |> Float.round(6)
      gravity = to_float(Map.get(sig, :gravity, 0.0)) |> Float.round(6)
      ratio = if gravity != 0 do
        Float.round(momentum / gravity, 4)
      else
        if momentum > 0, do: 999.99, else: -999.99
      end
      
      interpretation = case sig.direction do
        :long when momentum > 0.001 and gravity < 0.005 -> "🚀 Strong lift"
        :long when momentum > 0 -> "📈 Bullish"
        :short when momentum < -0.001 -> "📉 Sharp dump"
        :short -> "🔴 Bearish"
        _ -> "⏸️  Neutral"
      end
      
      IO.puts("║ #{symbol} │ #{pad("#{momentum}", 9)} │ #{pad("#{gravity}", 10)} │ #{pad("#{ratio}", 10)} │ #{pad(interpretation, 21)} ║")
    end)
    
    IO.puts("╚════════════╪═══════════╪════════════╪════════════╪═════════════════════════╝")
    :ok
  end

  @doc "Show peak predictions across all signals"
  def peak_predictions do
    signals = signals()
    
    IO.puts("\n")
    IO.puts("╔═════════════════════════════════════════════════════════════════════════════════════════╗")
    IO.puts("║                           PEAK PRICE PREDICTIONS                                       ║")
    IO.puts("╠════════════╪═══════════╪═══════════════╪═════════════╪═══════════╪═════════════════════╣")
    IO.puts("║ SYMBOL     │ CURRENT   │  PEAK PRICE   │ PEAK TIME   │ UPSIDE %  │ CONFIDENCE          ║")
    IO.puts("╠════════════╪═══════════╪═══════════════╪═════════════╪═══════════╪═════════════════════╣")
    
    Enum.each(signals, fn sig ->
      symbol = pad(sig.symbol, 10)
      current = to_float(sig.current_price) |> Float.round(4)
      peak = to_float(Map.get(sig, :peak_price, sig.current_price)) |> Float.round(4)
      peak_time = Map.get(sig, :peak_time, 0)
      upside = if current != 0 do
        ((peak - current) / current * 100) |> Float.round(2)
      else
        0.0
      end
      confidence = sig.confidence
      
      conf_bar = build_confidence_bar(confidence)
      
      IO.puts("║ #{symbol} │ $#{pad("#{current}", 7)} │ $#{pad("#{peak}", 11)} │ #{pad("#{peak_time}m", 11)} │ #{pad("#{upside}%", 9)} │ #{conf_bar} ║")
    end)
    
    IO.puts("╚════════════╪═══════════╪═══════════════╪═════════════╪═══════════╪═════════════════════╝")
    :ok
  end

  @doc "Show dip prices (support levels)"
  def dip_levels do
    signals = signals()
    
    IO.puts("\n")
    IO.puts("╔═════════════════════════════════════════════════════════════════════════════╗")
    IO.puts("║                           DIP PRICE PREDICTIONS                             ║")
    IO.puts("╠════════════╪═══════════╪══════════════╪══════════════╪════════════════════╣")
    IO.puts("║ SYMBOL     │ CURRENT   │  DIP PRICE   │ DIP TIME     │ DOWNSIDE %         ║")
    IO.puts("╠════════════╪═══════════╪══════════════╪══════════════╪════════════════════╣")
    
    Enum.each(signals, fn sig ->
      symbol = pad(sig.symbol, 10)
      current = to_float(sig.current_price) |> Float.round(4)
      dip = to_float(Map.get(sig, :dip_price, sig.current_price)) |> Float.round(4)
      dip_time = Map.get(sig, :dip_time, 0)
      downside = if current != 0 do
        ((current - dip) / current * 100) |> Float.round(2)
      else
        0.0
      end
      
      IO.puts("║ #{symbol} │ $#{pad("#{current}", 7)} │ $#{pad("#{dip}", 10)} │ #{pad("#{dip_time}m", 12)} │ #{pad("#{downside}%", 18)} ║")
    end)
    
    IO.puts("╚════════════╪═══════════╪══════════════╪══════════════╪════════════════════╝")
    :ok
  end

  @doc "Show energy state analysis"
  def energy_analysis do
    signals = signals()
    
    energy_states = %{high: 0, medium: 0, low: 0}
    
    energy_counts = Enum.reduce(signals, energy_states, fn sig, acc ->
      state = Map.get(sig, :energy_state, :low)
      Map.update(acc, state, 1, &(&1 + 1))
    end)
    
    IO.puts("\n")
    IO.puts("╔═══════════════════════════════════════════════════════╗")
    IO.puts("║            ENERGY STATE DISTRIBUTION                  ║")
    IO.puts("╠═══════════════════════════════════════════════════════╣")
    IO.puts("║  🔴 HIGH ENERGY:    #{pad("#{energy_counts.high} signals", 40)} ║")
    IO.puts("║  🟡 MEDIUM ENERGY:  #{pad("#{energy_counts.medium} signals", 40)} ║")
    IO.puts("║  🟢 LOW ENERGY:     #{pad("#{energy_counts.low} signals", 40)} ║")
    IO.puts("╠═══════════════════════════════════════════════════════╣")
    IO.puts("║  Total: #{pad("#{length(signals)} active signals", 48)} ║")
    IO.puts("╚═══════════════════════════════════════════════════════╝")
    :ok
  end

  @doc "Show trajectory angle distribution (entry quality)"
  def angle_analysis do
    signals = signals()
    
    angles = Enum.map(signals, &to_float(Map.get(&1, :trajectory_angle, 0.0)))
    
    steep = Enum.count(angles, &(&1 >= 25.0))
    good = Enum.count(angles, &(&1 >= 18.0 and &1 < 25.0))
    shallow = Enum.count(angles, &(&1 < 18.0))
    
    avg_angle = if length(angles) > 0 do
      Float.round(Enum.sum(angles) / length(angles), 2)
    else
      0.0
    end
    
    IO.puts("\n")
    IO.puts("╔═══════════════════════════════════════════════════════╗")
    IO.puts("║         TRAJECTORY ANGLE DISTRIBUTION (Entry Quality)  ║")
    IO.puts("╠═══════════════════════════════════════════════════════╣")
    IO.puts("║  🚀 STEEP (>= 25°):    #{pad("#{steep} signals", 40)} ║")
    IO.puts("║  ✅ GOOD (18-25°):     #{pad("#{good} signals", 40)} ║")
    IO.puts("║  ❌ SHALLOW (< 18°):   #{pad("#{shallow} signals", 40)} ║")
    IO.puts("╠═══════════════════════════════════════════════════════╣")
    IO.puts("║  Average angle: #{pad("#{avg_angle}°", 41)} ║")
    IO.puts("╚═══════════════════════════════════════════════════════╝")
    :ok
  end

  # ========================================================================
  # PRIVATE FUNCTIONS
  # ========================================================================

  defp loop_watch(interval, filter) do
    clear_screen()
    signals(filter)
    Process.sleep(interval)
    loop_watch(interval, filter)
  end

  defp loop_watch_symbol(symbol, interval) do
    clear_screen()
    details(symbol)
    Process.sleep(interval)
    loop_watch_symbol(symbol, interval)
  end

  defp print_signals_table(signals) when is_list(signals) do
    IO.puts("\n")
    IO.puts("╔═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗")
    IO.puts("║                                        PHYSICS SIGNAL ANALYSIS - REAL-TIME MONITOR                                               ║")
    IO.puts("╠════════════╪══════════╪═══════════╪═══════════╪═══════════╪═══════════╪════════╪════════╪═════════════╪═════════╪═════════════╣")
    IO.puts("║ SYMBOL     │ SIGNAL   │ MOMENTUM  │  GRAVITY  │ PEAK PRICE│ PEAK TIME │ ANGLE  │ E-STATE│ CONFIDENCE  │ UPSIDE%│ DIP PRICE   ║")
    IO.puts("╠════════════╪══════════╪═══════════╪═══════════╪═══════════╪═══════════╪════════╪════════╪═════════════╪═════════╪═════════════╣")
    
    Enum.each(signals, fn sig ->
      symbol = pad(sig.symbol, 10)
      
      signal_str = case sig.direction do
        :long -> "🟢 LONG"
        :short -> "🔴 SHORT"
        :neutral -> "⏸️  HOLD"
        _ -> "?"
      end
      signal_str = pad(signal_str, 8)
      
      momentum = to_float(Map.get(sig, :momentum, 0.0)) |> Float.round(5)
      gravity = to_float(Map.get(sig, :gravity, 0.0)) |> Float.round(5)
      peak_price_val = to_float(Map.get(sig, :peak_price, sig.current_price))
      peak_price = peak_price_val |> Float.round(2)
      peak_time = Map.get(sig, :peak_time, 0)
      angle = to_float(Map.get(sig, :trajectory_angle, 0.0)) |> Float.round(1)
      
      energy_emoji = case Map.get(sig, :energy_state, :low) do
        :high -> "🔴 HIGH"
        :medium -> "🟡 MED"
        :low -> "🟢 LOW"
        _ -> "UNKNOWN"
      end
      energy_emoji = pad(energy_emoji, 6)
      
      conf_bar = build_confidence_bar(sig.confidence)
      
      current_price = to_float(sig.current_price)
      upside = if current_price != 0 do
        ((peak_price_val - current_price) / current_price * 100) |> Float.round(1)
      else
        0.0
      end
      dip_price = to_float(Map.get(sig, :dip_price, sig.current_price)) |> Float.round(2)
      
      IO.puts("║ #{symbol} │ #{signal_str} │ #{pad("#{momentum}", 9)} │ #{pad("#{gravity}", 9)} │ $#{pad("#{peak_price}", 7)} │ #{pad("#{peak_time}m", 9)} │ #{pad("#{angle}°", 6)} │ #{energy_emoji} │ #{conf_bar} │ #{pad("#{upside}%", 7)} │ $#{pad("#{dip_price}", 9)} ║")
    end)
    
    IO.puts("╚════════════╪══════════╪═══════════╪═══════════╪═══════════╪═══════════╪════════╪════════╪═════════════╪═════════╪═════════════╝")
    IO.puts("\n📊 Showing #{length(signals)} signals\n")
  end

  defp print_signal_details(symbol, signal) do
    IO.puts("\n")
    IO.puts("╔══════════════════════════════════════════════════════════════════════════════╗")
    IO.puts("║  📊 DETAILED SIGNAL ANALYSIS: #{pad(symbol, 50)}║")
    IO.puts("╠══════════════════════════════════════════════════════════════════════════════╣")
    
    IO.puts("║ SIGNAL INFORMATION                                                          ║")
    IO.puts("├──────────────────────────────────────────────────────────────────────────────┤")
    
    signal_type = case signal.direction do
      :long -> "🟢 BULLISH LIFT"
      :short -> "🔴 BEARISH DUMP"
      :neutral -> "⏸️  NEUTRAL"
      _ -> "UNKNOWN"
    end
    IO.puts("║  Direction:        #{pad(signal_type, 60)} ║")
    IO.puts("║  Confidence:       #{pad("#{signal.confidence}%", 60)} ║")
    current_price = to_float(signal.current_price)
    IO.puts("║  Current Price:    #{pad("$#{Float.round(current_price, 4)}", 60)} ║")
    
    IO.puts("║ PHYSICS PARAMETERS                                                          ║")
    IO.puts("├──────────────────────────────────────────────────────────────────────────────┤")
    
    momentum = to_float(Map.get(signal, :momentum, 0.0)) |> Float.round(6)
    IO.puts("║  Momentum (v₀):    #{pad("#{momentum} (bullish force)", 60)} ║")
    
    gravity = to_float(Map.get(signal, :gravity, 0.0)) |> Float.round(6)
    IO.puts("║  Gravity (g):      #{pad("#{gravity} (selling pressure)", 60)} ║")
    
    velocity = to_float(Map.get(signal, :velocity, momentum)) |> Float.round(6)
    IO.puts("║  Velocity:         #{pad("#{velocity} (rate of change)", 60)} ║")
    
    acceleration = to_float(Map.get(signal, :acceleration, -gravity)) |> Float.round(6)
    IO.puts("║  Acceleration:     #{pad("#{acceleration} (change in momentum)", 60)} ║")
    
    trajectory = to_float(Map.get(signal, :trajectory_angle, 0.0)) |> Float.round(2)
    IO.puts("║  Trajectory (θ):   #{pad("#{trajectory}° (entry quality)", 60)} ║")
    
    energy = to_float(Map.get(signal, :kinetic_energy, 0.0)) |> Float.round(4)
    IO.puts("║  Kinetic Energy:   #{pad("#{energy}", 60)} ║")
    
    energy_state = Map.get(signal, :energy_state, :low)
    IO.puts("║  Energy State:     #{pad("#{energy_state}", 60)} ║")
    
    IO.puts("║ PRICE PREDICTIONS                                                           ║")
    IO.puts("├──────────────────────────────────────────────────────────────────────────────┤")
    
    peak_price_val = to_float(Map.get(signal, :peak_price, signal.current_price))
    peak_price = peak_price_val |> Float.round(4)
    peak_time = Map.get(signal, :peak_time, 0)
    peak_str = if signal.direction == :short, do: "$#{peak_price} (in 0m)", else: "$#{peak_price} (in #{peak_time}m)"
    IO.puts("║  Peak Price (P*):  #{pad(peak_str, 60)} ║")
    
    upside = if current_price != 0 do
      ((peak_price_val - current_price) / current_price * 100) |> Float.round(2)
    else
      0.0
    end
    IO.puts("║  Upside Potential: #{pad("#{upside}%", 60)} ║")
    
    dip_time = Map.get(signal, :dip_time, (if signal.direction == :long, do: peak_time * 2, else: 0))
    dip_price_val = to_float(Map.get(signal, :dip_price, (if signal.direction == :short, do: peak_price_val, else: signal.current_price)))
    dip_price = dip_price_val |> Float.round(4)
    dip_str = "$#{dip_price} (in #{dip_time}m)"
    IO.puts("║  Dip Price:        #{pad(dip_str, 60)} ║")
    
    downside = if current_price != 0 do
      ((current_price - dip_price_val) / current_price * 100) |> Float.round(2)
    else
      0.0
    end
    IO.puts("║  Downside Risk:    #{pad("#{downside}%", 60)} ║")
    
    IO.puts("║ ENTRY RECOMMENDATIONS                                                       ║")
    IO.puts("├──────────────────────────────────────────────────────────────────────────────┤")
    
    entry_price_val = to_float(Map.get(signal, :entry_price, signal.current_price))
    entry_price = entry_price_val |> Float.round(4)
    IO.puts("║  Entry Price:      #{pad("$#{entry_price}", 60)} ║")
    
    take_profit_val = to_float(Map.get(signal, :take_profit, peak_price_val * 0.96))
    take_profit = take_profit_val |> Float.round(4)
    IO.puts("║  Take Profit:      #{pad("$#{take_profit}", 60)} ║")
    
    stop_loss_val = to_float(Map.get(signal, :stop_loss, current_price * 0.98))
    stop_loss = stop_loss_val |> Float.round(4)
    IO.puts("║  Stop Loss:        #{pad("$#{stop_loss}", 60)} ║")
    
    risk_reward = if (entry_price_val - stop_loss_val) != 0 do
      ((take_profit_val - entry_price_val) / (entry_price_val - stop_loss_val)) |> Float.round(2)
    else
      0.0
    end
    IO.puts("║  Risk/Reward:      #{pad("#{risk_reward}:1", 60)} ║")
    
    IO.puts("╚══════════════════════════════════════════════════════════════════════════════╝\n")
  end

  defp print_comparison_table(signals) do
    IO.puts("\n")
    IO.puts("╔════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗")
    IO.puts("║                            SIGNAL COMPARISON - MOMENTUM vs GRAVITY                                           ║")
    IO.puts("╠════════════╪═══════════╪═══════════╪═════════╪═════════════╪═══════════════════════════════════════════════╣")
    IO.puts("║ SYMBOL     │ MOMENTUM  │ GRAVITY   │ RATIO   │ PEAK PRICE  │ DOMINANCE INDICATOR                           ║")
    IO.puts("╠════════════╪═══════════╪═══════════╪═════════╪═════════════╪═══════════════════════════════════════════════╣")
    
    Enum.each(signals, fn sig ->
      symbol = pad(sig.symbol, 10)
      momentum = to_float(Map.get(sig, :momentum, 0.0)) |> Float.round(6)
      gravity = to_float(Map.get(sig, :gravity, 0.0)) |> Float.round(6)
      ratio = if gravity != 0 do
        Float.round(momentum / gravity, 3)
      else
        if momentum > 0, do: 999.99, else: -999.99
      end
      peak_price = to_float(Map.get(sig, :peak_price, sig.current_price)) |> Float.round(2)
      
      dominance = cond do
        ratio > 2 -> "🚀 Strong momentum dominance (bullish)"
        ratio > 1 -> "📈 Moderate momentum (trending up)"
        ratio > 0.5 -> "⚖️  Balanced forces (uncertain)"
        ratio > 0 -> "📉 Gravity gaining (bearish forming)"
        true -> "🔴 Gravity dominance (dump phase)"
      end
      
      IO.puts("║ #{symbol} │ #{pad("#{momentum}", 9)} │ #{pad("#{gravity}", 9)} │ #{pad("#{ratio}", 7)} │ $#{pad("#{peak_price}", 9)} │ #{pad(dominance, 51)} ║")
    end)
    
    IO.puts("╚════════════╪═══════════╪═══════════╪═════════╪═════════════╪═══════════════════════════════════════════════╝\n")
  end

  defp sort_signals(signals, sort_by) do
    case sort_by do
      :confidence -> Enum.sort_by(signals, &(&1.confidence), :desc)
      :momentum -> Enum.sort_by(signals, fn sig -> to_float(Map.get(sig, :momentum, 0.0)) end, :desc)
      :angle -> Enum.sort_by(signals, fn sig -> to_float(Map.get(sig, :trajectory_angle, 0.0)) end, :desc)
      :upside -> Enum.sort_by(signals, fn sig ->
        peak = to_float(Map.get(sig, :peak_price, sig.current_price))
        current = to_float(sig.current_price)
        if current != 0, do: (peak - current) / current, else: 0.0
      end, :desc)
      _ -> signals
    end
  end

  defp build_confidence_bar(confidence) do
    filled = div(confidence, 10)
    empty = 10 - filled
    bar = String.duplicate("█", filled) <> String.duplicate("░", empty)
    
    color = cond do
      confidence >= 70 -> IO.ANSI.green()
      confidence >= 55 -> IO.ANSI.yellow()
      true -> IO.ANSI.red()
    end
    reset = IO.ANSI.reset()
    
    "#{color}#{bar}#{reset} #{pad("#{confidence}%", 5)}"
  end

  defp clear_screen do
    IO.write("\e[2J\e[H")
  end

  defp pad(str, width) do
    str = to_string(str)
    len = String.length(str)
    if len >= width do
      String.slice(str, 0, width)
    else
      str <> String.duplicate(" ", width - len)
    end
  end

  defp is_signal?(sig) do
    is_map(sig) and Map.has_key?(sig, :direction) and Map.has_key?(sig, :confidence)
  end

  defp to_float(value) do
    cond do
      is_struct(value, Decimal) -> Decimal.to_float(value)
      is_float(value) -> value
      is_integer(value) -> value * 1.0
      true -> 0.0
    end
  end
end

# ============================================================================
# CONVENIENCE SHORTCUTS
# ============================================================================
defmodule Physics do
  @moduledoc "Quick access to physics console commands"
  
  defdelegate signals(), to: TradeEngine.Console.PhysicsMonitor
  defdelegate signals(sort), to: TradeEngine.Console.PhysicsMonitor
  defdelegate watch(), to: TradeEngine.Console.PhysicsMonitor
  defdelegate watch(interval), to: TradeEngine.Console.PhysicsMonitor
  defdelegate watch_symbol(symbol), to: TradeEngine.Console.PhysicsMonitor
  defdelegate watch_symbol(symbol, interval), to: TradeEngine.Console.PhysicsMonitor
  defdelegate details(symbol), to: TradeEngine.Console.PhysicsMonitor
  defdelegate compare(), to: TradeEngine.Console.PhysicsMonitor
  defdelegate best_signals(threshold), to: TradeEngine.Console.PhysicsMonitor
  defdelegate entry_opportunities(), to: TradeEngine.Console.PhysicsMonitor
  defdelegate physics_breakdown(), to: TradeEngine.Console.PhysicsMonitor
  defdelegate peak_predictions(), to: TradeEngine.Console.PhysicsMonitor
  defdelegate dip_levels(), to: TradeEngine.Console.PhysicsMonitor
  defdelegate energy_analysis(), to: TradeEngine.Console.PhysicsMonitor
  defdelegate angle_analysis(), to: TradeEngine.Console.PhysicsMonitor
end