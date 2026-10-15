defmodule TradeEngine.Dashboard.TradingConsole do
  @moduledoc """
  🎯 TRADING CONSOLE - Complete Monitoring Dashboard
  """

  require Logger
  alias TradeEngine.Orchestrator.SignalTrader
  alias TradeEngine.Strategy.CandleBridge
  alias TradeEngine.Physics.PredictionTracker

  # ========== STATUS ==========
  def status do
    case SignalTrader.get_stats() do
      stats when is_map(stats) ->
        IO.puts("""
        
        ╔════════════════════════════════════════════╗
        ║  🤖 SIGNAL TRADER STATUS                   ║
        ╠════════════════════════════════════════════╣
        ║  Status:         #{String.pad_trailing(to_string(stats.status), 25)}
        ║  Uptime:         #{format_uptime(stats.uptime)}
        ║  Open Positions: #{String.pad_trailing(to_string(stats.open_positions), 25)}
        ║  Total Trades:   #{String.pad_trailing(to_string(stats.total_trades), 25)}
        ║  Win Rate:       #{String.pad_trailing(format_percent(stats.win_rate), 25)}
        ║  Signals:        #{String.pad_trailing(to_string(stats.signals_processed), 25)}
        ║  Exchange Exec:  #{String.pad_trailing(if(Map.get(stats, :exchange_execution, false), do: "✅ ON", else: "❌ OFF"), 25)}
        ║  Errors:         #{String.pad_trailing(to_string(stats.errors), 25)}
        ╚════════════════════════════════════════════╝
        """)
        :ok
      
      _ ->
        IO.puts("❌ Could not retrieve trader status")
        :error
    end
  end

  # ========== HEALTH ==========
  def health do
    kline_ok = check_process(TradeEngine.Exchanges.Binance.KlineStream)
    depth_ok = check_process(TradeEngine.Exchanges.Binance.DepthStream)
    ticker_ok = check_process(TradeEngine.Exchanges.Binance.TickerStream)
    bridge_ok = check_process(TradeEngine.Strategy.CandleBridge)
    trader_ok = check_process(TradeEngine.Orchestrator.SignalTrader)
    
    IO.puts("""
    
    ╔════════════════════════════════════════════╗
    ║  🏥 SYSTEM HEALTH CHECK                    ║
    ╠════════════════════════════════════════════╣
    ║  #{status_emoji(kline_ok)} KlineStream                            ║
    ║  #{status_emoji(depth_ok)} DepthStream                            ║
    ║  #{status_emoji(ticker_ok)} TickerStream                           ║
    ║  #{status_emoji(bridge_ok)} CandleBridge                           ║
    ║  #{status_emoji(trader_ok)} SignalTrader                           ║
    ╠════════════════════════════════════════════╣
    ║  #{if all_ok?([kline_ok, depth_ok, bridge_ok, trader_ok]), do: "✅ All systems operational", else: "⚠️  Some systems offline"}                ║
    ╚════════════════════════════════════════════╝
    """)
    :ok
  end

  defp check_process(module) do
    case Process.whereis(module) do
      nil -> false
      pid -> Process.alive?(pid)
    end
  end

  defp status_emoji(true), do: "✅"
  defp status_emoji(false), do: "❌"

  defp all_ok?(list), do: Enum.all?(list, & &1)

  # ========== SIGNALS ==========
  def signals do
    case CandleBridge.get_signals() do
      signals when is_map(signals) and map_size(signals) > 0 ->
        IO.puts("\n📊 ACTIVE SIGNALS (#{map_size(signals)} assets)\n")
        print_signals_table(signals)
        IO.puts("")
        :ok
      
      _ ->
        IO.puts("⚠️ No active signals")
        :error
    end
  end

  defp print_signals_table(signals) do
    header = """
    ╔═════════════╦════════════╦════════════╦════════╦════════════╦══════════╦══════════╦═════════╗
    ║ SYMBOL      ║ CURRENT    ║ DIRECTION  ║ CONF   ║ TARGET     ║ PEAK IN  ║ AGE      ║ CHANGE  ║
    ╠═════════════╬════════════╬════════════╬════════╬════════════╬══════════╬══════════╬═════════╣
    """
    IO.write(header)

    now = DateTime.utc_now()
    
    signals
    |> Map.values()
    |> Enum.sort_by(& &1.confidence, :desc)
    |> Enum.each(fn signal ->
      symbol = String.pad_trailing(signal.symbol, 11)
      
      # Current price
      current = case signal.current_price do
        %Decimal{} = d -> Decimal.to_float(d)
        n when is_number(n) -> n
        _ -> 0.0
      end
      current_str = format_price_compact(current, 10)
      
      direction = format_direction(signal.direction, 10)
      confidence = String.pad_leading("#{signal.confidence}%", 6)
      
      # Get peak/dip price (target)
      {target_price, peak_time, _target_type} = get_target_info(signal)
      target_str = format_price_compact(target_price, 10)
      
      # Peak time (time until peak from physics)
      peak_str = format_time_remaining(peak_time, 8)
      
      # Signal age (how long since this signal was generated)
      signal_age = case Map.get(signal, :generated_at) || Map.get(signal, :timestamp) do
        %DateTime{} = dt -> DateTime.diff(now, dt, :second) / 60
        _ -> 0.0
      end
      age_str = format_signal_age(signal_age, 8)
      
      # Calculate % change to target
      change_pct = if current > 0 do
        ((target_price - current) / current) * 100
      else
        0.0
      end
      change_str = format_change(change_pct, 7)

      IO.write("║ #{symbol} ║ #{current_str} ║ #{direction} ║ #{confidence} ║ #{target_str} ║ #{peak_str} ║ #{age_str} ║ #{change_str} ║\n")
    end)

    IO.write("╚═════════════╩════════════╩════════════╩════════╩════════════╩══════════╩══════════╩═════════╝\n")
    
    # Legend
    IO.puts("\n📝 PEAK IN = Time to reach target | AGE = Signal duration | Max hold: 30m")
  end
  
  defp format_time_remaining(minutes, width) when is_number(minutes) do
    clamped = min(minutes, 30.0)  # Max 30 minutes for scalping
    str = "#{Float.round(clamped, 1)}m"
    String.pad_trailing(str, width)
  end
  defp format_time_remaining(_, width), do: String.pad_trailing("?", width)
  
  defp format_signal_age(minutes, width) when is_number(minutes) and minutes > 0 do
    str = cond do
      minutes < 1 -> "NEW"
      minutes < 60 -> "#{Float.round(minutes, 0) |> trunc()}m"
      true -> "#{Float.round(minutes / 60, 1)}h"
    end
    
    # Add warning if signal is old (over 30 min for scalping)
    str = if minutes > 30, do: "⚠️#{str}", else: str
    String.pad_trailing(str, width)
  end
  defp format_signal_age(_, width), do: String.pad_trailing("NEW", width)

  defp get_target_info(signal) do
    # Try different field names for peak/dip
    target_price = cond do
      is_number(signal[:peak_price]) -> signal.peak_price
      is_map(signal[:physics]) and is_number(signal.physics[:peak_price]) -> signal.physics.peak_price
      true -> 0.0
    end
    
    target_time = cond do
      is_number(signal[:peak_time]) -> signal.peak_time
      is_map(signal[:physics]) and is_number(signal.physics[:peak_time]) -> signal.physics.peak_time
      true -> 0.0
    end
    
    target_type = case signal.direction do
      :long -> "Peak"
      :short -> "Trough"
      _ -> "Target"
    end
    
    {target_price, target_time, target_type}
  end

  defp format_price_compact(price, width) when is_number(price) and price > 0 do
    formatted = cond do
      price >= 1000 -> "$#{Float.round(price, 0) |> trunc()}"
      price >= 1 -> "$#{Float.round(price, 2)}"
      price >= 0.01 -> "$#{Float.round(price, 4)}"
      true -> "$#{Float.round(price, 6)}"
    end
    String.pad_leading(formatted, width)
  end
  defp format_price_compact(_, width), do: String.pad_leading("N/A", width)

  defp format_change(pct, width) when is_number(pct) do
    emoji = if pct >= 0, do: "↑", else: "↓"
    str = "#{emoji}#{abs(Float.round(pct, 1))}%"
    String.pad_leading(str, width)
  end
  defp format_change(_, width), do: String.pad_leading("?", width)

  # ========== STATS ==========
  def stats do
    case SignalTrader.get_stats() do
      stats when is_map(stats) ->
        IO.puts("""
        
        ╔═══════════════════════════════════════════════════════════╗
        ║  📊 DETAILED STATISTICS                                   ║
        ╠═══════════════════════════════════════════════════════════╣
        ║  Status:            #{String.pad_trailing(to_string(stats.status), 40)}
        ║  Uptime:            #{String.pad_trailing(format_uptime(stats.uptime), 40)}
        ║  Exchange Execution: #{String.pad_trailing(if(Map.get(stats, :exchange_execution, false), do: "✅ ENABLED", else: "❌ DISABLED"), 37)}
        ╠═══════════════════════════════════════════════════════════╣
        ║  SIGNAL METRICS                                           ║
        ║  ├─ Signals Processed:  #{String.pad_trailing(to_string(stats.signals_processed), 36)}
        ║  ├─ Errors:             #{String.pad_trailing(to_string(stats.errors), 36)}
        ╠═══════════════════════════════════════════════════════════╣
        ║  TRADING METRICS                                          ║
        ║  ├─ Open Positions:     #{String.pad_trailing(to_string(stats.open_positions), 36)}
        ║  ├─ Total Trades:       #{String.pad_trailing(to_string(stats.total_trades), 36)}
        ║  ├─ Winning Trades:     #{String.pad_trailing(to_string(stats.winning_trades), 36)}
        ║  ├─ Losing Trades:      #{String.pad_trailing(to_string(Map.get(stats, :losing_trades, 0)), 36)}
        ║  ├─ Win Rate:           #{String.pad_trailing(format_percent(stats.win_rate), 36)}
        ╠═══════════════════════════════════════════════════════════╣
        ║  P&L METRICS                                              ║
        ║  ├─ Realized P&L:       #{String.pad_trailing(format_pnl(Map.get(stats, :realized_pnl, 0)), 36)}
        ║  ├─ Unrealized P&L:     #{String.pad_trailing(format_pnl(Map.get(stats, :unrealized_pnl, 0)), 36)}
        ║  └─ Total P&L:          #{String.pad_trailing(format_pnl(stats.total_pnl), 36)}
        ╚═══════════════════════════════════════════════════════════╝
        """)
        :ok
      
      _ ->
        IO.puts("❌ Could not retrieve statistics")
        :error
    end
  end

  # ========== HISTORY ==========
  def history(limit \\ 20) do
    case CandleBridge.get_signals() do
      signals when is_map(signals) ->
        signal_list = signals
          |> Map.values()
          |> Enum.sort_by(& &1.timestamp, {:desc, DateTime})
          |> Enum.take(limit)

        IO.puts("\n📋 RECENT SIGNALS (Last #{limit})\n")
        
        header = """
        ╔═════════════╦════════════╦════════════╦══════════╦═════════════════════════╗
        ║ ASSET       ║ DIRECTION  ║ CONF %     ║ PRICE    ║ TIMESTAMP               ║
        ╠═════════════╬════════════╬════════════╬══════════╬═════════════════════════╣
        """
        IO.write(header)

        signal_list
        |> Enum.each(fn signal ->
          symbol = String.pad_trailing(signal.symbol, 11)
          direction = format_direction(signal.direction, 10)
          confidence = String.pad_leading(to_string(signal.confidence), 10)
          price = format_price(signal.current_price, 8)
          timestamp = format_timestamp(signal.timestamp, 23)

          IO.write("║ #{symbol} ║ #{direction} ║ #{confidence} ║ #{price} ║ #{timestamp} ║\n")
        end)

        IO.write("╚═════════════╩════════════╩════════════╩══════════╩═════════════════════════╝\n")
        IO.puts("")
        :ok
      
      _ ->
        IO.puts("⚠️ No signal history available")
        :error
    end
  end

  # ========== PNL ==========
  def pnl do
    case SignalTrader.get_stats() do
      stats when is_map(stats) ->
        realized = Map.get(stats, :realized_pnl, 0.0)
        unrealized = Map.get(stats, :unrealized_pnl, 0.0)
        total = realized + unrealized

        IO.puts("""
        
        ╔═══════════════════════════════════════════════════════════╗
        ║  💰 P&L SUMMARY                                           ║
        ╠═══════════════════════════════════════════════════════════╣
        ║  OPEN POSITIONS                                           ║
        ║  ├─ Count:            #{String.pad_trailing(to_string(stats.open_positions), 40)}
        ║  ├─ Unrealized P&L:   #{String.pad_trailing(format_pnl(unrealized), 40)}
        ╠═══════════════════════════════════════════════════════════╣
        ║  CLOSED POSITIONS                                         ║
        ║  ├─ Total Trades:     #{String.pad_trailing(to_string(stats.total_trades), 40)}
        ║  ├─ Winners:          #{String.pad_trailing(to_string(stats.winning_trades), 40)}
        ║  ├─ Losers:           #{String.pad_trailing(to_string(Map.get(stats, :losing_trades, 0)), 40)}
        ║  ├─ Win Rate:         #{String.pad_trailing(format_percent(stats.win_rate), 40)}
        ║  ├─ Realized P&L:     #{String.pad_trailing(format_pnl(realized), 40)}
        ╠═══════════════════════════════════════════════════════════╣
        ║  TOTAL                                                    ║
        ║  └─ Total P&L:        #{String.pad_trailing(format_pnl(total), 40)}
        ╚═══════════════════════════════════════════════════════════╝
        """)
        :ok
      
      _ ->
        IO.puts("❌ Could not retrieve P&L data")
        :error
    end
  end

  # ========== DASHBOARD ==========
  def dashboard do
    IO.puts("\n" <> String.duplicate("═", 80))
    IO.puts("🎯 PHYSICS TRADING ENGINE - FULL DASHBOARD")
    IO.puts(String.duplicate("═", 80) <> "\n")

    status()
    stats()
    signals()
    pnl()

    IO.puts(String.duplicate("═", 80))
    IO.puts("Last updated: #{DateTime.utc_now()}")
    IO.puts(String.duplicate("═", 80) <> "\n")
    
    :ok
  end

  # ========== PREDICTIONS ==========
  def predictions do
    case PredictionTracker.get_tracking_stats() do
      stats when is_map(stats) ->
        total_predictions = Map.get(stats, :total_predictions, 0)
        successful = Map.get(stats, :successful_predictions, 0)
        avg_accuracy = Map.get(stats, :avg_accuracy, 0.0)
        success_rate = Map.get(stats, :success_rate, 0.0)

        IO.puts("""
        
        ╔═══════════════════════════════════════════════════════════╗
        ║  📈 PREDICTION TRACKING                                   ║
        ╠═══════════════════════════════════════════════════════════╣
        ║  Status:            #{String.pad_trailing(to_string(stats.status), 40)}
        ║  Total Symbols:     #{String.pad_trailing(to_string(stats.total_symbols), 40)}
        ║  Total Signals:     #{String.pad_trailing(to_string(stats.total_signals), 40)}
        ║  Total Predictions: #{String.pad_trailing(to_string(total_predictions), 40)}
        ║  Successful:        #{String.pad_trailing(to_string(successful), 40)}
        ║  Accuracy:          #{String.pad_trailing(format_percent(avg_accuracy), 40)}
        ║  Success Rate:      #{String.pad_trailing(format_percent(success_rate), 40)}
        ╚═══════════════════════════════════════════════════════════╝
        """)
        :ok
      
      _ ->
        IO.puts("⚠️ No prediction tracking data available")
        :error
    end
  end

  # ========== FORMATTING ==========
  
  defp format_percent(value) when is_number(value) and value >= 0 do
    "#{Float.round(value * 1.0, 1)}%"
  end
  defp format_percent(_), do: "0.0%"

  defp format_uptime(seconds) when is_integer(seconds) do
    hours = div(seconds, 3600)
    minutes = div(rem(seconds, 3600), 60)
    secs = rem(seconds, 60)
    String.pad_trailing("#{hours}h #{minutes}m #{secs}s", 25)
  end
  defp format_uptime(_), do: String.pad_trailing("N/A", 25)

  defp format_pnl(value) when is_number(value) do
    emoji = if value >= 0, do: "✅", else: "❌"
    "#{emoji} $#{Float.round(value * 1.0, 2)}"
  end
  defp format_pnl(_), do: "N/A"

  defp format_price(price, width) when is_number(price) do
    price |> Float.round(2) |> Float.to_string() |> String.pad_leading(width)
  end
  defp format_price(%Decimal{} = d, width) do
    d |> Decimal.to_float() |> Float.round(2) |> Float.to_string() |> String.pad_leading(width)
  end
  defp format_price(_, width), do: String.pad_leading("N/A", width)

  defp format_direction(:long, width), do: "🟢 LONG" |> String.pad_trailing(width)
  defp format_direction(:short, width), do: "🔴 SHORT" |> String.pad_trailing(width)
  defp format_direction(:neutral, width), do: "➖ HOLD" |> String.pad_trailing(width)
  defp format_direction(_, width), do: String.pad_trailing("?", width)

  defp format_timestamp(%DateTime{} = dt, width) do
    dt |> DateTime.to_iso8601() |> String.slice(0..18) |> String.pad_trailing(width)
  end
  defp format_timestamp(_, width) do
    String.pad_trailing("N/A", width)
  end
end

# ============================================================================
# TRADING - Simple Shortcuts with START/STOP
# ============================================================================

defmodule Trading do
  @moduledoc """
  Quick access to trading commands.
  
  Usage:
    Trading.start()      # Start automated trading
    Trading.stop()       # Stop trading
    Trading.status()     # Show status
    Trading.dashboard()  # Full dashboard
    Trading.signals()    # Show active signals
    Trading.positions()  # Show open positions
    Trading.pnl()        # Show P&L summary
    Trading.analyze("BTCUSDT")  # Analyze symbol
    Trading.streams()    # Check WebSocket status
  """
  
  alias TradeEngine.Dashboard.TradingConsole
  alias TradeEngine.Orchestrator.SignalTrader

  # ========== TRADING CONTROL ==========
  
  def start do
    SignalTrader.start_trading()
    IO.puts("""
    
    🟢 TRADING STARTED
    ═══════════════════════════════════════
    • Monitoring signals from CandleBridge
    • Auto-executing LONG/SHORT positions
    • Exit checks running every 10 seconds
    ═══════════════════════════════════════
    
    Use Trading.status() to monitor
    Use Trading.stop() to stop trading
    """)
    :ok
  end

  def stop do
    SignalTrader.stop_trading()
    IO.puts("""
    
    🔴 TRADING STOPPED
    ═══════════════════════════════════════
    • No new positions will be opened
    • Existing positions remain open
    • Use Trading.positions() to view
    ═══════════════════════════════════════
    """)
    :ok
  end

  # ========== MONITORING ==========
  
  def status, do: TradingConsole.status()
  def health, do: TradingConsole.health()
  def signals, do: TradingConsole.signals()
  def stats, do: TradingConsole.stats()
  def history(limit \\ 20), do: TradingConsole.history(limit)
  def pnl, do: TradingConsole.pnl()
  def predictions, do: TradingConsole.predictions()
  def dashboard, do: TradingConsole.dashboard()

  # ========== ANALYSIS ==========
  
  def analyze(symbol) do
    symbol_upper = String.upcase(symbol)
    
    case SignalTrader.analyze_symbol(symbol_upper) do
      {:ok, signal} ->
        physics = signal.physics || %{}
        
        # Get current price
        current = case signal.current_price do
          %Decimal{} = d -> Decimal.to_float(d)
          n when is_number(n) -> n
          _ -> 0.0
        end
        
        # Determine if peak or dip based on direction
        target_label = case signal.direction do
          :long -> "PEAK (target high)"
          :short -> "DIP (target low)"
          _ -> "TARGET"
        end
        
        target_price = physics[:peak_price] || 0.0
        target_time = physics[:peak_time] || 0.0
        
        # Calculate expected change
        change_pct = if current > 0 do
          ((target_price - current) / current) * 100
        else
          0.0
        end
        
        change_emoji = if change_pct >= 0, do: "📈", else: "📉"
        
        IO.puts("""
        
        ╔══════════════════════════════════════════════════════════════╗
        ║  📊 ANALYSIS: #{String.pad_trailing(symbol_upper, 47)}║
        ╠══════════════════════════════════════════════════════════════╣
        ║  SIGNAL                                                      ║
        ║  ├─ Direction:     #{String.pad_trailing(format_dir(signal.direction), 43)}║
        ║  ├─ Confidence:    #{String.pad_trailing("#{signal.confidence}%", 43)}║
        ╠══════════════════════════════════════════════════════════════╣
        ║  PRICES                                                      ║
        ║  ├─ Current:       #{String.pad_trailing("$#{Float.round(current, 2)}", 43)}║
        ║  ├─ #{String.pad_trailing(target_label, 16)} #{String.pad_trailing("$#{Float.round(target_price, 2)}", 41)}║
        ║  ├─ Expected Move: #{String.pad_trailing("#{change_emoji} #{Float.round(change_pct, 2)}%", 43)}║
        ║  ├─ Time to Target:#{String.pad_trailing(" #{Float.round(target_time, 1)} minutes", 43)}║
        ╠══════════════════════════════════════════════════════════════╣
        ║  TRADE LEVELS                                                ║
        ║  ├─ Entry:         #{String.pad_trailing(format_decimal(signal.entry_price), 43)}║
        ║  ├─ Stop Loss:     #{String.pad_trailing(format_decimal(signal.stop_loss), 43)}║
        ║  └─ Take Profit:   #{String.pad_trailing(format_decimal(signal.take_profit), 43)}║
        ╠══════════════════════════════════════════════════════════════╣
        ║  PHYSICS                                                     ║
        ║  ├─ Momentum:      #{String.pad_trailing(format_float(physics[:momentum], 6), 43)}║
        ║  ├─ Gravity:       #{String.pad_trailing(format_float(physics[:gravity], 6), 43)}║
        ║  └─ Energy State:  #{String.pad_trailing(to_string(physics[:energy_state] || "N/A"), 43)}║
        ╚══════════════════════════════════════════════════════════════╝
        """)
        {:ok, signal}
        
      {:error, reason} ->
        IO.puts("❌ Analysis failed: #{reason}")
        {:error, reason}
    end
  end

  # ========== POSITIONS ==========
  
  def positions do
    case SignalTrader.get_open_positions() do
      [] ->
        IO.puts("""
        
        📭 NO OPEN POSITIONS
        ═══════════════════════════════════════
        Start trading with: Trading.start()
        """)
        :ok
        
      positions when is_list(positions) ->
        IO.puts("\n📈 OPEN POSITIONS (#{length(positions)})\n")
        
        IO.puts("╔═══════════╦════════╦════════════╦════════════╦════════════╦════════════╗")
        IO.puts("║ SYMBOL    ║ DIR    ║ ENTRY      ║ CURRENT    ║ P&L        ║ CONF       ║")
        IO.puts("╠═══════════╬════════╬════════════╬════════════╬════════════╬════════════╣")
        
        Enum.each(positions, fn pos ->
          pnl = pos[:unrealized_pnl] || calculate_pnl(pos)
          emoji = if pnl >= 0, do: "✅", else: "❌"
          
          symbol = String.pad_trailing(pos.symbol, 9)
          dir = String.pad_trailing(if(pos.direction == :long, do: "LONG", else: "SHORT"), 6)
          entry = String.pad_leading("$#{Float.round(pos.entry_price, 2)}", 10)
          current = String.pad_leading("$#{Float.round(pos[:current_price] || pos.entry_price, 2)}", 10)
          pnl_str = String.pad_leading("#{emoji}$#{Float.round(pnl, 2)}", 10)
          conf = String.pad_leading("#{pos.confidence}%", 10)
          
          IO.puts("║ #{symbol} ║ #{dir} ║ #{entry} ║ #{current} ║ #{pnl_str} ║ #{conf} ║")
        end)
        
        IO.puts("╚═══════════╩════════╩════════════╩════════════╩════════════╩════════════╝\n")
        :ok
        
      _ ->
        IO.puts("❌ Could not retrieve positions")
        :error
    end
  end

  defp calculate_pnl(pos) do
    current = pos[:current_price] || pos.entry_price
    case pos.direction do
      :long -> (current - pos.entry_price) * pos.quantity
      :short -> (pos.entry_price - current) * pos.quantity
      _ -> 0.0
    end
  end

  # ========== STREAMS ==========
  
  def streams do
    IO.puts("""
    
    ╔════════════════════════════════════════════════════════════╗
    ║  📡 WEBSOCKET STREAM STATUS                                ║
    ╠════════════════════════════════════════════════════════════╣
    """)
    
    # KlineStream
    kline_status = case TradeEngine.Exchanges.Binance.KlineStream.status() do
      {:ok, s} ->
        stale = if s[:is_stale], do: "🔴 STALE", else: "✅ OK"
        "#{stale} | #{s.message_count} msgs | #{s[:seconds_since_last_message] || 0}s ago"
      _ -> "❌ Not running"
    end
    IO.puts("║  KlineStream:  #{String.pad_trailing(kline_status, 44)}║")
    
    # DepthStream
    depth_status = case TradeEngine.Exchanges.Binance.DepthStream.status() do
      {:ok, s} -> "✅ OK | #{s.message_count} msgs"
      _ -> "⚠️ Not available"
    end
    IO.puts("║  DepthStream:  #{String.pad_trailing(depth_status, 44)}║")
    
    # TickerStream
    ticker_status = case TradeEngine.Exchanges.Binance.TickerStream.status() do
      {:ok, s} -> "✅ OK | #{s.message_count} msgs"
      _ -> "⚠️ Not available"
    end
    IO.puts("║  TickerStream: #{String.pad_trailing(ticker_status, 44)}║")
    
    IO.puts("╚════════════════════════════════════════════════════════════╝\n")
    :ok
  end

  # ========== HELPERS ==========
  
  defp format_dir(:long), do: "🟢 LONG"
  defp format_dir(:short), do: "🔴 SHORT"
  defp format_dir(:neutral), do: "➖ NEUTRAL"
  defp format_dir(_), do: "?"

  defp format_decimal(%Decimal{} = d), do: "$#{Decimal.to_float(d) |> Float.round(2)}"
  defp format_decimal(n) when is_number(n), do: "$#{Float.round(n * 1.0, 2)}"
  defp format_decimal(_), do: "N/A"

  defp format_float(nil), do: "N/A"
  defp format_float(n, decimals \\ 2) when is_number(n), do: "#{Float.round(n * 1.0, decimals)}"
  defp format_float(_, _), do: "N/A"

  defp format_time(nil), do: "N/A"
  defp format_time(minutes) when is_number(minutes), do: "#{Float.round(minutes * 1.0, 1)} minutes"
  defp format_time(_), do: "N/A"
end