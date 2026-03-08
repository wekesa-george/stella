defmodule TradeEngine.API do
  alias TradeEngine.Repo

  @moduledoc """
  🔌 TRADE ENGINE PUBLIC API v2

  Single entry point for the SysAdmin dashboard to interact with TradeEngine.
  All functions return {:ok, data} or {:error, reason}.

  CATEGORIES:
  1. Trading Controls   — start/stop/pause trading
  2. Capital Management — allocate, scale, configure capital
  3. Bot Management     — create/start/stop/monitor bots
  4. Positions          — enriched with bot_id, mark price, PnL
  5. Orders             — enriched with bot_id, order_type, fill status
  6. Performance        — stats, analytics, P&L
  7. Risk               — limits, tier info, drawdown
  8. Market Data        — signals, prices, candles
  9. System Health      — process status, uptime, CPU/RAM
  """

  require Logger

  alias TradeEngine.Orchestrator.SignalTrader
  alias TradeEngine.Risk.{AssetTierManager, VirtualBalanceManager, CapitalAllocator}
  alias TradeEngine.Trading.PositionManager
  alias TradeEngine.Strategy.CandleBridge
  alias TradeEngine.Bots.{BotRegistry, BotSupervisor, Bot, BotFSM}
  alias TradeEngine.API.Enrichment

  # ============================================================================
  # 1. TRADING CONTROLS
  # ============================================================================

  def start_trading do
    SignalTrader.start_trading()
    {:ok, %{status: :started, timestamp: DateTime.utc_now()}}
  rescue
    e -> {:error, %{reason: :start_failed, detail: Exception.message(e)}}
  end

  def stop_trading do
    SignalTrader.stop_trading()
    {:ok, %{status: :stopped, timestamp: DateTime.utc_now()}}
  rescue
    e -> {:error, %{reason: :stop_failed, detail: Exception.message(e)}}
  end

  def restart_trading do
    SignalTrader.restart()
    {:ok, %{status: :restarted, timestamp: DateTime.utc_now()}}
  rescue
    e -> {:error, %{reason: :restart_failed, detail: Exception.message(e)}}
  end

  def close_all_positions do
    result = SignalTrader.close_all_positions()
    {:ok, %{result: result, timestamp: DateTime.utc_now()}}
  rescue
    e -> {:error, %{reason: :close_all_failed, detail: Exception.message(e)}}
  end

  def pause_user_trading(user_id), do: CapitalAllocator.pause_trading(user_id)
  def resume_user_trading(user_id), do: CapitalAllocator.resume_trading(user_id)

  # ============================================================================
  # 2. CAPITAL MANAGEMENT
  # ============================================================================

  def configure_capital(user_id, config), do: CapitalAllocator.configure(user_id, config)
  def set_active_capital(user_id, amount), do: CapitalAllocator.set_active_capital(user_id, amount)
  def set_total_capital(user_id, amount), do: CapitalAllocator.set_total_capital(user_id, amount)
  def set_scaling_mode(user_id, mode), do: CapitalAllocator.set_scaling_mode(user_id, mode)
  def get_capital_status(user_id), do: CapitalAllocator.get_dashboard_status(user_id)
  def get_all_allocations, do: {:ok, CapitalAllocator.all_allocations()}

  # ============================================================================
  # 3. BOT MANAGEMENT
  # ============================================================================

  @doc """
  Create a new trading bot.
  attrs must include: name, credential_id, trading_pairs
  attrs may include: strategy_id, config, risk_overrides
  """
  def create_bot(user_id, attrs), do: BotRegistry.register_bot(user_id, attrs)

  @doc """
  Create a system bot owned by a service account (no real user required).
  attrs must include: name, trading_pairs
  attrs may include: credential_id, strategy_id, config, risk_overrides
  """
  def create_system_bot(service_account_id, attrs) do
    BotRegistry.register_system_bot(service_account_id, attrs)
  end

  @doc """
  Deploy a bot — creates and auto-starts in one call.
  The bot is created with status `initializing`, then auto-started.
  Returns the bot runtime. If start fails, includes `start_error` in the response.
  """
  def deploy_bot(user_id, attrs) do
    # register_bot now auto-starts via Task after 200ms
    BotRegistry.register_bot(user_id, attrs)
  end

  @doc "Deploy a system bot — creates and auto-starts in one call."
  def deploy_system_bot(service_account_id, attrs) do
    BotRegistry.register_system_bot(service_account_id, attrs)
  end

  @doc "Get state transition history for a bot."
  def get_bot_transitions(bot_id, opts \\ []) do
    transitions = BotFSM.get_history(bot_id, opts)
    {:ok, transitions}
  end

  @doc "Get a single bot with full runtime + enriched data"
  def get_bot(bot_id) do
    case BotRegistry.get_bot_full(bot_id) do
      {:ok, runtime} -> {:ok, Enrichment.enrich_bot(runtime)}
      error -> error
    end
  end

  @doc "List all bots with dashboard data (accepts optional filter map)"
  def list_bots(filters \\ %{}), do: BotRegistry.get_all_bots_dashboard(filters)

  @doc "List bots for a specific user"
  def list_user_bots(user_id) do
    bots = BotRegistry.list_user_bots(user_id)
    {:ok, Enum.map(bots, &Enrichment.enrich_bot/1)}
  end

  @doc "Start a bot — validates, launches supervised trading process"
  def start_bot(bot_id), do: BotRegistry.start_bot(bot_id)

  @doc "Pause a bot — keeps process alive but stops trading"
  def pause_bot(bot_id), do: BotRegistry.pause_bot(bot_id)

  @doc "Stop a bot — terminates trading process"
  def stop_bot(bot_id), do: BotRegistry.stop_bot(bot_id)

  @doc "Place a manual order through a running bot's trading process"
  def place_manual_order(bot_id, params) do
    case BotSupervisor.find_process(bot_id) do
      nil ->
        {:error, :bot_not_running}

      pid ->
        try do
          GenServer.call(pid, {:manual_order, params}, 15_000)
        catch
          :exit, reason -> {:error, {:process_error, reason}}
        end
    end
  end

  @doc "Update bot configuration (must be stopped first)"
  def configure_bot(bot_id, config_attrs) do
    case TradeEngine.Bots.get_bot(bot_id) do
      {:ok, %{status: status} = bot} when status in ["stopped", "initializing", "error"] ->
        case TradeEngine.Bots.update_bot(bot, config_attrs) do
          {:ok, _updated} = result ->
            BotRegistry.refresh_bot(bot_id)
            result
          error ->
            error
        end
      {:ok, _} ->
        {:error, :must_stop_first}
      error ->
        error
    end
  end

  @doc "Get bot configuration"
  def get_bot_config(bot_id) do
    case BotRegistry.get_bot(bot_id) do
      {:ok, runtime} ->
        {:ok, %{
          bot_id: runtime.id,
          name: runtime.name,
          credential_id: runtime.credential_id,
          strategy_id: runtime.strategy_id,
          trading_pairs: runtime.trading_pairs,
          config: runtime.config,
          risk_overrides: runtime.risk_overrides,
          status: runtime.status
        }}
      error -> error
    end
  end

  def update_bot(bot_id, attrs) do
    case TradeEngine.Bots.get_bot(bot_id) do
      {:ok, bot} ->
        case TradeEngine.Bots.update_bot(bot, attrs) do
          {:ok, _updated} = result ->
            BotRegistry.refresh_bot(bot_id)
            result
          error ->
            error
        end
      error -> error
    end
  end

  def delete_bot(bot_id) do
    case TradeEngine.Bots.get_bot(bot_id) do
      {:ok, %{status: status} = bot} when status in ["stopped", "initializing", "error"] ->
        # Clean up all FK-referencing records before deleting the bot
        for table <- ~w(equity_snapshots positions orders monitoring_alerts bot_logs bot_state_transitions) do
          Repo.query!("DELETE FROM trading.#{table} WHERE bot_id = $1::uuid", [Ecto.UUID.dump!(bot_id)])
        end

        case TradeEngine.Bots.delete_bot(bot) do
          {:ok, _} = result ->
            BotRegistry.deregister_bot(bot_id)
            result
          error ->
            error
        end
      {:ok, _} ->
        {:error, :must_stop_first}
      error ->
        error
    end
  end

  @doc "Get structured logs for a bot"
  def get_bot_logs(bot_id, opts \\ []) do
    logs = TradeEngine.Bots.BotLog.query_logs(bot_id, opts)

    {:ok, Enum.map(logs, fn log ->
      %{
        id: log.id,
        bot_id: log.bot_id,
        level: log.level,
        category: log.category,
        message: log.message,
        metadata: log.metadata,
        created_at: log.created_at
      }
    end)}
  end

  @doc "Get OHLCV bars for a bot's trading pair via its exchange credential"
  def get_bot_bars(bot_id, timeframe \\ "5Min", limit \\ 120) do
    alias TradeEngine.Exchanges.Executor

    case BotRegistry.get_bot(bot_id) do
      {:ok, runtime} ->
        credential_id = runtime.credential_id
        pair = List.first(runtime.trading_pairs || [])

        cond do
          is_nil(credential_id) ->
            {:error, :no_credential}

          is_nil(pair) ->
            {:error, :no_trading_pair}

          true ->
            case Executor.get_bars(credential_id, pair, timeframe, limit) do
              {:ok, bars} -> {:ok, bars}
              error -> error
            end
        end

      error ->
        error
    end
  end

  @doc "Get equity curve snapshots for a bot"
  def get_bot_equity_curve(bot_id, opts \\ []) do
    alias TradeEngine.Trading.EquitySnapshot
    snapshots = EquitySnapshot.get_bot_curve(bot_id, opts)
    {:ok, snapshots}
  end

  @doc "Get platform-wide equity curve (aggregated across all bots)"
  def get_platform_equity_curve(opts \\ []) do
    limit = Keyword.get(opts, :limit, 200)
    since = Keyword.get(opts, :since)

    import Ecto.Query
    alias TradeEngine.Trading.EquitySnapshot

    # Get the last snapshot per bot per hour bucket, then sum across bots
    # This avoids inflating equity by counting multiple snapshots per bot per hour
    since_clause = if since, do: "AND s.snapshot_at > '#{DateTime.to_iso8601(since)}'", else: ""

    sql = """
    WITH hourly_latest AS (
      SELECT DISTINCT ON (bot_id, date_trunc('hour', snapshot_at))
        bot_id,
        date_trunc('hour', snapshot_at) AS hour,
        total_equity_usd,
        unrealized_pnl_usd,
        realized_pnl_usd,
        open_positions,
        snapshot_at
      FROM trading.equity_snapshots
      WHERE total_equity_usd > 0 #{since_clause}
      ORDER BY bot_id, date_trunc('hour', snapshot_at), snapshot_at DESC
    )
    SELECT
      hour AS snapshot_at,
      SUM(total_equity_usd) AS total_equity_usd,
      SUM(unrealized_pnl_usd) AS unrealized_pnl_usd,
      SUM(realized_pnl_usd) AS realized_pnl_usd,
      SUM(open_positions) AS open_positions,
      COUNT(DISTINCT bot_id) AS bot_count
    FROM hourly_latest
    GROUP BY hour
    ORDER BY hour ASC
    LIMIT $1
    """

    case Repo.query(sql, [limit]) do
      {:ok, %{columns: cols, rows: rows}} ->
        results = Enum.map(rows, fn row ->
          Enum.zip(cols, row) |> Map.new(fn {k, v} -> {String.to_atom(k), v} end)
        end)
        {:ok, results}
      {:error, err} ->
        require Logger
        Logger.error("[API] Platform equity curve query failed: #{inspect(err)}")
        {:ok, []}
    end
  rescue
    e -> {:error, %{reason: :query_failed, detail: Exception.message(e)}}
  end

  @doc "Get list of running bot trading processes"
  def get_bot_processes do
    {:ok, BotSupervisor.which_children()}
  end

  def get_system_metrics, do: {:ok, BotRegistry.get_system_metrics()}

  # ============================================================================
  # 3b. SERVICE ACCOUNTS
  # ============================================================================

  alias TradeEngine.Platform.ServiceAccounts

  def list_service_accounts, do: {:ok, ServiceAccounts.list()}

  def get_service_account(id), do: ServiceAccounts.get(id)

  def create_service_account(attrs), do: ServiceAccounts.create(attrs)

  def update_service_account(id, attrs) do
    case ServiceAccounts.get(id) do
      {:ok, sa} -> ServiceAccounts.update(sa, attrs)
      error -> error
    end
  end

  def delete_service_account(id) do
    case ServiceAccounts.get(id) do
      {:ok, sa} -> ServiceAccounts.delete(sa)
      error -> error
    end
  end

  # ============================================================================
  # 3b. BOT ENGINE DEFAULTS
  # ============================================================================

  alias TradeEngine.Platform.BotEngineDefaults

  @doc "Get the singleton bot engine defaults row"
  def get_bot_engine_defaults do
    case Repo.one(BotEngineDefaults) do
      nil -> {:error, :not_found}
      defaults -> {:ok, defaults}
    end
  end

  @doc "Update bot engine defaults"
  def update_bot_engine_defaults(attrs) when is_map(attrs) do
    case Repo.one(BotEngineDefaults) do
      nil -> {:error, :not_found}
      defaults ->
        defaults
        |> BotEngineDefaults.changeset(attrs)
        |> Repo.update()
    end
  end

  # ============================================================================
  # 3c. STRATEGIES
  # ============================================================================

  alias TradeEngine.Strategies.Strategies, as: StrategiesCtx

  def list_strategies(filters \\ %{}), do: {:ok, StrategiesCtx.list(filters)}
  def get_strategy(id), do: StrategiesCtx.get(id)

  def create_strategy(attrs) when is_map(attrs), do: StrategiesCtx.create(attrs)
  def update_strategy(id, attrs) when is_map(attrs) do
    case StrategiesCtx.get(id) do
      {:ok, strategy} -> StrategiesCtx.update(strategy, attrs)
      error -> error
    end
  end

  # ============================================================================
  # 3c-ii. BACKTESTS
  # ============================================================================

  alias TradeEngine.Strategies.Backtests, as: BacktestsCtx
  alias TradeEngine.Strategies.BacktestManager

  def create_backtest(strategy_id, user_id, config) do
    BacktestManager.queue_backtest(strategy_id, user_id, config)
  end

  def get_backtest(id), do: BacktestsCtx.get(id)

  def list_backtests(filters \\ %{}), do: {:ok, BacktestsCtx.list(filters)}

  def list_strategy_backtests(strategy_id), do: {:ok, BacktestsCtx.list_by_strategy(strategy_id)}

  def cancel_backtest(id), do: BacktestsCtx.cancel(id)

  # ============================================================================
  # 3d. EXCHANGES, TRADING PAIRS, CREDENTIALS
  # ============================================================================

  alias TradeEngine.Exchanges.Exchanges, as: ExchangesCtx

  def list_exchanges, do: {:ok, ExchangesCtx.list_exchanges()}
  def get_exchange(id), do: ExchangesCtx.get_exchange(id)
  def list_trading_pairs(exchange_id), do: {:ok, ExchangesCtx.list_trading_pairs(exchange_id)}
  def list_user_credentials(user_id), do: {:ok, ExchangesCtx.list_user_credentials(user_id)}
  def list_adapters, do: {:ok, ExchangesCtx.list_adapters()}

  def list_service_account_credentials(sa_id), do: {:ok, ExchangesCtx.list_service_account_credentials(sa_id)}
  def get_credential(id), do: ExchangesCtx.get_credential(id)
  def create_credential(attrs), do: ExchangesCtx.create_credential(attrs)
  def update_credential(id, attrs), do: ExchangesCtx.update_credential(id, attrs)
  def delete_credential(id), do: ExchangesCtx.delete_credential(id)

  # ============================================================================
  # 4. POSITIONS (ENRICHED)
  # ============================================================================

  @doc "Get open positions from SignalTrader — enriched"
  def get_open_positions do
    positions = SignalTrader.get_open_positions()
    enriched = Enrichment.enrich_positions(positions, price_cache: get_price_cache())
    {:ok, enriched}
  rescue
    e -> {:error, %{reason: :positions_unavailable, detail: Exception.message(e)}}
  end

  @doc "Get user positions from DB — enriched"
  def get_user_positions(user_id, status \\ :all) do
    positions = case status do
      :open -> TradeEngine.Trading.list_open_positions(user_id)
      :closed -> TradeEngine.Trading.list_closed_positions(user_id)
      :all -> TradeEngine.Trading.list_user_positions(user_id)
    end
    enriched = positions
      |> Enum.map(&Map.from_struct/1)
      |> Enrichment.enrich_positions(price_cache: get_price_cache())
    {:ok, enriched}
  rescue
    e -> {:error, %{reason: :query_failed, detail: Exception.message(e)}}
  end

  @doc "Get positions for a specific bot"
  def get_bot_positions(bot_id) do
    import Ecto.Query
    positions = TradeEngine.Repo.all(
      from p in TradeEngine.Trading.Position,
        where: p.bot_id == ^bot_id,
        order_by: [desc: p.created_at]
    )
    enriched = positions
      |> Enum.map(&Map.from_struct/1)
      |> Enrichment.enrich_positions(price_cache: get_price_cache())
    {:ok, enriched}
  rescue
    e -> {:error, %{reason: :query_failed, detail: Exception.message(e)}}
  end

  # ============================================================================
  # 5. ORDERS (ENRICHED)
  # ============================================================================

  def get_user_orders(user_id, status \\ :all) do
    import Ecto.Query
    query = from o in TradeEngine.Trading.Order,
      where: o.user_id == ^user_id,
      order_by: [desc: o.created_at]
    query = case status do
      :open -> where(query, [o], o.status in ["pending", "open"])
      :filled -> where(query, [o], o.status == "filled")
      _ -> query
    end
    orders = TradeEngine.Repo.all(query)
    enriched = orders |> Enum.map(&Map.from_struct/1) |> Enrichment.enrich_orders()
    {:ok, enriched}
  rescue
    e -> {:error, %{reason: :query_failed, detail: Exception.message(e)}}
  end

  def get_recent_orders(limit \\ 50) do
    orders = TradeEngine.Trading.OrderManager.list_recent(limit)
    enriched = orders |> Enum.map(&Map.from_struct/1) |> Enrichment.enrich_orders()
    {:ok, enriched}
  rescue
    e -> {:error, %{reason: :query_failed, detail: Exception.message(e)}}
  end

  def get_bot_orders(bot_id) do
    import Ecto.Query
    orders = TradeEngine.Repo.all(
      from o in TradeEngine.Trading.Order,
        where: o.bot_id == ^bot_id,
        order_by: [desc: o.created_at]
    )
    enriched = orders |> Enum.map(&Map.from_struct/1) |> Enrichment.enrich_orders()
    {:ok, enriched}
  rescue
    e -> {:error, %{reason: :query_failed, detail: Exception.message(e)}}
  end

  @doc "Get trade history from transactions (when orders table is sparse)"
  def get_trade_history(user_id, opts \\ []) do
    {:ok, Enrichment.transactions_as_orders(user_id, opts)}
  end

  # ============================================================================
  # 6. PERFORMANCE & STATS
  # ============================================================================

  def get_trading_stats do
    {:ok, SignalTrader.get_stats()}
  rescue
    e -> {:error, %{reason: :stats_unavailable, detail: Exception.message(e)}}
  end

  def get_account_stats(user_id) do
    {:ok, TradeEngine.Trading.get_account_statistics(user_id)}
  rescue
    e -> {:error, %{reason: :stats_unavailable, detail: Exception.message(e)}}
  end

  def get_virtual_balance(user_id), do: VirtualBalanceManager.get_balance(user_id)

  def get_balance_summary do
    {:ok, VirtualBalanceManager.summary()}
  rescue
    _ -> {:error, :balance_manager_unavailable}
  end

  def get_risk_analytics(user_id) do
    positions = TradeEngine.Trading.list_closed_positions(user_id)
    trades = Enum.map(positions, fn pos ->
      %{
        pnl: sdf(pos.profit_loss), entry_price: sdf(pos.entry_price),
        exit_price: sdf(pos.exit_price),
        lowest_price: sdf(Map.get(pos, :lowest_price, pos.entry_price)),
        highest_price: sdf(Map.get(pos, :highest_price, pos.entry_price))
      }
    end)
    if length(trades) > 0 do
      account = TradeEngine.Trading.get_trading_account(user_id)
      cb = if account, do: sdf(account.account_balance), else: 0.0
      {bh, _} = Enum.reduce(trades, {[], cb}, fn t, {h, _} -> {[{DateTime.utc_now(), cb - t.pnl} | h], cb - t.pnl} end)
      {:ok, TradeEngine.Risk.Analytics.calculate_all_metrics(trades, Enum.reverse(bh), cb, cb - Enum.sum(Enum.map(trades, & &1.pnl)), 24.0)}
    else
      {:ok, %{message: "No closed trades yet", total_trades: 0}}
    end
  rescue
    e -> {:error, %{reason: :analytics_failed, detail: Exception.message(e)}}
  end

  def get_transactions(user_id) do
    {:ok, TradeEngine.Trading.list_user_transactions(user_id)}
  rescue
    e -> {:error, %{reason: :query_failed, detail: Exception.message(e)}}
  end

  # ============================================================================
  # 7. RISK MANAGEMENT
  # ============================================================================

  def get_tier_info(balance) when is_number(balance), do: {:ok, AssetTierManager.get_tier_info(balance)}
  def get_allowed_assets(balance) when is_number(balance), do: {:ok, AssetTierManager.get_allowed_assets(balance)}

  def get_position_size(balance, confidence \\ 50) do
    size = AssetTierManager.calculate_position_size(balance, confidence)
    {:ok, %{position_size_usd: Float.round(size, 2), balance: balance, confidence: confidence,
      tier: AssetTierManager.get_account_tier(balance), max_pct: AssetTierManager.get_position_size_limit(balance) * 100}}
  end

  # RiskLimit removed — table replaced by platform.risk_controls
  def get_risk_limits(_user_id), do: {:error, :not_found}
  def update_risk_limits(_user_id, _attrs), do: {:error, :not_implemented}

  # ============================================================================
  # 8. MARKET DATA
  # ============================================================================

  def get_signals do
    {:ok, CandleBridge.get_signals()}
  rescue
    _ -> {:ok, %{}}
  end

  def analyze_symbol(symbol) do
    {:ok, SignalTrader.analyze_symbol(symbol)}
  rescue
    e -> {:error, %{reason: :analysis_failed, detail: Exception.message(e)}}
  end

  def get_scalping_assets(balance), do: {:ok, AssetTierManager.get_scalping_priority(balance)}

  # ============================================================================
  # 9. SYSTEM HEALTH (ENHANCED)
  # ============================================================================

  def health_check do
    sys = safe_call(fn -> BotRegistry.get_system_metrics() end, %{})
    checks = %{
      signal_trader: pa?(SignalTrader), virtual_balance_manager: pa?(VirtualBalanceManager),
      capital_allocator: pa?(CapitalAllocator), bot_registry: pa?(BotRegistry),
      candle_bridge: pa?(CandleBridge), position_manager: pa?(PositionManager),
      prediction_tracker: pa?(TradeEngine.Physics.PredictionTracker),
      database: check_database(), repo: pa?(TradeEngine.Repo)
    }
    all_ok = Enum.all?(checks, fn {_, v} -> v == true end)
    {:ok, %{status: if(all_ok, do: :healthy, else: :degraded), checks: checks, system: sys, timestamp: DateTime.utc_now()}}
  end

  # ============================================================================
  # 10. COMBINED DASHBOARD PAYLOAD
  # ============================================================================

  def get_dashboard_payload(user_id) do
    pc = get_price_cache()
    {:ok, %{
      trading_stats: safe_call(fn -> SignalTrader.get_stats() end, %{}),
      open_positions: safe_call(fn -> SignalTrader.get_open_positions() |> Enrichment.enrich_positions(price_cache: pc) end, []),
      bots: safe_call(fn -> BotRegistry.list_user_bots(user_id) |> Enum.map(&Enrichment.enrich_bot/1) end, []),
      capital: safe_call(fn -> case CapitalAllocator.get_dashboard_status(user_id) do {:ok, s} -> s; _ -> nil end end, nil),
      virtual_balance: safe_call(fn -> case VirtualBalanceManager.get_balance(user_id) do {:ok, b} -> b; _ -> nil end end, nil),
      tier_info: safe_call(fn -> case VirtualBalanceManager.get_balance(user_id) do {:ok, %{total: b}} -> AssetTierManager.get_tier_info(b); _ -> nil end end, nil),
      signals: safe_call(fn -> CandleBridge.get_signals() end, %{}),
      health: safe_call(fn -> case health_check() do {:ok, h} -> h; _ -> %{status: :unknown} end end, %{status: :unknown}),
      system_metrics: safe_call(fn -> BotRegistry.get_system_metrics() end, %{}),
      timestamp: DateTime.utc_now()
    }}
  end

  # ============================================================================
  # HELPERS
  # ============================================================================

  defp get_price_cache do
    try do
      case SignalTrader.get_stats() do
        %{price_cache: c} when is_map(c) -> c
        _ -> %{}
      end
    rescue _ -> %{}
    catch :exit, _ -> %{}
    end
  end

  defp pa?(mod), do: (case Process.whereis(mod) do nil -> false; pid -> Process.alive?(pid) end)
  defp check_database do
    try do {:ok, _} = TradeEngine.Repo.query("SELECT 1", []); true
    rescue _ -> false end
  end
  defp safe_call(f, d) do
    try do f.()
    rescue _ -> d
    catch :exit, _ -> d end
  end
  defp sdf(nil), do: 0.0
  defp sdf(%Decimal{} = d), do: Decimal.to_float(d)
  defp sdf(n) when is_float(n), do: n
  defp sdf(n) when is_integer(n), do: n * 1.0
  defp sdf(_), do: 0.0
end

