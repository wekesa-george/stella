defmodule TradeEngine.Strategies.BacktestManager do
  @moduledoc """
  Manages backtest lifecycle: queuing, dispatching to VectorBT worker,
  writing results back to DB, and handling timeouts.

  ## Ticks
  - `:process_queue` every 5s — dequeue next run, dispatch to worker
  - `:check_timeouts` every 60s — cancel stuck runs (>10 min)
  """

  use GenServer
  require Logger

  alias TradeEngine.Strategies.Backtests

  @pubsub TradeEngine.PubSub
  @queue_interval_ms 5_000
  @timeout_check_ms 60_000
  @default_max_concurrent 3
  @default_timeout_ms 600_000  # 10 minutes

  # ============================================================================
  # PUBLIC API
  # ============================================================================

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc "Queue a new backtest run"
  def queue_backtest(strategy_id, user_id, config) do
    GenServer.call(__MODULE__, {:queue, strategy_id, user_id, config})
  end

  @doc "Get current manager stats"
  def stats do
    GenServer.call(__MODULE__, :stats)
  end

  # ============================================================================
  # GENSERVER CALLBACKS
  # ============================================================================

  @impl true
  def init(_opts) do
    schedule_queue()
    schedule_timeout_check()

    config = Application.get_env(:trade_engine, :vectorbt, [])

    Logger.info("🧪 BacktestManager started — worker_url: #{worker_url(config)}, max_concurrent: #{max_concurrent(config)}")

    {:ok, %{
      active: %{},       # %{backtest_id => %{started_at: DateTime, task_ref: ref}}
      total_queued: 0,
      total_completed: 0,
      total_failed: 0,
      config: config
    }}
  end

  @impl true
  def handle_call({:queue, strategy_id, user_id, config}, _from, state) do
    case Backtests.create(strategy_id, user_id, config) do
      {:ok, run} ->
        Logger.info("🧪 Backtest queued: #{run.id} (#{run.trading_pair} #{run.timeframe})")
        state = %{state | total_queued: state.total_queued + 1}
        {:reply, {:ok, run}, state}

      {:error, _} = error ->
        {:reply, error, state}
    end
  end

  def handle_call(:stats, _from, state) do
    stats = %{
      active_count: map_size(state.active),
      total_queued: state.total_queued,
      total_completed: state.total_completed,
      total_failed: state.total_failed,
      active_ids: Map.keys(state.active)
    }
    {:reply, stats, state}
  end

  @impl true
  def handle_info(:process_queue, state) do
    schedule_queue()
    state = maybe_dispatch(state)
    {:noreply, state}
  end

  def handle_info(:check_timeouts, state) do
    schedule_timeout_check()
    state = check_timeouts(state)
    {:noreply, state}
  end

  def handle_info({ref, {:ok, result}}, state) when is_reference(ref) do
    # Task completed successfully
    Process.demonitor(ref, [:flush])
    state = handle_worker_result(state, ref, result)
    {:noreply, state}
  end

  def handle_info({ref, {:error, reason}}, state) when is_reference(ref) do
    # Task failed
    Process.demonitor(ref, [:flush])
    state = handle_worker_error(state, ref, reason)
    {:noreply, state}
  end

  def handle_info({:DOWN, ref, :process, _pid, reason}, state) do
    # Task process crashed
    state = handle_worker_error(state, ref, "Worker process crashed: #{inspect(reason)}")
    {:noreply, state}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  # ============================================================================
  # PRIVATE — DISPATCH
  # ============================================================================

  defp maybe_dispatch(state) do
    max = max_concurrent(state.config)

    if map_size(state.active) >= max do
      state
    else
      # Fetch next queued run
      case Backtests.list(%{status: "queued", limit: 1}) do
        [run | _] -> dispatch_run(state, run)
        [] -> state
      end
    end
  end

  defp dispatch_run(state, run) do
    Logger.info("🧪 Dispatching backtest #{run.id} to VectorBT worker")

    # Mark as running
    Backtests.update_progress(run.id, Decimal.new(0), 0)

    # Dispatch via async Task
    task =
      Task.Supervisor.async_nolink(TradeEngine.TaskSupervisor, fn ->
        call_worker(run, state.config)
      end)

    active_entry = %{
      backtest_id: run.id,
      started_at: DateTime.utc_now(),
      task_ref: task.ref
    }

    %{state | active: Map.put(state.active, task.ref, active_entry)}
  end

  defp call_worker(run, config) do
    url = worker_url(config)
    timeout = Keyword.get(config, :timeout_ms, @default_timeout_ms)

    payload = %{
      backtest_id: run.id,
      strategy_type: get_strategy_type(run),
      trading_pair: run.trading_pair,
      exchange_code: run.exchange_code,
      timeframe: run.timeframe,
      start_date: DateTime.to_iso8601(run.start_date),
      end_date: DateTime.to_iso8601(run.end_date),
      initial_capital_usd: Decimal.to_float(run.initial_capital_usd),
      config_snapshot: run.config_snapshot || %{}
    }

    case Req.post("#{url}/run",
           json: payload,
           receive_timeout: timeout,
           connect_timeout: 10_000
         ) do
      {:ok, %{status: 200, body: body}} ->
        {:ok, body}

      {:ok, %{status: status, body: body}} ->
        {:error, "Worker returned #{status}: #{inspect(body)}"}

      {:error, reason} ->
        {:error, "Worker request failed: #{inspect(reason)}"}
    end
  end

  # ============================================================================
  # PRIVATE — RESULT HANDLING
  # ============================================================================

  defp handle_worker_result(state, ref, result) do
    case Map.pop(state.active, ref) do
      {nil, _} ->
        state

      {entry, active} ->
        backtest_id = entry.backtest_id

        case result do
          %{"status" => "completed"} ->
            write_completed_results(backtest_id, result)
            broadcast_completion(backtest_id, "completed")
            Logger.info("🧪 Backtest #{backtest_id} completed: #{result["total_return_pct"]}% return")
            %{state | active: active, total_completed: state.total_completed + 1}

          %{"status" => "failed"} ->
            error_msg = result["error_message"] || "Unknown error"
            write_failed_result(backtest_id, error_msg)
            broadcast_completion(backtest_id, "failed")
            Logger.warning("🧪 Backtest #{backtest_id} failed: #{error_msg}")
            %{state | active: active, total_failed: state.total_failed + 1}

          _ ->
            write_failed_result(backtest_id, "Unexpected response format")
            %{state | active: active, total_failed: state.total_failed + 1}
        end
    end
  end

  defp handle_worker_error(state, ref, reason) do
    case Map.pop(state.active, ref) do
      {nil, _} ->
        state

      {entry, active} ->
        error_msg = if is_binary(reason), do: reason, else: inspect(reason)
        write_failed_result(entry.backtest_id, error_msg)
        broadcast_completion(entry.backtest_id, "failed")
        Logger.error("🧪 Backtest #{entry.backtest_id} error: #{error_msg}")
        %{state | active: active, total_failed: state.total_failed + 1}
    end
  end

  defp write_completed_results(backtest_id, result) do
    attrs = %{
      status: "completed",
      completed_at: DateTime.utc_now(),
      final_capital_usd: result["final_capital_usd"],
      total_return_pct: result["total_return_pct"],
      max_drawdown_pct: result["max_drawdown_pct"],
      sharpe_ratio: result["sharpe_ratio"],
      sortino_ratio: result["sortino_ratio"],
      calmar_ratio: result["calmar_ratio"],
      win_rate: result["win_rate"],
      profit_factor: result["profit_factor"],
      total_trades: result["total_trades"],
      winning_trades: result["winning_trades"],
      losing_trades: result["losing_trades"],
      avg_trade_return_pct: result["avg_trade_return_pct"],
      avg_win_pct: result["avg_win_pct"],
      avg_loss_pct: result["avg_loss_pct"],
      largest_win_usd: result["largest_win_usd"],
      largest_loss_usd: result["largest_loss_usd"],
      avg_hold_duration_sec: result["avg_hold_duration_sec"],
      equity_curve: result["equity_curve"],
      trade_log: result["trade_log"],
      execution_time_ms: result["execution_time_ms"]
    }

    Backtests.update_status(backtest_id, "completed", attrs)
  end

  defp write_failed_result(backtest_id, error_message) do
    Backtests.update_status(backtest_id, "failed", %{
      error_message: error_message,
      completed_at: DateTime.utc_now()
    })
  end

  # ============================================================================
  # PRIVATE — TIMEOUTS
  # ============================================================================

  defp check_timeouts(state) do
    timeout_ms = Keyword.get(state.config, :timeout_ms, @default_timeout_ms)
    now = DateTime.utc_now()

    expired =
      Enum.filter(state.active, fn {_ref, entry} ->
        diff_ms = DateTime.diff(now, entry.started_at, :millisecond)
        diff_ms > timeout_ms
      end)

    Enum.reduce(expired, state, fn {ref, entry}, acc ->
      Logger.warning("🧪 Backtest #{entry.backtest_id} timed out after #{timeout_ms}ms")
      Backtests.cancel(entry.backtest_id)
      broadcast_completion(entry.backtest_id, "cancelled")
      %{acc | active: Map.delete(acc.active, ref), total_failed: acc.total_failed + 1}
    end)
  end

  # ============================================================================
  # PRIVATE — HELPERS
  # ============================================================================

  defp get_strategy_type(run) do
    case run.config_snapshot do
      %{"type" => type} -> type
      %{type: type} -> type
      _ -> "core_momentum"
    end
  end

  defp broadcast_completion(backtest_id, status) do
    Phoenix.PubSub.broadcast(
      @pubsub,
      "backtest:#{backtest_id}",
      {:backtest_update, %{id: backtest_id, status: status}}
    )
  end

  defp worker_url(config), do: Keyword.get(config, :worker_url, "http://localhost:8100")
  defp max_concurrent(config), do: Keyword.get(config, :max_concurrent, @default_max_concurrent)

  defp schedule_queue, do: Process.send_after(self(), :process_queue, @queue_interval_ms)
  defp schedule_timeout_check, do: Process.send_after(self(), :check_timeouts, @timeout_check_ms)
end
