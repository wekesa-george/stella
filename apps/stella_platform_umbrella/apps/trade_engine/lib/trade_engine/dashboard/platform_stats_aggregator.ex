defmodule TradeEngine.Dashboard.PlatformStatsAggregator do
  @moduledoc """
  Aggregates platform-wide statistics every 60 seconds.
  Queries DB for totals, reads ETS for live data, writes to
  :platform_stats_cache and broadcasts for PlatformChannel.
  """

  use GenServer
  require Logger
  import Ecto.Query

  alias TradeEngine.Repo
  alias TradeEngine.Trading.{Position, Order}
  alias TradeEngine.Bots.Bot

  @pubsub TradeEngine.PubSub
  @ets_table :platform_stats_cache
  @tick_interval_ms 60_000

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def get_stats do
    case :ets.lookup(@ets_table, :current) do
      [{:current, stats}] -> {:ok, stats}
      [] -> {:error, :no_data}
    end
  rescue
    ArgumentError -> {:error, :not_started}
  end

  @impl true
  def init(_opts) do
    :ets.new(@ets_table, [:named_table, :set, :public, read_concurrency: true])
    Logger.info("📊 PlatformStatsAggregator started — aggregating every #{div(@tick_interval_ms, 1000)}s")
    Process.send_after(self(), :aggregate, 5_000)
    {:ok, %{}}
  end

  @impl true
  def handle_info(:aggregate, state) do
    Process.send_after(self(), :aggregate, @tick_interval_ms)

    stats = aggregate_stats()
    :ets.insert(@ets_table, {:current, stats})
    Phoenix.PubSub.broadcast(@pubsub, "platform:stats_update", {:platform_stats_update, stats})

    {:noreply, state}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  defp aggregate_stats do
    %{
      bots: bot_stats(),
      positions: position_stats(),
      orders: order_stats(),
      pnl: pnl_stats(),
      collected_at: DateTime.utc_now() |> DateTime.to_iso8601()
    }
  rescue
    e ->
      Logger.warning("PlatformStatsAggregator error: #{Exception.message(e)}")
      %{error: Exception.message(e), collected_at: DateTime.utc_now() |> DateTime.to_iso8601()}
  end

  defp bot_stats do
    total = Repo.aggregate(Bot, :count, :id, timeout: 5_000) || 0
    running = Repo.one(from(b in Bot, where: b.status == "running", select: count(b.id)), timeout: 5_000) || 0
    paused = Repo.one(from(b in Bot, where: b.status == "paused", select: count(b.id)), timeout: 5_000) || 0
    errored = Repo.one(from(b in Bot, where: b.status == "error", select: count(b.id)), timeout: 5_000) || 0

    %{total: total, running: running, paused: paused, errored: errored, stopped: total - running - paused - errored}
  rescue
    _ -> %{total: 0, running: 0, paused: 0, errored: 0, stopped: 0}
  end

  defp position_stats do
    today_start = NaiveDateTime.utc_now() |> NaiveDateTime.beginning_of_day()
    open = Repo.one(from(p in Position, where: p.status == "open", select: count(p.id)), timeout: 5_000) || 0
    closed_today = Repo.one(
      from(p in Position,
        where: p.status == "closed" and p.exit_time >= ^today_start,
        select: count(p.id)
      ),
      timeout: 5_000
    ) || 0
    total = Repo.aggregate(Position, :count, :id, timeout: 5_000) || 0

    %{open: open, closed_today: closed_today, total: total}
  rescue
    _ -> %{open: 0, closed_today: 0, total: 0}
  end

  defp order_stats do
    today_start = NaiveDateTime.utc_now() |> NaiveDateTime.beginning_of_day()
    pending = Repo.one(from(o in Order, where: o.status == "pending", select: count(o.id)), timeout: 5_000) || 0
    filled_today = Repo.one(
      from(o in Order,
        where: o.status == "filled" and o.execution_time >= ^today_start,
        select: count(o.id)
      ),
      timeout: 5_000
    ) || 0

    %{pending: pending, filled_today: filled_today}
  rescue
    _ -> %{pending: 0, filled_today: 0}
  end

  defp pnl_stats do
    today_start = NaiveDateTime.utc_now() |> NaiveDateTime.beginning_of_day()

    realized_today =
      Repo.one(
        from(p in Position,
          where: p.status == "closed" and p.exit_time >= ^today_start,
          select: sum(p.profit_loss)
        ),
        timeout: 5_000
      )

    total_realized =
      Repo.one(
        from(p in Position,
          where: p.status == "closed",
          select: sum(p.profit_loss)
        ),
        timeout: 5_000
      )

    %{
      realized_today: decimal_to_float(realized_today),
      total_realized: decimal_to_float(total_realized)
    }
  rescue
    _ -> %{realized_today: 0.0, total_realized: 0.0}
  end

  defp decimal_to_float(nil), do: 0.0
  defp decimal_to_float(%Decimal{} = d), do: Decimal.to_float(d)
  defp decimal_to_float(n) when is_number(n), do: n * 1.0
  defp decimal_to_float(_), do: 0.0
end
