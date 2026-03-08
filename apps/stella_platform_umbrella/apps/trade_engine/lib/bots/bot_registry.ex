defmodule TradeEngine.Bots.BotRegistry do
  @moduledoc """
  🤖 BOT REGISTRY - Runtime tracking for all bot instances

  Tracks in ETS (fast reads):
  - Bot status (running/paused/error)
  - Uptime duration
  - Last heartbeat
  - CPU/RAM utilization
  - Live PnL and trade counts
  - Open position count

  Periodically syncs stats back to database for persistence.
  """

  use GenServer
  require Logger
  import Ecto.Query

  alias TradeEngine.Repo
  alias TradeEngine.Bots.Bot
  alias TradeEngine.Bots.BotSupervisor
  alias TradeEngine.Bots.BotFSM
  alias TradeEngine.Trading.EquitySnapshot

  @ets_table :bot_registry
  @pubsub TradeEngine.PubSub
  @heartbeat_interval_ms 10_000       # Heartbeat every 10s
  @stats_sync_interval_ms 60_000      # Sync stats to DB every 60s
  @health_check_interval_ms 30_000    # Check bot health every 30s
  @heartbeat_timeout_s 60             # Bot is "dead" if no heartbeat for 60s

  # ============================================================================
  # CLIENT API
  # ============================================================================

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc "Register a new bot (creates DB record + ETS entry)"
  def register_bot(user_id, attrs) do
    GenServer.call(__MODULE__, {:register, user_id, attrs})
  end

  @doc "Register a system bot owned by a service account (no user required)"
  def register_system_bot(service_account_id, attrs) do
    GenServer.call(__MODULE__, {:register_system, service_account_id, attrs})
  end

  @doc "Get bot by ID"
  def get_bot(bot_id) do
    case :ets.lookup(@ets_table, bot_id) do
      [{^bot_id, runtime}] -> {:ok, runtime}
      [] -> {:error, :not_found}
    end
  rescue
    ArgumentError -> {:error, :not_started}
  end

  @doc "Remove a bot from the ETS registry (called on delete)"
  def deregister_bot(bot_id) do
    :ets.delete(@ets_table, bot_id)
    :ok
  rescue
    _ -> :ok
  end

  @doc "Refresh a bot's ETS entry from DB (called after update)"
  def refresh_bot(bot_id) do
    case Repo.get(Bot, bot_id) do
      nil -> {:error, :not_found}
      bot ->
        runtime = db_bot_to_runtime(bot)
        # Preserve live-only fields from existing ETS entry
        runtime = case :ets.lookup(@ets_table, bot_id) do
          [{^bot_id, existing}] ->
            %{runtime |
              open_positions: existing.open_positions,
              elixir_pid: existing.elixir_pid
            }
          _ -> runtime
        end
        :ets.insert(@ets_table, {bot_id, runtime})
        {:ok, runtime}
    end
  rescue
    _ -> {:error, :refresh_failed}
  end

  @doc "List all bots"
  def list_bots do
    try do
      :ets.tab2list(@ets_table)
      |> Enum.map(fn {_id, runtime} -> runtime end)
    rescue
      _ -> []
    end
  end

  @doc "List bots for a specific user"
  def list_user_bots(user_id) do
    list_bots() |> Enum.filter(& &1.user_id == user_id)
  end

  @doc "Start a bot"
  def start_bot(bot_id) do
    GenServer.call(__MODULE__, {:start_bot, bot_id})
  end

  @doc "Pause a bot"
  def pause_bot(bot_id) do
    GenServer.call(__MODULE__, {:set_status, bot_id, "paused"})
  end

  @doc "Stop a bot"
  def stop_bot(bot_id) do
    GenServer.call(__MODULE__, {:stop_bot, bot_id})
  end

  @doc "Record a heartbeat (called by the trading process)"
  def heartbeat(bot_id) do
    GenServer.cast(__MODULE__, {:heartbeat, bot_id})
  end

  @doc "Report error on a bot"
  def report_error(bot_id, error_message) do
    GenServer.cast(__MODULE__, {:error, bot_id, error_message})
  end

  @doc "Update bot trading stats (called after each trade)"
  def report_trade(bot_id, pnl, won?) do
    GenServer.cast(__MODULE__, {:trade_result, bot_id, pnl, won?})
  end

  @doc "Update open position count for a bot"
  def update_position_count(bot_id, count) do
    GenServer.cast(__MODULE__, {:update_positions, bot_id, count})
  end

  @doc "Report an initialization sub-step for a bot"
  def report_init_step(bot_id, step) do
    GenServer.cast(__MODULE__, {:init_step, bot_id, step})
  end

  @doc """
  Get system resource utilization for a bot.
  Returns CPU and RAM for the BEAM process.
  """
  def get_system_metrics do
    # BEAM-level metrics (shared by all bots on same node)
    memory = :erlang.memory()
    schedulers = :erlang.system_info(:schedulers_online)
    process_count = :erlang.system_info(:process_count)

    # CPU: scheduler utilization
    cpu_pct = try do
      util = :scheduler.utilization(1)
      case util do
        [{:total, pct, _} | _] -> Float.round(pct * 100, 1)
        _ -> 0.0
      end
    rescue
      _ ->
        # Fallback: estimate from reductions
        {reductions, _} = :erlang.statistics(:reductions)
        min(Float.round(reductions / 1_000_000, 1), 100.0)
    catch
      _ -> 0.0
    end

    # RAM in MB
    total_mb = Float.round(memory[:total] / 1_048_576, 1)
    process_mb = Float.round(memory[:processes] / 1_048_576, 1)
    ets_mb = Float.round(memory[:ets] / 1_048_576, 1)

    %{
      cpu_pct: cpu_pct,
      ram_total_mb: total_mb,
      ram_processes_mb: process_mb,
      ram_ets_mb: ets_mb,
      beam_processes: process_count,
      schedulers: schedulers,
      uptime_seconds: :erlang.statistics(:wall_clock) |> elem(0) |> div(1000)
    }
  end

  @doc "Get full bot info enriched with runtime data"
  def get_bot_full(bot_id) do
    case get_bot(bot_id) do
      {:ok, runtime} ->
        sys = get_system_metrics()
        {:ok, Map.merge(runtime, %{
          cpu_utilization: sys.cpu_pct,
          ram_utilization: sys.ram_total_mb,
          beam_processes: sys.beam_processes
        })}

      error -> error
    end
  end

  @doc "Get all bots enriched for dashboard display"
  def get_all_bots_dashboard(filters \\ %{}) do
    sys = get_system_metrics()
    bots = list_bots()

    # Batch-resolve related entities to avoid N+1 queries
    strategy_ids = bots |> Enum.map(& &1[:strategy_id]) |> Enum.reject(&is_nil/1) |> Enum.uniq()
    credential_ids = bots |> Enum.map(& &1[:credential_id]) |> Enum.reject(&is_nil/1) |> Enum.uniq()
    sa_ids = bots |> Enum.map(& &1[:service_account_id]) |> Enum.reject(&is_nil/1) |> Enum.uniq()
    user_ids = bots |> Enum.map(& &1[:user_id]) |> Enum.reject(&is_nil/1) |> Enum.uniq()

    strategy_map = batch_resolve_strategies(strategy_ids)
    exchange_map = batch_resolve_exchanges(credential_ids)
    sa_map = batch_resolve_service_accounts(sa_ids)
    user_map = batch_resolve_user_emails(user_ids)

    enriched = Enum.map(bots, fn bot ->
      uptime = if bot.started_at do
        DateTime.diff(DateTime.utc_now(), bot.started_at)
      else
        0
      end

      heartbeat_ago = if bot.last_heartbeat do
        DateTime.diff(DateTime.utc_now(), bot.last_heartbeat)
      else
        nil
      end

      win_rate = if bot.total_trades > 0 do
        Float.round(bot.winning_trades / bot.total_trades * 100, 1)
      else
        0.0
      end

      pnl_pct = if bot.active_capital > 0 do
        Float.round(bot.total_pnl / bot.active_capital * 100, 2)
      else
        0.0
      end

      {strategy_name, strategy_type} = Map.get(strategy_map, bot[:strategy_id], {nil, nil})
      exchange_name = Map.get(exchange_map, bot[:credential_id])
      owner_email = Map.get(user_map, bot[:user_id])
      sa_name = Map.get(sa_map, bot[:service_account_id])

      Map.merge(bot, %{
        strategy: strategy_name,
        strategy_type: strategy_type,
        exchange: exchange_name,
        owner_email: owner_email,
        owner_name: owner_email || sa_name,
        uptime_seconds: uptime,
        uptime_formatted: format_duration(uptime),
        heartbeat_seconds_ago: heartbeat_ago,
        win_rate: win_rate,
        pnl_pct: pnl_pct,
        cpu_utilization: sys.cpu_pct,
        ram_utilization_mb: sys.ram_total_mb,
        healthy: heartbeat_ago != nil and heartbeat_ago < @heartbeat_timeout_s
      })
    end)

    # Apply filters
    filtered = enriched
    |> maybe_filter(:status, filters["status"])
    |> maybe_filter(:exchange, filters["exchange"])
    |> maybe_filter(:strategy_type, filters["strategy_type"])
    |> maybe_filter(:user_id, filters["user_id"])
    |> maybe_search(filters["search"])
    |> maybe_filter_owner_type(filters["owner_type"])
    |> maybe_filter_range(:active_capital, filters["equity_min"], filters["equity_max"])
    |> maybe_filter_range(:total_pnl, filters["pnl_min"], filters["pnl_max"])
    |> maybe_filter_pnl_preset(filters["pnl_preset"])
    |> maybe_filter_min(:uptime_seconds, filters["uptime_min"])

    # Total before pagination
    total_count = length(filtered)

    # Apply sorting
    sorted = apply_sort(filtered, filters["sort_by"], filters["sort_dir"])

    # Apply pagination
    page = max((filters["page"] || 1), 1)
    per_page = min(max((filters["per_page"] || 50), 1), 200)
    paginated = sorted |> Enum.drop((page - 1) * per_page) |> Enum.take(per_page)

    {:ok, %{
      bots: paginated,
      system: sys,
      total_count: total_count,
      page: page,
      per_page: per_page,
      total_pages: ceil(total_count / per_page),
      running_bots: Enum.count(enriched, & &1.status == "running"),
      total_pnl: Enum.reduce(enriched, 0.0, & &1.total_pnl + &2)
    }}
  end

  # ============================================================================
  # SERVER CALLBACKS
  # ============================================================================

  @impl true
  def init(_opts) do
    :ets.new(@ets_table, [:named_table, :public, :set, read_concurrency: true])

    # Load existing bots from DB
    load_bots_from_db()

    # Schedule periodic tasks
    Process.send_after(self(), :heartbeat_check, @health_check_interval_ms)
    Process.send_after(self(), :sync_stats_to_db, @stats_sync_interval_ms)

    # Auto-start bots that were running (delayed to let BotSupervisor start first)
    Process.send_after(self(), :auto_start_bots, 5_000)

    Logger.info("🤖 BotRegistry started")
    {:ok, %{}}
  end

  @impl true
  def handle_call({:register, user_id, attrs}, _from, state) do
    bot_attrs = Map.merge(attrs, %{user_id: user_id})

    with :ok <- validate_credential(user_id, bot_attrs),
         :ok <- validate_bot_limit(user_id) do
      changeset = if bot_attrs[:credential_id] do
        Bot.create_changeset(%Bot{}, bot_attrs)
      else
        Bot.changeset(%Bot{}, Map.put(bot_attrs, :status, bot_attrs[:status] || "initializing"))
      end

      case Repo.insert(changeset) do
        {:ok, bot} ->
          runtime = db_bot_to_runtime(bot)
          :ets.insert(@ets_table, {bot.id, runtime})
          broadcast_bot_event(:bot_updated, runtime)
          Logger.info("🤖 Bot registered: #{bot.name} (#{bot.id})")

          # Auto-start: schedule start after a brief delay
          bot_id = bot.id
          Task.start(fn ->
            Process.sleep(200)
            __MODULE__.start_bot(bot_id)
          end)

          {:reply, {:ok, runtime}, state}

        {:error, changeset} ->
          {:reply, {:error, changeset}, state}
      end
    else
      {:error, reason} -> {:reply, {:error, reason}, state}
    end
  end

  @impl true
  def handle_call({:register_system, service_account_id, attrs}, _from, state) do
    bot_attrs = Map.merge(attrs, %{service_account_id: service_account_id})

    with :ok <- validate_bot_limit_service_account(service_account_id) do
      changeset = Bot.create_system_changeset(%Bot{}, bot_attrs)

      case Repo.insert(changeset) do
        {:ok, bot} ->
          runtime = db_bot_to_runtime(bot)
          :ets.insert(@ets_table, {bot.id, runtime})
          broadcast_bot_event(:bot_updated, runtime)
          Logger.info("🤖 System bot registered: #{bot.name} (#{bot.id})")

          # Auto-start: schedule start after a brief delay
          bot_id = bot.id
          Task.start(fn ->
            Process.sleep(200)
            __MODULE__.start_bot(bot_id)
          end)

          {:reply, {:ok, runtime}, state}

        {:error, changeset} ->
          {:reply, {:error, changeset}, state}
      end
    else
      {:error, reason} -> {:reply, {:error, reason}, state}
    end
  end

  @impl true
  def handle_call({:start_bot, bot_id}, _from, state) do
    case :ets.lookup(@ets_table, bot_id) do
      [{^bot_id, runtime}] ->
        # If bot shows "running" but process is dead, reset to "stopped" so FSM allows restart
        runtime = if runtime.status == "running" and BotSupervisor.find_process(bot_id) == nil do
          Logger.warning("Bot #{bot_id} marked running but no process found — resetting to stopped")
          reset = %{runtime | status: "stopped", init_step: nil}
          :ets.insert(@ets_table, {bot_id, reset})
          reset
        else
          runtime
        end

        with :ok <- validate_bot_can_start(runtime) do
          # Determine FSM path based on current status:
          # - paused → running (direct, FSM allows it)
          # - stopped/error → initializing → running (two-step)
          from_status = runtime.status
          needs_init = from_status not in ["paused", "initializing"]

          pre_start_status = if needs_init do
            case BotFSM.transition(bot_id, from_status, "initializing",
                   trigger: "api_call", bot: runtime) do
              {:ok, _} ->
                init_runtime = %{runtime | status: "initializing", init_step: "starting_process"}
                :ets.insert(@ets_table, {bot_id, init_runtime})
                broadcast_bot_event(:bot_updated, init_runtime)
                broadcast_transition(bot_id, from_status, "initializing")
                {:ok, "initializing"}
              {:error, reason} -> {:error, reason}
            end
          else
            {:ok, from_status}
          end

          case pre_start_status do
            {:error, reason} ->
              Logger.warning("Bot #{bot_id} FSM rejected: #{inspect(reason)} (status: #{from_status})")
              {:reply, {:error, reason}, state}

            {:ok, current_status} ->
              # Start the trading process, then transition to running
              case BotSupervisor.start_trading_process(bot_id) do
                {:ok, pid} ->
                  BotFSM.transition(bot_id, current_status, "running",
                    trigger: "system", bot: runtime)

                  now = DateTime.utc_now()
                  node_name = to_string(node())
                  updated = %{runtime |
                    status: "running",
                    started_at: now,
                    last_heartbeat: now,
                    elixir_node: node_name,
                    elixir_pid: inspect(pid),
                    init_step: nil
                  }
                  :ets.insert(@ets_table, {bot_id, updated})
                  update_bot_db(bot_id, %{
                    status: "running",
                    started_at: now,
                    last_heartbeat: now,
                    elixir_node: node_name,
                    elixir_pid: inspect(pid),
                    init_step: nil
                  })
                  broadcast_bot_event(:bot_started, updated)
                  broadcast_transition(bot_id, current_status, "running")
                  Logger.info("🟢 Bot started: #{runtime.name} (pid: #{inspect(pid)})")
                  {:reply, {:ok, updated}, state}

                {:error, reason} ->
                  BotFSM.transition(bot_id, current_status, "error",
                    trigger: "system", reason: "Failed to start trading process: #{inspect(reason)}")

                  error_runtime = %{runtime | status: "error", last_error: "Failed to start: #{inspect(reason)}"}
                  :ets.insert(@ets_table, {bot_id, error_runtime})
                  update_bot_db(bot_id, %{status: "error", error_message: "Failed to start trading process: #{inspect(reason)}"})
                  broadcast_bot_event(:bot_error, %{bot_id: bot_id, error: "Failed to start: #{inspect(reason)}"})
                  broadcast_transition(bot_id, current_status, "error")
                  Logger.error("🤖❌ Failed to start bot #{runtime.name}: #{inspect(reason)}")
                  {:reply, {:error, {:start_failed, reason}}, state}
              end
          end
        else
          {:error, reason} ->
            Logger.warning("Bot #{bot_id} cannot start: #{inspect(reason)} (current status: #{runtime.status})")
            {:reply, {:error, reason}, state}
        end

      [] ->
        {:reply, {:error, :not_found}, state}
    end
  end

  @impl true
  def handle_call({:stop_bot, bot_id}, _from, state) do
    case :ets.lookup(@ets_table, bot_id) do
      [{^bot_id, runtime}] ->
        # Transition to stopping first
        from_status = runtime.status
        BotFSM.transition(bot_id, from_status, "stopping",
          trigger: "api_call", reason: "Manual stop requested")

        updated_stopping = %{runtime | status: "stopping"}
        :ets.insert(@ets_table, {bot_id, updated_stopping})
        broadcast_bot_event(:bot_updated, updated_stopping)
        broadcast_transition(bot_id, from_status, "stopping")

        # Stop the trading process
        BotSupervisor.stop_trading_process(bot_id)

        # Transition stopping → stopped
        BotFSM.transition(bot_id, "stopping", "stopped",
          trigger: "system", reason: "Trading process terminated")

        now = DateTime.utc_now()
        updated = %{runtime |
          status: "stopped",
          stopped_at: now,
          elixir_pid: nil
        }
        :ets.insert(@ets_table, {bot_id, updated})
        update_bot_db(bot_id, %{status: "stopped", stopped_at: now, elixir_pid: nil})
        broadcast_bot_event(:bot_stopped, updated)
        broadcast_transition(bot_id, "stopping", "stopped")

        Logger.info("🔴 Bot stopped: #{runtime.name}")
        {:reply, {:ok, updated}, state}

      [] ->
        {:reply, {:error, :not_found}, state}
    end
  end

  @impl true
  def handle_call({:set_status, bot_id, new_status}, _from, state) do
    case :ets.lookup(@ets_table, bot_id) do
      [{^bot_id, runtime}] ->
        case BotFSM.transition(bot_id, runtime.status, new_status,
               trigger: "api_call", bot: runtime) do
          {:ok, _transition} ->
            updated = %{runtime | status: new_status}
            :ets.insert(@ets_table, {bot_id, updated})
            update_bot_db(bot_id, %{status: new_status})
            broadcast_bot_event(:bot_updated, updated)
            broadcast_transition(bot_id, runtime.status, new_status)
            {:reply, {:ok, updated}, state}

          {:error, reason} ->
            {:reply, {:error, reason}, state}
        end

      [] ->
        {:reply, {:error, :not_found}, state}
    end
  end

  @impl true
  def handle_cast({:heartbeat, bot_id}, state) do
    case :ets.lookup(@ets_table, bot_id) do
      [{^bot_id, runtime}] ->
        updated = %{runtime | last_heartbeat: DateTime.utc_now()}
        :ets.insert(@ets_table, {bot_id, updated})
        broadcast_bot_event(:bot_heartbeat, %{bot_id: bot_id, last_heartbeat: updated.last_heartbeat, status: updated.status})
      _ -> :ok
    end
    {:noreply, state}
  end

  @impl true
  def handle_cast({:error, bot_id, message}, state) do
    case :ets.lookup(@ets_table, bot_id) do
      [{^bot_id, runtime}] ->
        updated = %{runtime |
          status: "error",
          last_error: message,
          error_count: runtime.error_count + 1
        }
        :ets.insert(@ets_table, {bot_id, updated})
        broadcast_bot_event(:bot_error, %{bot_id: bot_id, error: message})
        Logger.error("🤖❌ Bot #{runtime.name} error: #{message}")
      _ -> :ok
    end
    {:noreply, state}
  end

  @impl true
  def handle_cast({:trade_result, bot_id, pnl, won?}, state) do
    case :ets.lookup(@ets_table, bot_id) do
      [{^bot_id, runtime}] ->
        updated = %{runtime |
          total_trades: runtime.total_trades + 1,
          winning_trades: if(won?, do: runtime.winning_trades + 1, else: runtime.winning_trades),
          losing_trades: if(not won?, do: runtime.losing_trades + 1, else: runtime.losing_trades),
          total_pnl: runtime.total_pnl + pnl,
          last_trade_at: DateTime.utc_now(),
          last_heartbeat: DateTime.utc_now()
        }
        :ets.insert(@ets_table, {bot_id, updated})
        broadcast_bot_event(:bot_updated, updated)
        record_equity_snapshot(updated, "trade")
      _ -> :ok
    end
    {:noreply, state}
  end

  @impl true
  def handle_cast({:update_positions, bot_id, count}, state) do
    case :ets.lookup(@ets_table, bot_id) do
      [{^bot_id, runtime}] ->
        updated = %{runtime | open_positions: count}
        :ets.insert(@ets_table, {bot_id, updated})
      _ -> :ok
    end
    {:noreply, state}
  end

  @impl true
  def handle_cast({:init_step, bot_id, step}, state) do
    case :ets.lookup(@ets_table, bot_id) do
      [{^bot_id, runtime}] ->
        updated = %{runtime | init_step: step}
        :ets.insert(@ets_table, {bot_id, updated})
        update_bot_db(bot_id, %{init_step: step})
        broadcast_bot_event(:bot_init_step, %{bot_id: bot_id, init_step: step, name: runtime.name})
      _ -> :ok
    end
    {:noreply, state}
  end

  @impl true
  def handle_info(:heartbeat_check, state) do
    now = DateTime.utc_now()

    :ets.tab2list(@ets_table)
    |> Enum.each(fn {bot_id, runtime} ->
      if runtime.status == "running" and runtime.last_heartbeat do
        age = DateTime.diff(now, runtime.last_heartbeat)
        if age > @heartbeat_timeout_s do
          Logger.warning("🤖💀 Bot #{runtime.name} missed heartbeat (#{age}s)")
          BotFSM.transition(bot_id, "running", "error",
            trigger: "heartbeat_timeout",
            reason: "Heartbeat timeout (#{age}s)",
            triggered_by: "system")
          updated = %{runtime | status: "error", last_error: "Heartbeat timeout (#{age}s)"}
          :ets.insert(@ets_table, {bot_id, updated})
          broadcast_transition(bot_id, "running", "error")
        end
      end
    end)

    Process.send_after(self(), :heartbeat_check, @health_check_interval_ms)
    {:noreply, state}
  end

  @impl true
  def handle_info(:sync_stats_to_db, state) do
    :ets.tab2list(@ets_table)
    |> Enum.each(fn {bot_id, runtime} ->
      update_bot_db(bot_id, %{
        status: runtime.status,
        total_trades: runtime.total_trades,
        winning_trades: runtime.winning_trades,
        losing_trades: runtime.losing_trades,
        total_pnl: Decimal.from_float(runtime.total_pnl + 0.0),
        allocated_capital: Decimal.from_float(runtime.allocated_capital + 0.0),
        active_capital: Decimal.from_float(runtime.active_capital + 0.0),
        last_heartbeat: runtime.last_heartbeat,
        last_trade_at: runtime.last_trade_at,
        last_error: runtime.last_error,
        error_count: runtime.error_count
      })

      if runtime.status == "running" and runtime.allocated_capital > 0 do
        record_equity_snapshot(runtime, "periodic")
      end
    end)

    Process.send_after(self(), :sync_stats_to_db, @stats_sync_interval_ms)
    {:noreply, state}
  end

  @impl true
  def handle_info(:auto_start_bots, state) do
    auto_start_running_bots()
    {:noreply, state}
  end

  @impl true
  def handle_info(_, state), do: {:noreply, state}

  # ============================================================================
  # PRIVATE
  # ============================================================================

  defp load_bots_from_db do
    try do
      Repo.all(Bot)
      |> Enum.each(fn bot ->
        runtime = db_bot_to_runtime(bot)
        :ets.insert(@ets_table, {bot.id, runtime})
      end)
    rescue
      e -> Logger.warning("Could not load bots from DB: #{inspect(e)}")
    end
  end

  defp db_bot_to_runtime(%Bot{} = bot) do
    %{
      id: bot.id,
      name: bot.name,
      user_id: bot.user_id,
      service_account_id: bot.service_account_id,
      strategy_id: bot.strategy_id,
      credential_id: bot.credential_id,
      market_type: bot.market_type || "spot",
      config: bot.config || %{},
      risk_overrides: bot.risk_overrides || %{},
      status: bot.status,
      trading_pairs: bot.trading_pairs || [],
      allocated_capital: safe_decimal(bot.allocated_capital),
      active_capital: safe_decimal(bot.active_capital),
      total_trades: bot.total_trades || 0,
      winning_trades: bot.winning_trades || 0,
      losing_trades: bot.losing_trades || 0,
      total_pnl: safe_decimal(bot.total_pnl),
      open_positions: 0,
      error_count: bot.error_count || 0,
      last_error: bot.last_error,
      started_at: bot.started_at,
      stopped_at: bot.stopped_at,
      last_heartbeat: bot.last_heartbeat,
      last_trade_at: bot.last_trade_at,
      created_at: bot.created_at,
      elixir_node: bot.elixir_node,
      elixir_pid: bot.elixir_pid,
      init_step: bot.init_step
    }
  end

  defp update_bot_db(bot_id, attrs) do
    try do
      case Repo.get(Bot, bot_id) do
        nil -> :ok
        bot -> bot |> Bot.changeset(attrs) |> Repo.update()
      end
    rescue
      _ -> :ok
    end
  end

  defp safe_decimal(nil), do: 0.0
  defp safe_decimal(%Decimal{} = d), do: Decimal.to_float(d)
  defp safe_decimal(n) when is_number(n), do: n + 0.0
  defp safe_decimal(_), do: 0.0

  # Broadcast bot events to PubSub for WebSocket channels
  defp broadcast_bot_event(event, payload) do
    Phoenix.PubSub.broadcast(@pubsub, "bots:updates", {event, payload})
    # Also broadcast to bot-specific topic
    if bot_id = Map.get(payload, :id) || Map.get(payload, :bot_id) do
      Phoenix.PubSub.broadcast(@pubsub, "bot:#{bot_id}", {event, payload})
    end
  rescue
    _ -> :ok
  end

  # Broadcast a state transition event
  defp broadcast_transition(bot_id, from_status, to_status) do
    payload = %{
      bot_id: bot_id,
      from_status: from_status,
      to_status: to_status,
      timestamp: DateTime.utc_now()
    }
    Phoenix.PubSub.broadcast(@pubsub, "bots:updates", {:bot_transition, payload})
    Phoenix.PubSub.broadcast(@pubsub, "bot:#{bot_id}", {:bot_transition, payload})
  rescue
    _ -> :ok
  end

  # Validate that credential exists and belongs to the user
  defp validate_credential(_user_id, %{credential_id: nil}), do: :ok
  defp validate_credential(_user_id, attrs) when not is_map_key(attrs, :credential_id), do: :ok
  defp validate_credential(user_id, %{credential_id: cred_id}) do
    alias SysAdmin.Exchanges.ExchangeConfig
    case Repo.get(ExchangeConfig, cred_id) do
      nil -> {:error, :credential_not_found}
      %{user_id: ^user_id} -> :ok
      _ -> {:error, :credential_not_owned}
    end
  rescue
    _ -> :ok  # Skip validation if table not accessible
  end

  # Check max_bots_per_user limit (works for both user_id and service_account_id)
  defp validate_bot_limit(user_id) do
    max_bots = get_max_bots_per_user()
    current_count = Repo.aggregate(
      from(b in Bot, where: b.user_id == ^user_id),
      :count
    )
    if current_count < max_bots, do: :ok, else: {:error, :max_bots_reached}
  rescue
    _ -> :ok  # Skip validation if DB issue
  end

  defp validate_bot_limit_service_account(service_account_id) do
    max_bots = get_max_bots_per_user()
    current_count = Repo.aggregate(
      from(b in Bot, where: b.service_account_id == ^service_account_id),
      :count
    )
    if current_count < max_bots, do: :ok, else: {:error, :max_bots_reached}
  rescue
    _ -> :ok
  end

  defp get_max_bots_per_user do
    try do
      case Repo.one(from r in "risk_controls", prefix: "platform", select: r.max_bots_per_user, limit: 1) do
        nil -> 10
        n -> n
      end
    rescue
      _ -> 10
    end
  end

  # Pre-start validations
  defp validate_bot_can_start(runtime) do
    cond do
      runtime.status == "running" and BotSupervisor.find_process(Map.get(runtime, :id) || Map.get(runtime, :bot_id)) != nil ->
        {:error, :already_running}
      runtime.trading_pairs == nil or runtime.trading_pairs == [] ->
        {:error, :no_trading_pairs}
      true ->
        # Validate credential is active if present
        if runtime.credential_id do
          validate_credential_active(runtime.credential_id)
        else
          :ok
        end
    end
  end

  defp validate_credential_active(cred_id) do
    alias SysAdmin.Exchanges.ExchangeConfig
    case Repo.get(ExchangeConfig, cred_id) do
      nil -> {:error, :credential_not_found}
      %{status: s} when s in ["revoked", "expired", "failed_validation"] -> {:error, :credential_disabled}
      _ -> :ok
    end
  rescue
    _ -> :ok
  end

  # Auto-start bots that were running when the node went down
  defp auto_start_running_bots do
    try do
      :ets.tab2list(@ets_table)
      |> Enum.filter(fn {_id, runtime} -> runtime.status == "running" end)
      |> Enum.each(fn {bot_id, runtime} ->
        case BotSupervisor.start_trading_process(bot_id) do
          {:ok, pid} ->
            updated = %{runtime | elixir_pid: inspect(pid), elixir_node: to_string(node())}
            :ets.insert(@ets_table, {bot_id, updated})
            Logger.info("🤖 Auto-started bot: #{runtime.name} (#{bot_id})")
          {:error, reason} ->
            Logger.warning("🤖 Failed to auto-start bot #{runtime.name}: #{inspect(reason)}")
            updated = %{runtime | status: "error", last_error: "Auto-start failed: #{inspect(reason)}"}
            :ets.insert(@ets_table, {bot_id, updated})
        end
      end)
    rescue
      e -> Logger.warning("Auto-start failed: #{inspect(e)}")
    end
  end

  defp record_equity_snapshot(runtime, source) do
    try do
      equity = runtime.allocated_capital + runtime.total_pnl

      # user_id FK references auth.users — only set if bot has a real user_id
      # Service account bots don't have a user_id in auth.users
      user_id = runtime.user_id

      # Skip snapshot if no valid user_id (service account bots need user_id nullable)
      # For now, use direct insert to bypass the FK when user_id is nil
      attrs = %{
        bot_id: runtime.id,
        total_equity_usd: Decimal.from_float(equity + 0.0),
        available_balance_usd: Decimal.from_float(runtime.active_capital + 0.0),
        unrealized_pnl_usd: Decimal.new(0),
        realized_pnl_usd: Decimal.from_float(runtime.total_pnl + 0.0),
        open_positions: runtime.open_positions || 0,
        snapshot_source: source,
        snapshot_at: DateTime.utc_now(),
        high_water_mark_usd: Decimal.from_float(equity + 0.0)
      }

      attrs = if user_id, do: Map.put(attrs, :user_id, user_id), else: attrs

      case EquitySnapshot.insert_snapshot(attrs) do
        {:ok, _} -> :ok
        {:error, changeset} ->
          Logger.warning("Equity snapshot insert failed: #{inspect(changeset.errors)}")
      end
    rescue
      e -> Logger.warning("Equity snapshot exception: #{inspect(e)}")
    end
  end

  defp uuid_to_bin(str) when is_binary(str) do
    {:ok, bin} = Ecto.UUID.dump(str)
    bin
  end

  defp bin_to_uuid(bin) when is_binary(bin) and byte_size(bin) == 16 do
    {:ok, str} = Ecto.UUID.load(bin)
    str
  end
  defp bin_to_uuid(other), do: to_string(other)

  # Batch-resolve strategy names & types: %{strategy_id => {name, type}}
  defp batch_resolve_strategies([]), do: %{}
  defp batch_resolve_strategies(ids) do
    bins = Enum.map(ids, &uuid_to_bin(to_string(&1)))
    placeholders = Enum.map_join(1..length(bins), ", ", &"$#{&1}")
    case Repo.query("SELECT id, name, type FROM strategy.strategies WHERE id IN (#{placeholders})", bins) do
      {:ok, %{rows: rows}} -> Map.new(rows, fn [id, name, type] -> {bin_to_uuid(id), {name, type}} end)
      _ -> %{}
    end
  rescue
    _ -> %{}
  end

  # Batch-resolve exchange names from credentials: %{credential_id => exchange_name}
  defp batch_resolve_exchanges([]), do: %{}
  defp batch_resolve_exchanges(ids) do
    bins = Enum.map(ids, &uuid_to_bin(to_string(&1)))
    placeholders = Enum.map_join(1..length(bins), ", ", &"$#{&1}")
    case Repo.query(
      "SELECT c.id, a.name FROM exchange.user_credentials c JOIN exchange.adapters a ON a.id = c.adapter_id WHERE c.id IN (#{placeholders})",
      bins
    ) do
      {:ok, %{rows: rows}} -> Map.new(rows, fn [cred_id, name] -> {bin_to_uuid(cred_id), name} end)
      _ -> %{}
    end
  rescue
    _ -> %{}
  end

  # Batch-resolve service account names: %{sa_id => name}
  defp batch_resolve_service_accounts([]), do: %{}
  defp batch_resolve_service_accounts(ids) do
    bins = Enum.map(ids, &uuid_to_bin(to_string(&1)))
    placeholders = Enum.map_join(1..length(bins), ", ", &"$#{&1}")
    case Repo.query("SELECT id, name FROM platform.service_accounts WHERE id IN (#{placeholders})", bins) do
      {:ok, %{rows: rows}} -> Map.new(rows, fn [id, name] -> {bin_to_uuid(id), name} end)
      _ -> %{}
    end
  rescue
    _ -> %{}
  end

  # Batch-resolve user emails: %{user_id => email}
  defp batch_resolve_user_emails([]), do: %{}
  defp batch_resolve_user_emails(ids) do
    bins = Enum.map(ids, &uuid_to_bin(to_string(&1)))
    placeholders = Enum.map_join(1..length(bins), ", ", &"$#{&1}")
    case Repo.query("SELECT id, email FROM auth.users WHERE id IN (#{placeholders})", bins) do
      {:ok, %{rows: rows}} -> Map.new(rows, fn [id, email] -> {bin_to_uuid(id), email} end)
      _ -> %{}
    end
  rescue
    _ -> %{}
  end

  # ── Filtering & Sorting helpers ──────────────────────────────────────────

  defp maybe_filter(bots, _field, nil), do: bots
  defp maybe_filter(bots, _field, ""), do: bots
  defp maybe_filter(bots, field, value) do
    Enum.filter(bots, fn bot ->
      bot_val = Map.get(bot, field)
      is_binary(bot_val) and is_binary(value) and
        String.downcase(bot_val) == String.downcase(value)
    end)
  end

  defp maybe_filter_owner_type(bots, nil), do: bots
  defp maybe_filter_owner_type(bots, ""), do: bots
  defp maybe_filter_owner_type(bots, "user") do
    Enum.filter(bots, fn bot -> bot[:user_id] != nil end)
  end
  defp maybe_filter_owner_type(bots, "service_account") do
    Enum.filter(bots, fn bot -> bot[:service_account_id] != nil end)
  end
  defp maybe_filter_owner_type(bots, _), do: bots

  defp maybe_filter_range(bots, _field, nil, nil), do: bots
  defp maybe_filter_range(bots, field, min_val, max_val) do
    Enum.filter(bots, fn bot ->
      val = Map.get(bot, field) || 0.0
      above_min = if min_val, do: val >= min_val, else: true
      below_max = if max_val, do: val <= max_val, else: true
      above_min and below_max
    end)
  end

  defp maybe_filter_pnl_preset(bots, nil), do: bots
  defp maybe_filter_pnl_preset(bots, ""), do: bots
  defp maybe_filter_pnl_preset(bots, "profitable") do
    Enum.filter(bots, fn bot -> (bot[:total_pnl] || 0.0) > 0 end)
  end
  defp maybe_filter_pnl_preset(bots, "losing") do
    Enum.filter(bots, fn bot -> (bot[:total_pnl] || 0.0) < 0 end)
  end
  defp maybe_filter_pnl_preset(bots, "breakeven") do
    Enum.filter(bots, fn bot -> (bot[:total_pnl] || 0.0) == 0.0 end)
  end
  defp maybe_filter_pnl_preset(bots, _), do: bots

  defp maybe_filter_min(bots, _field, nil), do: bots
  defp maybe_filter_min(bots, field, min_val) when is_number(min_val) do
    Enum.filter(bots, fn bot -> (Map.get(bot, field) || 0) >= min_val end)
  end
  defp maybe_filter_min(bots, _, _), do: bots

  defp maybe_search(bots, nil), do: bots
  defp maybe_search(bots, ""), do: bots
  defp maybe_search(bots, query) do
    q = String.downcase(query)
    Enum.filter(bots, fn bot ->
      name = (bot[:name] || "") |> to_string() |> String.downcase()
      id = (bot[:id] || "") |> to_string() |> String.downcase()
      String.contains?(name, q) or String.contains?(id, q)
    end)
  end

  defp apply_sort(bots, nil, _dir), do: bots
  defp apply_sort(bots, "", _dir), do: bots
  defp apply_sort(bots, sort_by, sort_dir) do
    field = case sort_by do
      "pnl" -> :total_pnl
      "equity" -> :active_capital
      "status" -> :status
      "name" -> :name
      "uptime" -> :uptime_seconds
      "win_rate" -> :win_rate
      "trades" -> :total_trades
      _ -> nil
    end

    if field do
      sorted = Enum.sort_by(bots, &(Map.get(&1, field) || 0), &<=/2)
      if sort_dir == "desc", do: Enum.reverse(sorted), else: sorted
    else
      bots
    end
  end

  defp format_duration(seconds) when is_integer(seconds) do
    days = div(seconds, 86400)
    hours = div(rem(seconds, 86400), 3600)
    mins = div(rem(seconds, 3600), 60)

    cond do
      days > 0 -> "#{days}d #{hours}h #{mins}m"
      hours > 0 -> "#{hours}h #{mins}m"
      true -> "#{mins}m"
    end
  end
  defp format_duration(_), do: "0m"
end
