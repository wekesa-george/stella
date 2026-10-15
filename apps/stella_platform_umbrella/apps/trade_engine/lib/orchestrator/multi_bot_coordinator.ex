defmodule TradeEngine.Orchestrator.MultiBotCoordinator do
  @moduledoc """
  🚀 MULTI-BOT COORDINATOR v16.2 HFT
  
  Manages 8 MarginScalper bots for $200/hr target
  
  Usage:
    # Start all 8 bots
    TradeEngine.Orchestrator.MultiBotCoordinator.start_all()
    
    # Stop all bots  
    TradeEngine.Orchestrator.MultiBotCoordinator.stop_all()
    
    # View combined status
    TradeEngine.Orchestrator.MultiBotCoordinator.status()
    
    # View individual bot
    TradeEngine.Orchestrator.MultiBotCoordinator.status(3)
  """
  
  require Logger
  
  @total_bots 8
  @capital_per_bot 1000
  @target_per_hour_per_bot 25
  @trades_per_hour_target 50
  
  @bot_asset_pools %{
    1 => ~w(LTCUSDT ATOMUSDT AVAXUSDT LINKUSDT),
    2 => ~w(INJUSDT UNIUSDT APTUSDT ARBUSDT),
    3 => ~w(DOTUSDT NEARUSDT DOGEUSDT SHIBUSDT 1000SHIBUSDT),
    4 => ~w(PEPEUSDT 1000PEPEUSDT FLOKIUSDT 1000FLOKIUSDT BONKUSDT 1000BONKUSDT WIFUSDT),
    5 => ~w(XRPUSDT ADAUSDT ALGOUSDT MATICUSDT),
    6 => ~w(FTMUSDT SANDUSDT MANAUSDT GALAUSDT),
    7 => ~w(OPUSDT IMXUSDT BLURUSDT MASKUSDT),
    8 => ~w(SUIUSDT SEIUSDT TIAUSDT JUPUSDT)
  }
  
  # ═══════════════════════════════════════════════════════════════════════════════
  # PUBLIC API
  # ═══════════════════════════════════════════════════════════════════════════════
  
  @doc """
  Start all 8 bots with staggered timing
  """
  def start_all do
    Logger.info("""
    
    🚀 ═══════════════════════════════════════════════════════════════════════════════
    🚀 MULTI-BOT COORDINATOR - STARTING 8 BOTS
    🚀 ═══════════════════════════════════════════════════════════════════════════════
    🚀 💰 Total Capital: $#{@total_bots * @capital_per_bot}
    🚀 🎯 Target: #{@total_bots} × $#{@target_per_hour_per_bot}/hr = $#{@total_bots * @target_per_hour_per_bot}/hr
    🚀 📊 Trades: #{@total_bots} × #{@trades_per_hour_target}/hr = #{@total_bots * @trades_per_hour_target}/hr
    🚀 ═══════════════════════════════════════════════════════════════════════════════
    """)
    
    results = for bot_id <- 1..@total_bots do
      # Set environment variable for this bot
      System.put_env("BOT_ID", Integer.to_string(bot_id))
      
      # Start the bot (in reality, you'd spawn separate processes)
      Logger.info("🤖 Starting Bot #{bot_id} with assets: #{inspect(@bot_asset_pools[bot_id])}")
      
      # Stagger start by 500ms
      Process.sleep(500)
      
      {:ok, bot_id}
    end
    
    # Start the actual scalper (single instance for now)
    # In production, use separate BEAM nodes or OS processes
    TradeEngine.Orchestrator.MarginScalper.start_trading()
    
    Logger.info("""
    
    ✅ ═══════════════════════════════════════════════════════════════════════════════
    ✅ ALL BOTS INITIALIZED
    ✅ 
    ✅ For true multi-bot deployment, run separate IEx sessions:
    ✅   Terminal 1: BOT_ID=1 iex -S mix
    ✅   Terminal 2: BOT_ID=2 iex -S mix
    ✅   ... etc
    ✅ 
    ✅ Or use the bash script: ./start_8_bots.sh start
    ✅ ═══════════════════════════════════════════════════════════════════════════════
    """)
    
    {:ok, results}
  end
  
  @doc """
  Stop all bots
  """
  def stop_all do
    Logger.info("🛑 Stopping all bots...")
    TradeEngine.Orchestrator.MarginScalper.stop_trading()
    {:ok, :stopped}
  end
  
  @doc """
  Get combined status across all bots
  """
  def status do
    # For single-process mode, just get the main scalper status
    case TradeEngine.Orchestrator.MarginScalper.status() do
      {:ok, status} ->
        print_combined_status(status)
        {:ok, status}
      error ->
        error
    end
  end
  
  def status(bot_id) when bot_id in 1..8 do
    Logger.info("📊 Bot #{bot_id} status - Assets: #{inspect(@bot_asset_pools[bot_id])}")
    status()
  end
  
  @doc """
  Calculate projected hourly revenue
  """
  def projection do
    case TradeEngine.Orchestrator.MarginScalper.status() do
      {:ok, status} ->
        uptime_hours = max(status.uptime_seconds / 3600, 0.1)
        current_pnl = status.total_pnl
        pnl_per_hour = current_pnl / uptime_hours
        trades_per_hour = status.total_trades / uptime_hours
        
        # Project to 8 bots
        projected_8_bots = pnl_per_hour * 8
        
        IO.puts("""
        
        📈 ═══════════════════════════════════════════════════════════════════════════════
        📈 REVENUE PROJECTION
        📈 ═══════════════════════════════════════════════════════════════════════════════
        
        Current Performance (1 Bot):
        ────────────────────────────
        P&L/Hour:        $#{Float.round(pnl_per_hour, 2)}
        Trades/Hour:     #{Float.round(trades_per_hour, 1)}
        Win Rate:        #{status.win_rate}%
        
        Projected (8 Bots):
        ────────────────────────────
        P&L/Hour:        $#{Float.round(projected_8_bots, 2)}
        Trades/Hour:     #{Float.round(trades_per_hour * 8, 0)}
        Target:          $200/hr
        Gap:             $#{Float.round(200 - projected_8_bots, 2)}
        
        Required per Bot to hit $200/hr:
        ────────────────────────────
        P&L/Hour:        $#{Float.round(200 / 8, 2)}
        
        📈 ═══════════════════════════════════════════════════════════════════════════════
        """)
        
        {:ok, %{
          current_pnl_per_hour: pnl_per_hour,
          projected_8_bots: projected_8_bots,
          trades_per_hour: trades_per_hour,
          target: 200,
          gap: 200 - projected_8_bots
        }}
        
      error ->
        error
    end
  end
  
  @doc """
  Show asset pool assignments
  """
  def pools do
    IO.puts("""
    
    🤖 ═══════════════════════════════════════════════════════════════════════════════
    🤖 MULTI-BOT ASSET POOLS
    🤖 ═══════════════════════════════════════════════════════════════════════════════
    """)
    
    for {bot_id, assets} <- Enum.sort(@bot_asset_pools) do
      IO.puts("  Bot #{bot_id}: #{Enum.join(assets, ", ")}")
    end
    
    IO.puts("""
    
    🤖 ═══════════════════════════════════════════════════════════════════════════════
    """)
    
    @bot_asset_pools
  end
  
  @doc """
  Quick setup instructions
  """
  def help do
    IO.puts("""
    
    🚀 ═══════════════════════════════════════════════════════════════════════════════
    🚀 MARGIN SCALPER v16.2 - MULTI-BOT QUICK START
    🚀 ═══════════════════════════════════════════════════════════════════════════════
    
    OPTION 1: Single Process (Testing)
    ──────────────────────────────────
    iex> TradeEngine.Orchestrator.MultiBotCoordinator.start_all()
    iex> TradeEngine.Orchestrator.MultiBotCoordinator.status()
    iex> TradeEngine.Orchestrator.MultiBotCoordinator.projection()
    
    OPTION 2: Multiple Terminals (Production - Recommended)
    ──────────────────────────────────────────────────────────
    Terminal 1:
      export BOT_ID=1
      iex -S mix -e 'TradeEngine.Orchestrator.MarginScalper.start_trading()'
    
    Terminal 2:
      export BOT_ID=2
      iex -S mix -e 'TradeEngine.Orchestrator.MarginScalper.start_trading()'
    
    ... (repeat for bots 3-8)
    
    OPTION 3: Bash Script (Production)
    ──────────────────────────────────
    chmod +x start_8_bots.sh
    ./start_8_bots.sh start
    ./start_8_bots.sh status
    ./start_8_bots.sh stop
    
    MONITORING:
    ──────────────────────────────────
    - Logs: /var/www/umbrella_app/trade_logs/
    - Hourly files: trades_YYYY-MM-DD_HHh.log
    - Dashboard: TradeEngine.Orchestrator.MarginScalper.dashboard()
    
    🚀 ═══════════════════════════════════════════════════════════════════════════════
    """)
  end
  
  # ═══════════════════════════════════════════════════════════════════════════════
  # PRIVATE
  # ═══════════════════════════════════════════════════════════════════════════════
  
  defp print_combined_status(status) do
    IO.puts("""
    
    📊 ═══════════════════════════════════════════════════════════════════════════════
    📊 COMBINED BOT STATUS
    📊 ═══════════════════════════════════════════════════════════════════════════════
    
    Bot ID:          #{Map.get(status, :bot_id, "Not Set")}
    Version:         #{status.version}
    Status:          #{if status.active, do: "🟢 ACTIVE", else: "🔴 STOPPED"}
    Uptime:          #{status.uptime_formatted}
    
    Performance:
    ────────────────────────────
    Total Trades:    #{status.total_trades}
    Win Rate:        #{status.win_rate}%
    Total P&L:       $#{Float.round(status.total_pnl, 2)}
    Locked Profit:   $#{Float.round(status.locked_profit, 2)}
    
    Hourly Metrics:
    ────────────────────────────
    Trades/Hour:     #{Float.round(status.total_trades / max(status.uptime_seconds / 3600, 0.1), 1)}
    P&L/Hour:        $#{Float.round(status.total_pnl / max(status.uptime_seconds / 3600, 0.1), 2)}
    
    8-Bot Projection:
    ────────────────────────────
    Projected/Hour:  $#{Float.round(status.total_pnl / max(status.uptime_seconds / 3600, 0.1) * 8, 2)}
    Target:          $200/hr
    
    📊 ═══════════════════════════════════════════════════════════════════════════════
    """)
  end
end