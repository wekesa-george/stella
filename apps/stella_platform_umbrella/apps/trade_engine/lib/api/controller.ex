defmodule TradeEngine.API.Controller do
  @moduledoc """
  🌐 REST API CONTROLLER v2 — Full endpoint set for SysAdmin dashboard.

  ENDPOINTS:
  ══════════════════════════════════════════════════════════════════════════════

  BOTS (NEW)
    POST   /api/bots                      Create user-owned bot
    POST   /api/bots/system               Create system bot (service account)
    GET    /api/bots                      List all bots (enriched)
    GET    /api/bots/user/:user_id        List user bots
    GET    /api/bots/:bot_id              Get single bot
    PUT    /api/bots/:bot_id              Update bot config
    DELETE /api/bots/:bot_id              Delete bot (must be stopped)
    GET    /api/service-accounts          List service accounts
    GET    /api/service-accounts/:id      Get service account
    POST   /api/service-accounts          Create service account
    PUT    /api/service-accounts/:id      Update service account
    DELETE /api/service-accounts/:id      Delete service account
    POST   /api/bots/:bot_id/start       Start bot
    POST   /api/bots/:bot_id/pause       Pause bot
    POST   /api/bots/:bot_id/stop        Stop bot
    GET    /api/bots/:bot_id/positions    Get bot positions
    GET    /api/bots/:bot_id/orders       Get bot orders
    GET    /api/orders/recent             Recent orders (all bots, dashboard feed)

  CREDENTIALS
    GET    /api/service-accounts/:sa_id/credentials  Service account credentials
    GET    /api/credentials/:id               Get single credential
    POST   /api/credentials                   Create credential
    PUT    /api/credentials/:id               Update credential
    DELETE /api/credentials/:id               Delete credential
    GET    /api/adapters                      List exchange adapters

  TRADING CONTROLS
    POST   /api/trading/start             Start trading
    POST   /api/trading/stop              Stop trading
    POST   /api/trading/restart           Restart
    POST   /api/trading/close-all         Emergency close all
    POST   /api/trading/pause/:user_id    Pause user
    POST   /api/trading/resume/:user_id   Resume user

  CAPITAL MANAGEMENT
    POST   /api/capital/configure         Configure allocation
    PUT    /api/capital/:user_id/active   Set active capital
    PUT    /api/capital/:user_id/total    Set total capital
    PUT    /api/capital/:user_id/mode     Set scaling mode
    GET    /api/capital/:user_id          Get status
    GET    /api/capital                   Get all

  POSITIONS (ENRICHED)
    GET    /api/positions/open            Live open positions
    GET    /api/positions/:user_id        User positions (all)
    GET    /api/positions/:user_id/open   User open positions
    GET    /api/positions/:user_id/closed User closed positions

  ORDERS (ENRICHED)
    GET    /api/orders/:user_id           User orders
    GET    /api/trade-history/:user_id    Trade history from transactions

  PERFORMANCE
    GET    /api/stats                     Trading stats
    GET    /api/stats/:user_id            User account stats
    GET    /api/analytics/:user_id        Risk analytics
    GET    /api/balance/summary           All balances
    GET    /api/balance/:user_id          Virtual balance
    GET    /api/transactions/:user_id     Transactions

  RISK
    GET    /api/risk/tier/:balance        Tier info
    GET    /api/risk/assets/:balance      Allowed assets
    GET    /api/risk/position-size        Recommended size
    GET/PUT /api/risk/limits/:user_id     Risk limits

  MARKET
    GET    /api/market/signals            Current signals
    GET    /api/market/analyze/:symbol    Analyze symbol
    GET    /api/market/scalping-assets    Scalping priority

  SYSTEM
    GET    /api/health                    Health check
    GET    /api/system/metrics            CPU/RAM/BEAM stats
    GET    /api/processes                 Supervision tree
    GET    /api/dashboard/:user_id        Full dashboard payload
  """

  use Plug.Router
  alias TradeEngine.API

  plug :match
  plug Plug.Parsers,
    parsers: [:json],
    pass: ["application/json"],
    json_decoder: Jason
  plug :dispatch

  # ============================================================================
  # BOTS
  # ============================================================================

  post "/api/bots" do
    %{"user_id" => user_id} = conn.body_params
    attrs = conn.body_params |> Map.drop(["user_id"]) |> atomize_keys()
    json_response(conn, API.create_bot(user_id, attrs))
  end

  post "/api/bots/deploy" do
    %{"user_id" => user_id} = conn.body_params
    attrs = conn.body_params |> Map.drop(["user_id"]) |> atomize_keys()
    json_response(conn, API.deploy_bot(user_id, attrs))
  end

  post "/api/bots/system/deploy" do
    %{"service_account_id" => sa_id} = conn.body_params
    attrs = conn.body_params |> Map.drop(["service_account_id"]) |> atomize_keys()
    json_response(conn, API.deploy_system_bot(sa_id, attrs))
  end

  post "/api/bots/system" do
    %{"service_account_id" => sa_id} = conn.body_params
    attrs = conn.body_params |> Map.drop(["service_account_id"]) |> atomize_keys()
    json_response(conn, API.create_system_bot(sa_id, attrs))
  end

  get "/api/bots" do
    filters = %{}
    |> maybe_put("status", conn.query_params["status"])
    |> maybe_put("exchange", conn.query_params["exchange"])
    |> maybe_put("strategy_type", conn.query_params["strategy_type"])
    |> maybe_put("user_id", conn.query_params["user_id"])
    |> maybe_put("search", conn.query_params["search"])
    |> maybe_put("owner_type", conn.query_params["owner_type"])
    |> maybe_put("pnl_preset", conn.query_params["pnl_preset"])
    |> maybe_put("sort_by", conn.query_params["sort_by"])
    |> maybe_put("sort_dir", conn.query_params["sort_dir"])
    |> maybe_put_int("page", conn.query_params["page"])
    |> maybe_put_int("per_page", conn.query_params["per_page"])
    |> maybe_put_float("equity_min", conn.query_params["equity_min"])
    |> maybe_put_float("equity_max", conn.query_params["equity_max"])
    |> maybe_put_float("pnl_min", conn.query_params["pnl_min"])
    |> maybe_put_float("pnl_max", conn.query_params["pnl_max"])
    |> maybe_put_int("uptime_min", conn.query_params["uptime_min"])

    json_response(conn, API.list_bots(filters))
  end

  get "/api/bots/user/:user_id" do
    json_response(conn, API.list_user_bots(user_id))
  end

  get "/api/bots/:bot_id/logs" do
    limit = (conn.query_params["limit"] || "100") |> parse_number() |> trunc()
    opts = [limit: limit]
    opts = if lvl = conn.query_params["level"], do: Keyword.put(opts, :level, lvl), else: opts
    opts = if cat = conn.query_params["category"], do: Keyword.put(opts, :category, cat), else: opts
    json_response(conn, API.get_bot_logs(bot_id, opts))
  end

  get "/api/bots/:bot_id/transitions" do
    limit = (conn.query_params["limit"] || "50") |> parse_number() |> trunc()
    json_response(conn, API.get_bot_transitions(bot_id, limit: limit))
  end

  get "/api/bots/:bot_id/bars" do
    timeframe = conn.query_params["timeframe"] || "5Min"
    limit = (conn.query_params["limit"] || "120") |> parse_number() |> trunc()
    json_response(conn, API.get_bot_bars(bot_id, timeframe, limit))
  end

  get "/api/bots/:bot_id/positions" do
    json_response(conn, API.get_bot_positions(bot_id))
  end

  get "/api/orders/recent" do
    limit = (conn.query_params["limit"] || "50") |> parse_number() |> trunc() |> min(200)
    json_response(conn, API.get_recent_orders(limit))
  end

  get "/api/bots/:bot_id/orders" do
    json_response(conn, API.get_bot_orders(bot_id))
  end

  get "/api/platform/equity-curve" do
    limit = (conn.query_params["limit"] || "200") |> parse_number() |> trunc() |> min(500)
    opts = [limit: limit]
    opts = case conn.query_params["since"] do
      nil -> opts
      since_str ->
        case DateTime.from_iso8601(since_str) do
          {:ok, dt, _} -> Keyword.put(opts, :since, dt)
          _ -> opts
        end
    end
    json_response(conn, API.get_platform_equity_curve(opts))
  end

  get "/api/bots/:bot_id/equity-curve" do
    limit = (conn.query_params["limit"] || "500") |> parse_number() |> trunc()
    opts = [limit: limit]
    opts = case conn.query_params["since"] do
      nil -> opts
      since_str ->
        case DateTime.from_iso8601(since_str) do
          {:ok, dt, _} -> Keyword.put(opts, :since, dt)
          _ -> opts
        end
    end
    json_response(conn, API.get_bot_equity_curve(bot_id, opts))
  end

  post "/api/bots/:bot_id/start" do
    json_response(conn, API.start_bot(bot_id))
  end

  post "/api/bots/:bot_id/pause" do
    json_response(conn, API.pause_bot(bot_id))
  end

  post "/api/bots/:bot_id/stop" do
    json_response(conn, API.stop_bot(bot_id))
  end

  post "/api/bots/:bot_id/manual-order" do
    params = %{
      side: conn.body_params["side"],
      size: conn.body_params["size"]
    }
    json_response(conn, API.place_manual_order(bot_id, params))
  end

  put "/api/bots/:bot_id" do
    attrs = atomize_keys(conn.body_params)
    json_response(conn, API.update_bot(bot_id, attrs))
  end

  delete "/api/bots/:bot_id" do
    json_response(conn, API.delete_bot(bot_id))
  end

  get "/api/bots/:bot_id" do
    json_response(conn, API.get_bot(bot_id))
  end

  # ============================================================================
  # SERVICE ACCOUNTS
  # ============================================================================

  get "/api/service-accounts" do
    json_response(conn, API.list_service_accounts())
  end

  get "/api/service-accounts/:id" do
    json_response(conn, API.get_service_account(id))
  end

  post "/api/service-accounts" do
    attrs = atomize_keys(conn.body_params)
    json_response(conn, API.create_service_account(attrs))
  end

  put "/api/service-accounts/:id" do
    attrs = atomize_keys(conn.body_params)
    json_response(conn, API.update_service_account(id, attrs))
  end

  delete "/api/service-accounts/:id" do
    json_response(conn, API.delete_service_account(id))
  end

  # ============================================================================
  # BOT ENGINE DEFAULTS
  # ============================================================================

  get "/api/bot-engine-defaults" do
    json_response(conn, API.get_bot_engine_defaults())
  end

  put "/api/bot-engine-defaults" do
    attrs = atomize_keys(conn.body_params)
    json_response(conn, API.update_bot_engine_defaults(attrs))
  end

  # ============================================================================
  # STRATEGIES
  # ============================================================================

  get "/api/strategies" do
    filters = conn.query_params |> atomize_keys()
    json_response(conn, API.list_strategies(filters))
  end

  get "/api/strategies/:id" do
    json_response(conn, API.get_strategy(id))
  end

  post "/api/strategies" do
    attrs = atomize_keys(conn.body_params)
    json_response(conn, API.create_strategy(attrs))
  end

  put "/api/strategies/:id" do
    attrs = atomize_keys(conn.body_params)
    json_response(conn, API.update_strategy(id, attrs))
  end

  # ============================================================================
  # BACKTESTS
  # ============================================================================

  post "/api/backtests" do
    %{"strategy_id" => strategy_id, "user_id" => user_id} = conn.body_params
    config = conn.body_params |> Map.drop(["strategy_id", "user_id"]) |> atomize_keys()
    json_response(conn, API.create_backtest(strategy_id, user_id, config))
  end

  get "/api/backtests" do
    filters = conn.query_params |> atomize_keys()
    json_response(conn, API.list_backtests(filters))
  end

  get "/api/backtests/:id" do
    json_response(conn, API.get_backtest(id))
  end

  post "/api/backtests/:id/cancel" do
    json_response(conn, API.cancel_backtest(id))
  end

  get "/api/strategies/:id/backtests" do
    json_response(conn, API.list_strategy_backtests(id))
  end

  # ============================================================================
  # EXCHANGES, TRADING PAIRS, CREDENTIALS
  # ============================================================================

  get "/api/exchanges" do
    json_response(conn, API.list_exchanges())
  end

  get "/api/exchanges/:id" do
    json_response(conn, API.get_exchange(id))
  end

  get "/api/exchanges/:exchange_id/trading-pairs" do
    json_response(conn, API.list_trading_pairs(exchange_id))
  end

  get "/api/users/:user_id/credentials" do
    json_response(conn, API.list_user_credentials(user_id))
  end

  # Service account credentials
  get "/api/service-accounts/:sa_id/credentials" do
    json_response(conn, API.list_service_account_credentials(sa_id))
  end

  get "/api/credentials/:id" do
    json_response(conn, API.get_credential(id))
  end

  post "/api/credentials" do
    attrs = atomize_keys(conn.body_params)
    json_response(conn, API.create_credential(attrs))
  end

  put "/api/credentials/:id" do
    attrs = atomize_keys(conn.body_params)
    json_response(conn, API.update_credential(id, attrs))
  end

  delete "/api/credentials/:id" do
    json_response(conn, API.delete_credential(id))
  end

  # Exchange adapters listing
  get "/api/adapters" do
    json_response(conn, API.list_adapters())
  end

  # ============================================================================
  # TRADING CONTROLS
  # ============================================================================

  post "/api/trading/launch" do
    user_id = conn.body_params["user_id"]
    opts = conn.body_params |> Map.drop(["user_id"]) |> atomize_keys()
    json_response(conn, API.launch_trading(user_id, opts))
  end

  post "/api/trading/quick-start/:user_id" do
    json_response(conn, API.quick_start(user_id))
  end

  post "/api/trading/shutdown" do
    json_response(conn, API.shutdown_trading())
  end

  post "/api/trading/emergency-stop" do
    json_response(conn, API.emergency_stop())
  end

  get "/api/trading/status" do
    json_response(conn, API.get_trading_status())
  end

  post "/api/trading/start" do
    json_response(conn, API.start_trading())
  end

  post "/api/trading/stop" do
    json_response(conn, API.stop_trading())
  end

  post "/api/trading/restart" do
    json_response(conn, API.restart_trading())
  end

  post "/api/trading/close-all" do
    json_response(conn, API.close_all_positions())
  end

  post "/api/trading/pause/:user_id" do
    json_response(conn, API.pause_user_trading(user_id))
  end

  post "/api/trading/resume/:user_id" do
    json_response(conn, API.resume_user_trading(user_id))
  end

  # ============================================================================
  # CAPITAL MANAGEMENT
  # ============================================================================

  post "/api/capital/configure" do
    %{"user_id" => user_id} = conn.body_params
    config = conn.body_params |> Map.drop(["user_id"]) |> atomize_keys() |> parse_capital_config()
    json_response(conn, API.configure_capital(user_id, config))
  end

  put "/api/capital/:user_id/active" do
    %{"amount" => amount} = conn.body_params
    json_response(conn, API.set_active_capital(user_id, parse_number(amount)))
  end

  put "/api/capital/:user_id/total" do
    %{"amount" => amount} = conn.body_params
    json_response(conn, API.set_total_capital(user_id, parse_number(amount)))
  end

  put "/api/capital/:user_id/mode" do
    %{"mode" => mode} = conn.body_params
    json_response(conn, API.set_scaling_mode(user_id, String.to_existing_atom(mode)))
  end

  get "/api/capital/:user_id" do
    json_response(conn, API.get_capital_status(user_id))
  end

  get "/api/capital" do
    json_response(conn, API.get_all_allocations())
  end

  # ============================================================================
  # POSITIONS (ENRICHED)
  # ============================================================================

  get "/api/positions/open" do
    json_response(conn, API.get_open_positions())
  end

  get "/api/positions/:user_id/open" do
    json_response(conn, API.get_user_positions(user_id, :open))
  end

  get "/api/positions/:user_id/closed" do
    json_response(conn, API.get_user_positions(user_id, :closed))
  end

  get "/api/positions/:user_id" do
    json_response(conn, API.get_user_positions(user_id))
  end

  # ============================================================================
  # ORDERS (ENRICHED) & TRADE HISTORY
  # ============================================================================

  get "/api/orders/:user_id" do
    json_response(conn, API.get_user_orders(user_id))
  end

  get "/api/trade-history/:user_id" do
    limit = (conn.query_params["limit"] || "100") |> parse_number() |> trunc()
    json_response(conn, API.get_trade_history(user_id, limit: limit))
  end

  # ============================================================================
  # PERFORMANCE & STATS
  # ============================================================================

  get "/api/stats" do
    json_response(conn, API.get_trading_stats())
  end

  get "/api/stats/:user_id" do
    json_response(conn, API.get_account_stats(user_id))
  end

  get "/api/analytics/:user_id" do
    json_response(conn, API.get_risk_analytics(user_id))
  end

  get "/api/balance/summary" do
    json_response(conn, API.get_balance_summary())
  end

  get "/api/balance/:user_id" do
    json_response(conn, API.get_virtual_balance(user_id))
  end

  get "/api/transactions/:user_id" do
    json_response(conn, API.get_transactions(user_id))
  end

  # ============================================================================
  # RISK MANAGEMENT
  # ============================================================================

  get "/api/risk/tier/:balance" do
    json_response(conn, API.get_tier_info(parse_number(balance)))
  end

  get "/api/risk/assets/:balance" do
    json_response(conn, API.get_allowed_assets(parse_number(balance)))
  end

  get "/api/risk/position-size" do
    balance = conn.query_params["balance"] |> parse_number()
    confidence = conn.query_params["confidence"] |> parse_number(50)
    json_response(conn, API.get_position_size(balance, confidence))
  end

  get "/api/risk/limits/:user_id" do
    json_response(conn, API.get_risk_limits(user_id))
  end

  put "/api/risk/limits/:user_id" do
    attrs = atomize_keys(conn.body_params)
    json_response(conn, API.update_risk_limits(user_id, attrs))
  end

  # ============================================================================
  # LIVE SIGNALS & ACTIVE TRADES
  # ============================================================================

  get "/api/signals/live" do
    json_response(conn, API.get_live_signals())
  end

  get "/api/signals/:symbol" do
    json_response(conn, API.get_signal_detail(symbol))
  end

  post "/api/signals/:symbol/analyze" do
    json_response(conn, API.analyze_fresh(symbol))
  end

  get "/api/trades/active" do
    json_response(conn, API.get_active_trades())
  end

  post "/api/positions/:id/close" do
    reason = (conn.body_params["reason"] || "manual") |> String.to_atom()
    json_response(conn, API.close_position(id, reason))
  end

  post "/api/trades/close-all" do
    json_response(conn, API.close_all_and_capture())
  end

  # ============================================================================
  # MARKET DATA
  # ============================================================================

  get "/api/market/signals" do
    json_response(conn, API.get_signals())
  end

  get "/api/market/analyze/:symbol" do
    json_response(conn, API.analyze_symbol(symbol))
  end

  get "/api/market/scalping-assets" do
    balance = conn.query_params["balance"] |> parse_number(5000)
    json_response(conn, API.get_scalping_assets(balance))
  end

  # ============================================================================
  # SYSTEM
  # ============================================================================

  get "/api/health" do
    json_response(conn, API.health_check())
  end

  get "/api/system/metrics" do
    json_response(conn, API.get_system_metrics())
  end

  get "/api/processes" do
    json_response(conn, API.get_process_info())
  end

  get "/api/dashboard/:user_id" do
    json_response(conn, API.get_dashboard_payload(user_id))
  end

  # ============================================================================
  # SERVICE HEALTH (Centralized)
  # ============================================================================

  get "/api/phoenix/services/health" do
    case TradeEngine.Infra.ServiceHealthMonitor.get_all_health() do
      {:error, _} -> json_response(conn, {:ok, %{services: [], message: "Health monitor not yet available"}})
      services -> json_response(conn, {:ok, %{services: services}})
    end
  end

  get "/api/phoenix/services/health/category/:category" do
    case TradeEngine.Infra.ServiceHealthMonitor.get_health_by_category(category) do
      {:error, _} -> json_response(conn, {:ok, %{services: [], message: "Health monitor not yet available"}})
      services -> json_response(conn, {:ok, %{services: services}})
    end
  end

  get "/api/phoenix/services/health/:name" do
    case TradeEngine.Infra.ServiceHealthMonitor.get_health(name) do
      {:ok, data} -> json_response(conn, {:ok, data})
      {:error, :not_found} -> json_response(conn, {:error, "Service not found: #{name}"})
      {:error, _} -> json_response(conn, {:error, "Health monitor not yet available"})
    end
  end

  # ============================================================================
  # SYSTEM ALERTS
  # ============================================================================

  get "/api/phoenix/alerts" do
    alerts =
      TradeEngine.Alerts.SystemAlert.recent_all(100)
      |> Enum.map(&sanitize/1)

    json_response(conn, {:ok, %{alerts: alerts}})
  end

  get "/api/phoenix/alerts/unacknowledged" do
    alerts =
      TradeEngine.Alerts.SystemAlert.recent(100)
      |> Enum.map(&sanitize/1)

    json_response(conn, {:ok, %{alerts: alerts}})
  end

  post "/api/phoenix/alerts/:id/acknowledge" do
    acknowledged_by = Map.get(conn.body_params, "acknowledged_by", "api_client")

    case TradeEngine.Alerts.SystemAlert.acknowledge(id, acknowledged_by) do
      {:ok, alert} ->
        # Broadcast so AlertPersister and other listeners know
        Phoenix.PubSub.broadcast(
          TradeEngine.PubSub,
          "alerts:acknowledged",
          {:alert_acknowledged, id}
        )

        json_response(conn, {:ok, sanitize(alert)})

      {:error, :not_found} ->
        json_response(conn, {:error, "Alert not found: #{id}"})

      {:error, reason} ->
        json_response(conn, {:error, "Failed to acknowledge: #{inspect(reason)}"})
    end
  end

  # ============================================================================
  # INCIDENTS
  # ============================================================================

  get "/api/incidents" do
    limit = min(String.to_integer(Map.get(conn.params, "limit", "50")), 200)
    incidents =
      TradeEngine.Operations.Incident.list_recent(limit)
      |> Enum.map(&sanitize/1)

    json_response(conn, {:ok, %{incidents: incidents}})
  end

  get "/api/incidents/open" do
    limit = min(String.to_integer(Map.get(conn.params, "limit", "50")), 200)
    incidents =
      TradeEngine.Operations.Incident.list_open(limit)
      |> Enum.map(&sanitize/1)

    json_response(conn, {:ok, %{incidents: incidents}})
  end

  patch "/api/incidents/:id" do
    case TradeEngine.Operations.Incident.update(id, conn.body_params) do
      {:ok, incident} ->
        json_response(conn, {:ok, sanitize(incident)})
      {:error, changeset} ->
        json_response(conn, {:error, inspect(changeset.errors)})
    end
  end

  post "/api/incidents/:id/resolve" do
    attrs = %{
      "status" => "resolved",
      "action_taken" => conn.body_params["action_taken"] || conn.body_params["notes"],
      "notes" => conn.body_params["notes"],
      "time_to_resolve_mins" => conn.body_params["time_to_resolve_mins"]
    } |> Enum.reject(fn {_, v} -> is_nil(v) end) |> Map.new()

    case TradeEngine.Operations.Incident.update(id, attrs) do
      {:ok, incident} ->
        json_response(conn, {:ok, sanitize(incident)})
      {:error, changeset} ->
        json_response(conn, {:error, inspect(changeset.errors)})
    end
  end

  # ============================================================================
  # CATCH-ALL
  # ============================================================================

  match _ do
    conn
    |> put_resp_content_type("application/json")
    |> send_resp(404, Jason.encode!(%{error: "not_found", path: conn.request_path}))
  end

  # ============================================================================
  # HELPERS
  # ============================================================================

  defp json_response(conn, {:ok, data}) do
    conn
    |> put_resp_content_type("application/json")
    |> send_resp(200, Jason.encode!(%{ok: true, data: sanitize(data)}))
  end

  defp json_response(conn, {:error, reason}) do
    conn
    |> put_resp_content_type("application/json")
    |> send_resp(400, Jason.encode!(%{ok: false, error: sanitize(reason)}))
  end

  defp json_response(conn, other) do
    conn
    |> put_resp_content_type("application/json")
    |> send_resp(200, Jason.encode!(%{ok: true, data: sanitize(other)}))
  end

  defp atomize_keys(map) when is_map(map) do
    Map.new(map, fn
      {k, v} when is_binary(k) ->
        atom = try do String.to_existing_atom(k) rescue _ -> String.to_atom(k) end
        {atom, atomize_keys(v)}
      {k, v} -> {k, atomize_keys(v)}
    end)
  end
  defp atomize_keys(other), do: other


  defp parse_number(nil, default), do: default
  defp parse_number(val, _default), do: parse_number(val)
  defp parse_number(val) when is_number(val), do: val
  defp parse_number(val) when is_binary(val) do
    case Float.parse(val) do
      {n, _} -> n
      :error -> case Integer.parse(val) do {n, _} -> n * 1.0; :error -> 0.0 end
    end
  end
  defp parse_number(_), do: 0.0

  defp parse_capital_config(config) do
    config
    |> maybe_parse(:total_capital, &parse_number/1)
    |> maybe_parse(:active_capital, &parse_number/1)
    |> maybe_parse(:max_step_size, &parse_number/1)
    |> maybe_parse(:drawdown_pause_pct, &parse_number/1)
    |> maybe_parse(:compound_reinvest_pct, &parse_number/1)
    |> maybe_parse(:gradual_increase_pct, &parse_number/1)
    |> maybe_parse(:scaling_mode, fn
      m when is_binary(m) -> String.to_existing_atom(m)
      m when is_atom(m) -> m
    end)
    |> maybe_parse(:milestone_targets, fn
      t when is_list(t) -> Enum.map(t, &parse_number/1)
      _ -> [10, 20, 30, 50]
    end)
  end

  # ============================================================================
  # PHOENIX REAL-TIME DATA (read from ETS caches)
  # ============================================================================

  get "/api/phoenix/platform/stats" do
    case TradeEngine.Dashboard.PlatformStatsAggregator.get_stats() do
      {:ok, stats} -> json_response(conn, {:ok, stats})
      {:error, _} -> json_response(conn, {:ok, %{message: "Stats not yet available"}})
    end
  end

  get "/api/phoenix/infra/metrics" do
    case TradeEngine.Infra.Monitor.get_metrics() do
      {:ok, metrics} -> json_response(conn, {:ok, metrics})
      {:error, _} -> json_response(conn, {:ok, %{message: "Metrics not yet available"}})
    end
  end

  get "/api/phoenix/infra/exchanges" do
    case TradeEngine.Exchanges.HealthMonitor.get_health(:all) do
      {:error, _} -> json_response(conn, {:ok, %{exchanges: [], message: "Health data not yet available"}})
      exchanges -> json_response(conn, {:ok, %{exchanges: exchanges}})
    end
  end

  # ── RISK MONITORING ──────────────────────────────────────────────────────────

  get "/api/phoenix/risk/status" do
    json_response(conn, {:ok, %{
      circuit_breaker: TradeEngine.Risk.PlatformCircuitBreaker.status(),
      reconciler: TradeEngine.Risk.PositionReconciler.stats(),
      slippage: TradeEngine.Risk.SlippageMonitor.stats(),
      correlation: TradeEngine.Risk.CorrelationMonitor.stats(),
      credential_health: TradeEngine.Exchanges.Executor.credential_health_stats()
    }})
  end

  get "/api/phoenix/risk/circuit-breaker" do
    json_response(conn, {:ok, TradeEngine.Risk.PlatformCircuitBreaker.status()})
  end

  post "/api/phoenix/risk/circuit-breaker/reset" do
    TradeEngine.Risk.PlatformCircuitBreaker.reset()
    json_response(conn, {:ok, %{status: "reset", message: "Circuit breaker reset — bots may be restarted"}})
  end

  get "/api/phoenix/risk/reconciler" do
    json_response(conn, {:ok, TradeEngine.Risk.PositionReconciler.stats()})
  end

  post "/api/phoenix/risk/reconciler/check" do
    TradeEngine.Risk.PositionReconciler.check_now()
    json_response(conn, {:ok, %{status: "triggered", message: "Reconciliation check queued"}})
  end

  get "/api/phoenix/risk/slippage" do
    json_response(conn, {:ok, TradeEngine.Risk.SlippageMonitor.stats()})
  end

  get "/api/phoenix/risk/correlation" do
    json_response(conn, {:ok, TradeEngine.Risk.CorrelationMonitor.stats()})
  end

  get "/api/phoenix/risk/credentials" do
    json_response(conn, {:ok, TradeEngine.Exchanges.Executor.credential_health_stats()})
  end

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, _key, ""), do: map
  defp maybe_put(map, key, val), do: Map.put(map, key, val)

  defp maybe_put_int(map, _key, nil), do: map
  defp maybe_put_int(map, _key, ""), do: map
  defp maybe_put_int(map, key, val) do
    case Integer.parse(val) do
      {n, _} -> Map.put(map, key, n)
      :error -> map
    end
  end

  defp maybe_put_float(map, _key, nil), do: map
  defp maybe_put_float(map, _key, ""), do: map
  defp maybe_put_float(map, key, val) do
    case Float.parse(val) do
      {n, _} -> Map.put(map, key, n)
      :error -> map
    end
  end

  defp maybe_parse(config, key, parser) do
    case Map.get(config, key) do
      nil -> config
      val -> Map.put(config, key, parser.(val))
    end
  end

  defp sanitize(%Ecto.Changeset{} = cs) do
    Ecto.Changeset.traverse_errors(cs, fn {msg, opts} ->
      Enum.reduce(opts, msg, fn {key, value}, acc ->
        String.replace(acc, "%{#{key}}", to_string(value))
      end)
    end)
  end
  defp sanitize(%Decimal{} = d), do: Decimal.to_float(d)
  defp sanitize(%DateTime{} = dt), do: DateTime.to_iso8601(dt)
  defp sanitize(%NaiveDateTime{} = ndt), do: NaiveDateTime.to_iso8601(ndt)
  defp sanitize(%Date{} = d), do: Date.to_iso8601(d)
  defp sanitize(pid) when is_pid(pid), do: inspect(pid)
  defp sanitize(ref) when is_reference(ref), do: inspect(ref)
  defp sanitize(nil), do: nil
  defp sanitize(true), do: true
  defp sanitize(false), do: false
  defp sanitize(atom) when is_atom(atom), do: Atom.to_string(atom)
  defp sanitize(map) when is_map(map) do
    map = if Map.has_key?(map, :__struct__) and Map.has_key?(map, :__meta__) do
      Map.from_struct(map) |> Map.drop([:__meta__])
    else
      if Map.has_key?(map, :__struct__), do: Map.from_struct(map), else: map
    end
    Map.new(map, fn {k, v} -> {if(is_atom(k), do: Atom.to_string(k), else: k), sanitize(v)} end)
  end
  defp sanitize(list) when is_list(list), do: Enum.map(list, &sanitize/1)
  defp sanitize(tuple) when is_tuple(tuple), do: Tuple.to_list(tuple) |> sanitize()
  defp sanitize(bin) when is_binary(bin) do
    if String.valid?(bin) do
      bin
    else
      # Raw binary (e.g. 16-byte UUID) — format as UUID string if 16 bytes, else hex
      case bin do
        <<a::binary-4, b::binary-2, c::binary-2, d::binary-2, e::binary-6>> ->
          Enum.map_join([a, b, c, d, e], "-", &Base.encode16(&1, case: :lower))
        _ ->
          Base.encode16(bin, case: :lower)
      end
    end
  end
  defp sanitize(other), do: other
end
