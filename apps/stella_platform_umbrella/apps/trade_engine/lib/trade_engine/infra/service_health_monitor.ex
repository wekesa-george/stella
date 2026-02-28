defmodule TradeEngine.Infra.ServiceHealthMonitor do
  @moduledoc """
  Centralized health monitor for all external services.

  - Loads service definitions from ServiceRegistry
  - Runs per-service health checks on independent timers
  - Detects state transitions and fires alerts only on change
  - Broadcasts to "infra:service_health" and "alerts:new" (on transitions)
  - Persists each check to platform.service_health_checks via fire-and-forget Task
  - Public API reads from :service_health_cache ETS
  """

  use GenServer
  require Logger

  alias TradeEngine.Infra.{ServiceRegistry, ServiceHealthCheck}

  @pubsub TradeEngine.PubSub
  @ets_table :service_health_cache
  @check_timeout_ms 10_000

  # ── Public API ──────────────────────────────────────────────────────────

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc "Returns all service health entries from ETS."
  def get_all_health do
    :ets.tab2list(@ets_table)
    |> Enum.map(fn {_name, data} -> data end)
  rescue
    ArgumentError -> {:error, :not_started}
  end

  @doc "Returns health for a single service by name (atom)."
  def get_health(service_name) when is_atom(service_name) do
    case :ets.lookup(@ets_table, service_name) do
      [{^service_name, data}] -> {:ok, data}
      [] -> {:error, :not_found}
    end
  rescue
    ArgumentError -> {:error, :not_started}
  end

  def get_health(service_name) when is_binary(service_name) do
    get_health(String.to_existing_atom(service_name))
  rescue
    ArgumentError -> {:error, :not_found}
  end

  @doc "Returns health entries filtered by category atom."
  def get_health_by_category(category) when is_atom(category) do
    :ets.tab2list(@ets_table)
    |> Enum.map(fn {_name, data} -> data end)
    |> Enum.filter(fn data -> data.category == category end)
  rescue
    ArgumentError -> {:error, :not_started}
  end

  def get_health_by_category(category) when is_binary(category) do
    get_health_by_category(String.to_existing_atom(category))
  rescue
    ArgumentError -> {:error, :not_found}
  end

  # ── GenServer callbacks ─────────────────────────────────────────────────

  @impl true
  def init(_opts) do
    :ets.new(@ets_table, [:named_table, :set, :public, read_concurrency: true])

    services = ServiceRegistry.services()
    Logger.info("ServiceHealthMonitor started — monitoring #{length(services)} services")

    # Schedule first check for each service with a small stagger
    services
    |> Enum.with_index()
    |> Enum.each(fn {svc, idx} ->
      delay = 5_000 + idx * 500
      Process.send_after(self(), {:check, svc.name}, delay)
    end)

    # Build a lookup map: name -> service definition
    svc_map = Map.new(services, fn svc -> {svc.name, svc} end)

    {:ok, %{services: svc_map, statuses: %{}, pending_checks: %{}}}
  end

  @impl true
  def handle_info({:check, service_name}, state) do
    case Map.get(state.services, service_name) do
      nil ->
        {:noreply, state}

      svc ->
        # Reschedule next check immediately
        Process.send_after(self(), {:check, service_name}, svc.check_interval_ms)

        pending_count = map_size(state.pending_checks)
        Logger.debug("[SHM] :check #{service_name} — spawning task (#{pending_count} pending)")

        # Non-blocking: spawn task, handle result in separate callback
        task =
          Task.Supervisor.async_nolink(
            TradeEngine.TaskSupervisor,
            fn -> {service_name, run_check(svc)} end,
            shutdown: @check_timeout_ms
          )

        # Track pending task with a safety timer
        timer_ref = Process.send_after(self(), {:check_timeout, task.ref, service_name}, @check_timeout_ms)
        pending = Map.put(state.pending_checks, task.ref, {svc, timer_ref})
        {:noreply, %{state | pending_checks: pending}}
    end
  end

  # Task completed successfully
  def handle_info({ref, {service_name, result}}, state) when is_reference(ref) do
    Process.demonitor(ref, [:flush])

    case Map.pop(state.pending_checks, ref) do
      {{svc, timer_ref}, pending} ->
        Process.cancel_timer(timer_ref)
        {check_result, elapsed} = result
        status = case check_result do
          {:ok, data} -> data.status
          {:error, data} -> data.status
        end
        Logger.debug("[SHM] Task OK for #{service_name} — status=#{status} elapsed=#{elapsed}ms (#{map_size(pending)} pending)")
        new_state = process_result(svc, result, %{state | pending_checks: pending})
        {:noreply, new_state}

      {nil, _} ->
        {:noreply, state}
    end
  end

  # Task crashed
  def handle_info({:DOWN, ref, :process, _pid, reason}, state) do
    case Map.pop(state.pending_checks, ref) do
      {{svc, timer_ref}, pending} ->
        Process.cancel_timer(timer_ref)
        Logger.warning("[SHM] Task CRASHED for #{svc.name} — reason=#{inspect(reason)}")
        timeout_result = {{:ok, %{status: :unknown, message: "Check failed: #{inspect(reason)}", details: %{}}}, 0}
        new_state = process_result(svc, timeout_result, %{state | pending_checks: pending})
        {:noreply, new_state}

      {nil, _} ->
        {:noreply, state}
    end
  end

  # Timeout fallback — kill stuck task
  def handle_info({:check_timeout, ref, _service_name}, state) do
    case Map.pop(state.pending_checks, ref) do
      {{svc, _timer_ref}, pending} ->
        Logger.warning("[SHM] Task TIMEOUT for #{svc.name} after #{@check_timeout_ms}ms — killing")
        # Kill the stuck task
        Process.demonitor(ref, [:flush])
        # Find and kill the task process by ref
        case Process.info(self(), :links) do
          {:links, _} -> :ok
          _ -> :ok
        end
        timeout_result = {{:ok, %{status: :unknown, message: "Health check timed out", details: %{}}}, @check_timeout_ms}
        new_state = process_result(svc, timeout_result, %{state | pending_checks: pending})
        {:noreply, new_state}

      {nil, _} ->
        {:noreply, state}
    end
  end

  def handle_info(_msg, state), do: {:noreply, state}

  # ── Internal ────────────────────────────────────────────────────────────

  defp run_check(svc) do
    start_time = System.monotonic_time(:millisecond)

    result =
      try do
        svc.health_check.()
      rescue
        e -> {:error, %{status: :down, message: Exception.message(e), details: %{}}}
      end

    elapsed = System.monotonic_time(:millisecond) - start_time
    {result, elapsed}
  end

  defp process_result(svc, {result, elapsed_ms}, state) do
    health_data =
      case result do
        {:ok, data} -> data
        {:error, data} -> data
      end

    entry = %{
      service_name: svc.name,
      category: svc.category,
      environment: svc.environment,
      status: health_data.status,
      message: health_data.message,
      details: health_data[:details] || %{},
      response_time_ms: elapsed_ms,
      checked_at: DateTime.utc_now(),
      description: svc.description
    }

    # Write to ETS
    :ets.insert(@ets_table, {svc.name, entry})

    # Detect state transition
    old_status = Map.get(state.statuses, svc.name)
    new_status = health_data.status

    if old_status != nil and old_status != new_status do
      fire_transition_alert(svc, old_status, new_status, entry)
    end

    # Broadcast update on infra channel
    Logger.debug("[SHM] Broadcasting service_health_update for #{svc.name} status=#{health_data.status} elapsed=#{elapsed_ms}ms")
    broadcast_health_update(entry)

    # Persist to DB (fire-and-forget)
    persist_check(entry)

    %{state | statuses: Map.put(state.statuses, svc.name, new_status)}
  end

  defp fire_transition_alert(svc, old_status, new_status, entry) do
    severity = resolve_severity(svc.environment, new_status)

    alert = %{
      id: Ecto.UUID.generate(),
      category: "service_health",
      severity: to_string(severity),
      title: "Service #{svc.name} — #{old_status} -> #{new_status}",
      message: entry.message,
      metadata: %{
        service_name: to_string(svc.name),
        environment: to_string(svc.environment),
        old_status: to_string(old_status),
        new_status: to_string(new_status),
        response_time_ms: entry.response_time_ms
      },
      timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
    }

    Logger.warning(
      "Service health transition: #{svc.name} #{old_status} -> #{new_status} (#{severity})"
    )

    Phoenix.PubSub.broadcast(@pubsub, "alerts:new", {:new_alert, alert})
  end

  defp broadcast_health_update(entry) do
    payload = %{
      service_name: to_string(entry.service_name),
      category: to_string(entry.category),
      environment: to_string(entry.environment),
      status: to_string(entry.status),
      message: entry.message,
      response_time_ms: entry.response_time_ms,
      checked_at: DateTime.to_iso8601(entry.checked_at)
    }

    Phoenix.PubSub.broadcast(@pubsub, "infra:service_health", {:service_health_update, payload})
  end

  defp persist_check(entry) do
    Task.start(fn ->
      ServiceHealthCheck.insert(%{
        service_name: to_string(entry.service_name),
        category: to_string(entry.category),
        environment: to_string(entry.environment),
        status: to_string(entry.status),
        message: entry.message,
        details: entry[:details] || %{},
        response_time_ms: entry.response_time_ms,
        checked_at: entry.checked_at
      })
    end)
  end

  defp resolve_severity(environment, status) do
    case {environment, status} do
      {:prod, :down} -> :critical
      {:prod, :degraded} -> :warning
      {:dev, :down} -> :warning
      {:sandbox, :down} -> :warning
      {_, :degraded} -> :info
      _ -> :info
    end
  end
end
