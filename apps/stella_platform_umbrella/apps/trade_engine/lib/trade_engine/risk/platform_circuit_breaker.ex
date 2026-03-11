defmodule TradeEngine.Risk.PlatformCircuitBreaker do
  @moduledoc """
  Platform-level circuit breaker that monitors aggregate risk across ALL bots.

  Checks every 15 seconds for:
  1. Aggregate daily loss exceeding circuit_breaker_pct × total allocated capital
  2. Simultaneous losers — too many bots negative in the same window
  3. Loss velocity — aggregate P&L dropping too fast

  On trip: pauses ALL running bots, transitions them to circuit_broken,
  records event in risk.circuit_breaker_events, and broadcasts critical alert.
  Requires manual reset via reset/0.
  """

  use GenServer
  require Logger
  import Ecto.Query

  alias TradeEngine.Repo
  alias TradeEngine.Trading.Position
  alias TradeEngine.Bots.BotRegistry

  @pubsub TradeEngine.PubSub
  @ets_table :platform_circuit_breaker_cache
  @tick_interval_ms 15_000

  # Defaults (overridden by platform.risk_controls)
  @default_circuit_breaker_pct 25.0
  @default_min_bots_for_trip 3
  @default_velocity_pct 10.0
  @default_velocity_window_minutes 5

  # ---------------------------------------------------------------------------
  # CLIENT API
  # ---------------------------------------------------------------------------

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc "Get current circuit breaker status"
  def status do
    case :ets.lookup(@ets_table, :status) do
      [{:status, data}] -> data
      _ -> default_status()
    end
  rescue
    ArgumentError -> default_status()
  end

  @doc "Manually reset the circuit breaker after a trip"
  def reset do
    GenServer.call(__MODULE__, :reset)
  end

  @doc "Get stats for dashboard display"
  def stats do
    GenServer.call(__MODULE__, :stats)
  end

  # ---------------------------------------------------------------------------
  # GENSERVER
  # ---------------------------------------------------------------------------

  @impl true
  def init(_opts) do
    :ets.new(@ets_table, [:named_table, :set, :public, read_concurrency: true])
    :ets.insert(@ets_table, {:status, default_status()})

    Logger.info("Platform Circuit Breaker started — checking every #{div(@tick_interval_ms, 1000)}s")
    Process.send_after(self(), :check, 10_000)

    {:ok, %{
      tripped: false,
      trip_count: 0,
      last_trip: nil,
      last_check: nil,
      pnl_history: [],
      checks_since_trip: 0
    }}
  end

  @impl true
  def handle_call(:reset, _from, state) do
    Logger.info("Platform Circuit Breaker manually reset")

    new_status = default_status()
    :ets.insert(@ets_table, {:status, new_status})

    Phoenix.PubSub.broadcast(@pubsub, "alerts:new", {:new_alert, %{
      id: Ecto.UUID.generate(),
      alert_type: "circuit_breaker",
      category: "risk",
      severity: "info",
      title: "Platform Circuit Breaker Reset",
      message: "Circuit breaker manually reset — bots may be restarted",
      metadata: %{},
      timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
    }})

    {:reply, :ok, %{state | tripped: false, pnl_history: []}}
  end

  @impl true
  def handle_call(:stats, _from, state) do
    {:reply, %{
      tripped: state.tripped,
      trip_count: state.trip_count,
      last_trip: state.last_trip,
      last_check: state.last_check,
      checks_since_trip: state.checks_since_trip
    }, state}
  end

  @impl true
  def handle_info(:check, state) do
    Process.send_after(self(), :check, @tick_interval_ms)

    if state.tripped do
      {:noreply, %{state | last_check: DateTime.utc_now(), checks_since_trip: state.checks_since_trip + 1}}
    else
      new_state = run_checks(state)
      {:noreply, %{new_state | last_check: DateTime.utc_now()}}
    end
  end

  def handle_info(_msg, state), do: {:noreply, state}

  # ---------------------------------------------------------------------------
  # CORE CHECKS
  # ---------------------------------------------------------------------------

  defp run_checks(state) do
    limits = load_limits()
    running_bots = get_running_bots()

    if length(running_bots) == 0 do
      update_status(state, running_bots, limits)
      state
    else
      aggregate_pnl = get_aggregate_daily_pnl()
      total_capital = get_total_allocated_capital(running_bots)
      per_bot_pnl = get_per_bot_daily_pnl(running_bots)
      pnl_history = update_pnl_history(state.pnl_history, aggregate_pnl)

      # Check 1: Aggregate loss exceeds circuit breaker threshold
      trip_reason = check_aggregate_loss(aggregate_pnl, total_capital, limits)

      # Check 2: Too many bots losing simultaneously
      trip_reason = trip_reason || check_simultaneous_losers(per_bot_pnl, limits)

      # Check 3: Loss velocity (rapid drawdown)
      trip_reason = trip_reason || check_velocity(pnl_history, total_capital, limits)

      new_state = %{state | pnl_history: pnl_history}

      case trip_reason do
        nil ->
          update_status(new_state, running_bots, limits, %{
            aggregate_pnl: aggregate_pnl,
            total_capital: total_capital,
            losing_bots: Enum.count(per_bot_pnl, fn {_id, pnl} -> pnl < 0 end),
            total_bots: length(running_bots)
          })
          new_state

        {reason, details} ->
          trip!(running_bots, reason, details)
          tripped_state = %{new_state |
            tripped: true,
            trip_count: new_state.trip_count + 1,
            last_trip: DateTime.utc_now(),
            checks_since_trip: 0
          }
          update_status(tripped_state, running_bots, limits, details)
          tripped_state
      end
    end
  rescue
    e ->
      Logger.warning("PlatformCircuitBreaker check error: #{Exception.message(e)}")
      state
  end

  defp check_aggregate_loss(aggregate_pnl, total_capital, limits) when total_capital > 0 do
    loss_pct = abs(min(aggregate_pnl, 0)) / total_capital * 100

    if aggregate_pnl < 0 and loss_pct >= limits.circuit_breaker_pct do
      {"aggregate_loss_exceeded", %{
        aggregate_pnl: Float.round(aggregate_pnl, 2),
        total_capital: Float.round(total_capital, 2),
        loss_pct: Float.round(loss_pct, 2),
        threshold_pct: limits.circuit_breaker_pct
      }}
    end
  end
  defp check_aggregate_loss(_, _, _), do: nil

  defp check_simultaneous_losers(per_bot_pnl, limits) do
    losing_bots = Enum.filter(per_bot_pnl, fn {_id, pnl} -> pnl < -10.0 end)
    losing_count = length(losing_bots)
    total_count = map_size(per_bot_pnl)

    if losing_count >= limits.min_bots_for_trip and total_count > 1 do
      {"simultaneous_losers", %{
        losing_bots: losing_count,
        total_bots: total_count,
        threshold: limits.min_bots_for_trip,
        bot_losses: Enum.map(losing_bots, fn {id, pnl} -> %{bot_id: id, daily_pnl: Float.round(pnl, 2)} end)
      }}
    end
  end

  defp check_velocity(pnl_history, total_capital, limits) when total_capital > 0 do
    window_ms = limits.velocity_window_minutes * 60 * 1_000
    now = System.system_time(:millisecond)
    cutoff = now - window_ms

    recent = Enum.filter(pnl_history, fn {ts, _pnl} -> ts >= cutoff end)

    case {List.last(recent), List.first(recent)} do
      {{_, latest_pnl}, {_, earliest_pnl}} when latest_pnl < earliest_pnl ->
        drop = earliest_pnl - latest_pnl
        drop_pct = drop / total_capital * 100

        if drop_pct >= limits.velocity_pct do
          {"loss_velocity_exceeded", %{
            drop_usd: Float.round(drop, 2),
            drop_pct: Float.round(drop_pct, 2),
            window_minutes: limits.velocity_window_minutes,
            threshold_pct: limits.velocity_pct
          }}
        end

      _ -> nil
    end
  end
  defp check_velocity(_, _, _), do: nil

  # ---------------------------------------------------------------------------
  # TRIP ACTION
  # ---------------------------------------------------------------------------

  defp trip!(running_bots, reason, details) do
    bot_count = length(running_bots)
    Logger.error("PLATFORM CIRCUIT BREAKER TRIPPED: #{reason} — pausing #{bot_count} bots")

    # Pause all running bots
    bot_ids = Enum.map(running_bots, fn bot ->
      bot_id = Map.get(bot, :bot_id) || bot.id
      try do
        BotRegistry.transition_bot(bot_id, "circuit_broken", "platform_circuit_breaker", reason)
      rescue
        _ ->
          try do
            BotRegistry.pause_bot(bot_id)
          rescue
            _ -> :ok
          end
      end
      bot_id
    end)

    # Record circuit breaker event in DB
    persist_event(reason, details, bot_ids)

    # Broadcast critical alert
    alert = %{
      id: Ecto.UUID.generate(),
      alert_type: "circuit_breaker",
      category: "risk",
      severity: "critical",
      title: "Platform Circuit Breaker Tripped",
      message: "#{reason}: #{bot_count} bots paused. Manual reset required.",
      metadata: Map.merge(details, %{bots_affected: bot_ids}),
      timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
    }

    Phoenix.PubSub.broadcast(@pubsub, "alerts:new", {:new_alert, alert})
    Phoenix.PubSub.broadcast(@pubsub, "alerts:risk_breach", {:risk_breach, alert})
    Phoenix.PubSub.broadcast(@pubsub, "platform:circuit_breaker", {:circuit_breaker_tripped, alert})
  end

  defp persist_event(reason, details, bot_ids) do
    now = NaiveDateTime.utc_now()
    Repo.query(
      """
      INSERT INTO risk.circuit_breaker_events
        (id, trigger_type, trigger_details, bots_affected, triggered_at, created_at)
      VALUES ($1, $2, $3, $4, $5, $5)
      """,
      [Ecto.UUID.generate(), reason, details, bot_ids, now],
      timeout: 5_000
    )
  rescue
    e -> Logger.warning("Failed to persist circuit breaker event: #{Exception.message(e)}")
  end

  # ---------------------------------------------------------------------------
  # DATA HELPERS
  # ---------------------------------------------------------------------------

  defp get_running_bots do
    try do
      BotRegistry.list_bots()
      |> Enum.filter(fn bot -> Map.get(bot, :status) == "running" end)
    rescue
      _ -> []
    end
  end

  defp get_aggregate_daily_pnl do
    today_start = NaiveDateTime.utc_now() |> NaiveDateTime.beginning_of_day()

    result = from(p in Position,
      where: p.status == "closed" and p.exit_time >= ^today_start,
      select: sum(p.profit_loss)
    )
    |> Repo.one(timeout: 5_000)

    decimal_to_float(result)
  rescue
    _ -> 0.0
  end

  defp get_per_bot_daily_pnl(running_bots) do
    today_start = NaiveDateTime.utc_now() |> NaiveDateTime.beginning_of_day()
    bot_ids = Enum.map(running_bots, fn bot -> Map.get(bot, :bot_id) || bot.id end)

    results = from(p in Position,
      where: p.bot_id in ^bot_ids and p.status == "closed" and p.exit_time >= ^today_start,
      group_by: p.bot_id,
      select: {p.bot_id, sum(p.profit_loss)}
    )
    |> Repo.all(timeout: 5_000)

    Map.new(results, fn {bot_id, pnl} -> {bot_id, decimal_to_float(pnl)} end)
  rescue
    _ -> %{}
  end

  defp get_total_allocated_capital(running_bots) do
    running_bots
    |> Enum.reduce(0.0, fn bot, acc ->
      capital = Map.get(bot, :allocated_capital) || 0
      acc + decimal_to_float(capital)
    end)
  end

  defp update_pnl_history(history, current_pnl) do
    now = System.system_time(:millisecond)
    # Keep last 10 minutes of history
    cutoff = now - 600_000
    [{now, current_pnl} | Enum.filter(history, fn {ts, _} -> ts >= cutoff end)]
  end

  defp load_limits do
    case Repo.one(TradeEngine.Platform.RiskControls, timeout: 5_000) do
      nil -> default_limits()
      controls ->
        %{
          circuit_breaker_pct: decimal_to_float(controls.circuit_breaker_pct) || @default_circuit_breaker_pct,
          min_bots_for_trip: @default_min_bots_for_trip,
          velocity_pct: @default_velocity_pct,
          velocity_window_minutes: @default_velocity_window_minutes
        }
    end
  rescue
    _ -> default_limits()
  end

  defp default_limits do
    %{
      circuit_breaker_pct: @default_circuit_breaker_pct,
      min_bots_for_trip: @default_min_bots_for_trip,
      velocity_pct: @default_velocity_pct,
      velocity_window_minutes: @default_velocity_window_minutes
    }
  end

  defp update_status(state, running_bots, limits, extra \\ %{}) do
    status = %{
      tripped: state.tripped,
      trip_count: state.trip_count,
      last_trip: state.last_trip,
      last_check: DateTime.utc_now() |> DateTime.to_iso8601(),
      running_bots: length(running_bots),
      thresholds: %{
        aggregate_loss_pct: limits.circuit_breaker_pct,
        min_simultaneous_losers: limits.min_bots_for_trip,
        velocity_pct: limits.velocity_pct,
        velocity_window_min: limits.velocity_window_minutes
      },
      current: extra
    }

    :ets.insert(@ets_table, {:status, status})
  end

  defp default_status do
    %{
      tripped: false,
      trip_count: 0,
      last_trip: nil,
      last_check: nil,
      running_bots: 0,
      thresholds: %{
        aggregate_loss_pct: @default_circuit_breaker_pct,
        min_simultaneous_losers: @default_min_bots_for_trip,
        velocity_pct: @default_velocity_pct,
        velocity_window_min: @default_velocity_window_minutes
      },
      current: %{}
    }
  end

  defp decimal_to_float(nil), do: 0.0
  defp decimal_to_float(%Decimal{} = d), do: Decimal.to_float(d)
  defp decimal_to_float(n) when is_number(n), do: n * 1.0
  defp decimal_to_float(_), do: 0.0
end
