defmodule TradeEngine.Bots.HeartbeatTracker do
  @moduledoc """
  Tracks bot heartbeats and detects stale/unresponsive bots.
  Reads from :bot_registry ETS every 5 seconds, marks bots as stale
  if their last heartbeat exceeds the timeout threshold.
  """

  use GenServer
  require Logger

  @pubsub TradeEngine.PubSub
  @ets_table :bot_heartbeat_cache
  @tick_interval_ms 5_000
  @stale_threshold_s 30

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def get_status(bot_id) do
    case :ets.lookup(@ets_table, bot_id) do
      [{^bot_id, data}] -> {:ok, data}
      [] -> {:error, :not_found}
    end
  rescue
    ArgumentError -> {:error, :not_started}
  end

  @impl true
  def init(_opts) do
    :ets.new(@ets_table, [:named_table, :set, :public, read_concurrency: true])
    Logger.info("💓 HeartbeatTracker started — checking every #{div(@tick_interval_ms, 1000)}s")
    Process.send_after(self(), :check, @tick_interval_ms)
    {:ok, %{stale_bots: MapSet.new()}}
  end

  @impl true
  def handle_info(:check, state) do
    Process.send_after(self(), :check, @tick_interval_ms)

    now = DateTime.utc_now()
    bots = list_registry_bots()
    new_stale = MapSet.new()

    new_stale =
      Enum.reduce(bots, new_stale, fn bot, acc ->
        bot_id = Map.get(bot, :bot_id) || Map.get(bot, :id)
        last_hb = Map.get(bot, :last_heartbeat)
        stale? = is_stale?(last_hb, now)

        :ets.insert(@ets_table, {bot_id, %{
          bot_id: bot_id,
          status: Map.get(bot, :status),
          last_heartbeat: last_hb,
          stale: stale?,
          checked_at: now
        }})

        if stale? and Map.get(bot, :status) == "running" do
          MapSet.put(acc, bot_id)
        else
          acc
        end
      end)

    # Broadcast newly stale bots
    newly_stale = MapSet.difference(new_stale, state.stale_bots)

    Enum.each(newly_stale, fn bot_id ->
      Logger.warning("⚠️  Bot #{bot_id} is stale (no heartbeat for #{@stale_threshold_s}s)")

      Phoenix.PubSub.broadcast(@pubsub, "bots:updates",
        {:bot_error, bot_id, "Heartbeat timeout — bot may be unresponsive"}
      )
    end)

    {:noreply, %{state | stale_bots: new_stale}}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  defp list_registry_bots do
    :ets.tab2list(:bot_registry)
    |> Enum.map(fn {_id, runtime} -> runtime end)
  rescue
    _ -> []
  end

  defp is_stale?(nil, _now), do: true

  defp is_stale?(last_heartbeat, now) do
    case DateTime.diff(now, last_heartbeat, :second) do
      diff when diff >= @stale_threshold_s -> true
      _ -> false
    end
  rescue
    _ -> true
  end
end
