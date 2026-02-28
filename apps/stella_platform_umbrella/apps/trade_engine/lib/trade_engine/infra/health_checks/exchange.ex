defmodule TradeEngine.Infra.HealthChecks.Exchange do
  @moduledoc """
  Health check wrappers for exchange services.
  Translates existing ExchangeHealthMonitor data into the unified format.
  """

  require Logger

  alias TradeEngine.Exchanges.HealthMonitor
  alias TradeEngine.Exchanges.Binance.{TickerStream, KlineStream, DepthStream}

  @doc "Check Binance mainnet health via the existing ExchangeHealthMonitor."
  def check_binance do
    case HealthMonitor.get_health("binance") do
      {:ok, data} ->
        status = translate_status(data[:status] || data["status"])
        {:ok, %{status: status, message: "Binance mainnet: #{status}", details: data}}

      {:error, :not_found} ->
        {:ok, %{status: :unknown, message: "Binance health data not available", details: %{}}}

      {:error, :not_started} ->
        {:ok, %{status: :unknown, message: "ExchangeHealthMonitor not started", details: %{}}}
    end
  end

  @doc "Check Binance testnet health by aggregating stream connection statuses."
  def check_binance_testnet do
    streams = %{
      ticker: safe_status(TickerStream),
      kline: safe_status(KlineStream),
      depth: safe_status(DepthStream)
    }

    connected_count = Enum.count(streams, fn {_, s} -> s.connected end)
    total = map_size(streams)

    {status, message} =
      cond do
        connected_count == total ->
          {:healthy, "All #{total} streams connected"}

        connected_count > 0 ->
          down = total - connected_count
          {:degraded, "#{down}/#{total} streams disconnected"}

        true ->
          # All streams down — check if any process is at least alive (attempting reconnects)
          alive_count = Enum.count(streams, fn {_, s} -> s.alive end)

          if alive_count > 0 do
            failures =
              streams
              |> Enum.map(fn {_, s} -> s.reconnect_attempts end)
              |> Enum.max()

            {:down, "All streams disconnected, reconnecting (attempt #{failures})"}
          else
            {:down, "All stream processes are down"}
          end
      end

    details =
      Enum.into(streams, %{}, fn {name, s} ->
        {name, %{
          connected: s.connected,
          alive: s.alive,
          reconnect_attempts: s.reconnect_attempts,
          consecutive_failures: s.consecutive_failures,
          message_count: s.message_count
        }}
      end)

    {:ok, %{status: status, message: "Binance testnet: #{message}", details: details}}
  end

  defp safe_status(module) do
    case Process.whereis(module) do
      nil ->
        Logger.debug("[ExchangeHealth] #{inspect(module)} — process NOT registered")
        %{connected: false, alive: false, reconnect_attempts: 0, consecutive_failures: 0, message_count: 0}

      pid ->
        alive = Process.alive?(pid)
        Logger.debug("[ExchangeHealth] #{inspect(module)} — pid=#{inspect(pid)} alive=#{alive}, calling status with 2s timeout...")

        case safe_call(module, 2_000) do
          {:ok, info} ->
            Logger.debug("[ExchangeHealth] #{inspect(module)} — status OK connected=#{info[:connected]}")
            %{
              connected: info[:connected] || false,
              alive: alive,
              reconnect_attempts: info[:reconnect_attempts] || 0,
              consecutive_failures: info[:consecutive_failures] || 0,
              message_count: info[:message_count] || 0
            }

          :timeout ->
            Logger.warning("[ExchangeHealth] #{inspect(module)} — TIMEOUT after 2s (process stuck in network call?)")
            %{connected: false, alive: alive, reconnect_attempts: 0, consecutive_failures: 0, message_count: 0}
        end
    end
  end

  defp safe_call(module, timeout) do
    task = Task.async(fn -> module.status() end)

    case Task.yield(task, timeout) || Task.shutdown(task, :brutal_kill) do
      {:ok, {:ok, info}} -> {:ok, info}
      other ->
        Logger.debug("[ExchangeHealth] safe_call #{inspect(module)} returned: #{inspect(other, limit: 200)}")
        :timeout
    end
  end

  defp translate_status("healthy"), do: :healthy
  defp translate_status("degraded"), do: :degraded
  defp translate_status("disconnected"), do: :down
  defp translate_status(_), do: :unknown
end
