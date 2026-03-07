defmodule TradeEngine.Infra.Monitor do
  @moduledoc """
  Collects BEAM and system infrastructure metrics every 4 seconds.
  Writes to :infra_metrics_cache ETS and broadcasts via PubSub
  for the InfraChannel to forward to the frontend.
  """

  use GenServer
  require Logger

  @pubsub TradeEngine.PubSub
  @ets_table :infra_metrics_cache
  @tick_interval_ms 4_000

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def get_metrics do
    case :ets.lookup(@ets_table, :current) do
      [{:current, metrics}] -> {:ok, metrics}
      [] -> {:error, :no_data}
    end
  rescue
    ArgumentError -> {:error, :not_started}
  end

  @impl true
  def init(_opts) do
    :ets.new(@ets_table, [:named_table, :set, :public, read_concurrency: true])
    Logger.info("🖥️  InfraMonitor started — collecting metrics every #{@tick_interval_ms}ms")
    Process.send_after(self(), :collect, @tick_interval_ms)
    {:ok, %{}}
  end

  @impl true
  def handle_info(:collect, state) do
    Process.send_after(self(), :collect, @tick_interval_ms)

    metrics = collect_metrics()
    :ets.insert(@ets_table, {:current, metrics})

    case Phoenix.PubSub.broadcast(@pubsub, "infra:update", {:infra_update, metrics}) do
      :ok ->
        Logger.debug("[InfraMonitor] Broadcast infra:update OK (procs=#{metrics.beam.process_count}, mem=#{metrics.beam.total_memory_mb}MB)")
      {:error, reason} ->
        Logger.warning("[InfraMonitor] Broadcast FAILED: #{inspect(reason)}")
    end

    {:noreply, state}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  defp collect_metrics do
    memory = :erlang.memory()
    {{_, io_in}, {_, io_out}} = :erlang.statistics(:io)

    %{
      beam: %{
        total_memory_mb: div(memory[:total], 1_048_576),
        process_memory_mb: div(memory[:processes], 1_048_576),
        ets_memory_mb: div(memory[:ets], 1_048_576),
        atom_memory_mb: div(memory[:atom], 1_048_576),
        process_count: :erlang.system_info(:process_count),
        process_limit: :erlang.system_info(:process_limit),
        scheduler_count: :erlang.system_info(:schedulers_online),
        run_queue: :erlang.statistics(:total_run_queue_lengths_all),
        io_input_mb: div(io_in, 1_048_576),
        io_output_mb: div(io_out, 1_048_576),
        uptime_seconds: div(:erlang.statistics(:wall_clock) |> elem(0), 1_000)
      },
      database: collect_db_metrics(),
      ets_tables: collect_ets_stats(),
      collected_at: DateTime.utc_now() |> DateTime.to_iso8601()
    }
  end

  defp collect_db_metrics do
    try do
      pool_size = Application.get_env(:trade_engine, TradeEngine.Repo)[:pool_size] || 10

      # Measure DB round-trip latency with a simple query
      {latency_us, _} = :timer.tc(fn ->
        TradeEngine.Repo.query("SELECT 1", [], timeout: 3_000)
      end)
      latency_ms = Float.round(latency_us / 1_000, 1)

      %{
        pool_size: pool_size,
        status: "connected",
        latency_ms: latency_ms
      }
    rescue
      _ -> %{pool_size: 0, status: "unknown", latency_ms: 0.0}
    end
  end

  defp collect_ets_stats do
    tables = [
      :binance_ticker_cache,
      :binance_price_cache,
      :binance_candle_cache,
      :binance_orderbook_cache,
      :bot_registry,
      :position_pnl_cache,
      :virtual_balances,
      :capital_allocations
    ]

    tables
    |> Enum.reduce(%{}, fn table, acc ->
      try do
        info = :ets.info(table)

        if info do
          Map.put(acc, table, %{
            size: info[:size],
            memory_bytes: info[:memory] * :erlang.system_info(:wordsize)
          })
        else
          acc
        end
      rescue
        _ -> acc
      end
    end)
  end
end
