defmodule TradeEngine.Bots.BotLogPersister do
  @moduledoc """
  GenServer that subscribes to bot log PubSub events and batch-inserts
  them into `trading.bot_logs` on a timer or when the buffer exceeds
  a threshold.

  Also runs daily cleanup of logs older than 30 days.
  """

  use GenServer
  require Logger

  alias TradeEngine.Bots.BotLog

  @pubsub TradeEngine.PubSub
  @flush_interval_ms 5_000
  @max_buffer_size 100
  @cleanup_interval_ms 24 * 60 * 60 * 1_000
  @retention_days 30

  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    Phoenix.PubSub.subscribe(@pubsub, "bot_logs")
    schedule_flush()
    schedule_cleanup()
    Logger.info("[BotLogPersister] Started — subscribed to bot_logs")
    {:ok, %{buffer: []}}
  end

  @impl true
  def handle_info({:bot_log, entry}, %{buffer: buffer} = state) do
    new_buffer = [entry | buffer]

    if length(new_buffer) >= @max_buffer_size do
      flush(new_buffer)
      {:noreply, %{state | buffer: []}}
    else
      {:noreply, %{state | buffer: new_buffer}}
    end
  end

  def handle_info(:flush, %{buffer: buffer} = state) do
    flush(buffer)
    schedule_flush()
    {:noreply, %{state | buffer: []}}
  end

  def handle_info(:cleanup, state) do
    Task.start(fn ->
      case BotLog.cleanup(@retention_days) do
        {count, _} when count > 0 ->
          Logger.info("[BotLogPersister] Cleaned up #{count} logs older than #{@retention_days}d")
        _ ->
          :ok
      end
    end)

    schedule_cleanup()
    {:noreply, state}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  # -- Private --

  defp flush([]), do: :ok

  defp flush(entries) do
    Task.start(fn ->
      case BotLog.insert_batch(entries) do
        {count, _} ->
          Logger.debug("[BotLogPersister] Persisted #{count} bot log entries")
        error ->
          Logger.warning("[BotLogPersister] Failed to persist bot logs: #{inspect(error)}")
      end
    end)
  end

  defp schedule_flush, do: Process.send_after(self(), :flush, @flush_interval_ms)
  defp schedule_cleanup, do: Process.send_after(self(), :cleanup, @cleanup_interval_ms)
end
