 #========== AUTO-START TASK ==========

defmodule TradeEngine.Application.TradingStarter do
  @moduledoc """
  GenServer that automatically starts trading systems after initialization delay.
  """
  
  use GenServer
  require Logger

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, %{}, name: __MODULE__)
  end

  @impl true
  def init(state) do
    # Get config
    auto_start_long = Application.get_env(:trade_engine, :auto_start_long, true)
    auto_start_short = Application.get_env(:trade_engine, :auto_start_short, true)
    startup_delay = Application.get_env(:trade_engine, :startup_delay_ms, 15_000)

    if auto_start_long or auto_start_short do
      Logger.info("""
      
      ⏰ AUTO-START CONFIGURED:
         • Long Trading: #{if auto_start_long, do: "✅ ENABLED", else: "❌ DISABLED"}
         • Short Trading: #{if auto_start_short, do: "✅ ENABLED", else: "❌ DISABLED"}
         • Startup Delay: #{startup_delay}ms (waiting for market data to load)
      """)

      # Schedule auto-start after delay
      Process.send_after(self(), :start_trading, startup_delay)
    else
      Logger.info("""
      
      ℹ️  AUTO-START DISABLED
      ════════════════════════════════════════════════════════════
      To manually start trading, use:
         TradeEngine.Orchestrator.AutomatedTrader.start_trading()
         TradeEngine.Orchestrator.MarginShortTrader.start_shorting()
      ════════════════════════════════════════════════════════════
      """)
    end

    {:ok, state}
  end

  @impl true
  def handle_info(:start_trading, state) do
    auto_start_long = Application.get_env(:trade_engine, :auto_start_long, true)
    auto_start_short = Application.get_env(:trade_engine, :auto_start_short, true)

    Logger.info("""
    
    ════════════════════════════════════════════════════════════
    🚀 AUTO-STARTING TRADING SYSTEMS
    ════════════════════════════════════════════════════════════
    """)

    # Start Long (Bullish) Trading
    if auto_start_long do
      case start_long_trading() do
        :ok -> Logger.info("✅ AutomatedTrader (Long/Bullish) STARTED")
        {:error, reason} -> Logger.error("❌ AutomatedTrader failed: #{inspect(reason)}")
      end
    end

    # Small delay between starts
    Process.sleep(2000)

    # Start Short (Bearish) Trading
    if auto_start_short do
      case start_short_trading() do
        :ok -> Logger.info("✅ MarginShortTrader (Short/Bearish) STARTED")
        {:error, reason} -> Logger.error("❌ MarginShortTrader failed: #{inspect(reason)}")
      end
    end

    Logger.info("""
    ════════════════════════════════════════════════════════════
    ✅ AUTO-START COMPLETE
    
    Both trading systems are now:
      • Analyzing market signals from #{Application.get_env(:trade_engine, :max_pairs, 100)} pairs
      • Executing trades for users with sufficient balance
      • Managing risk with stop-loss and take-profit orders
    ════════════════════════════════════════════════════════════
    
    """)

    {:noreply, state}
  end

  # Helper functions with error handling
  defp start_long_trading do
    try do
      TradeEngine.Orchestrator.AutomatedTrader.start_trading()
      :ok
    rescue
      e -> {:error, e}
    end
  end

  defp start_short_trading do
    try do
      TradeEngine.Orchestrator.MarginShortTrader.start_shorting()
      :ok
    rescue
      e -> {:error, e}
    end
  end
end