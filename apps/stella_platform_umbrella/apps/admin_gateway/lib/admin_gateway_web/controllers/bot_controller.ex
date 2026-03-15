defmodule AdminGatewayWeb.BotController do
  use AdminGatewayWeb, :controller

  alias TradeEngine.Bots.BotRegistry

  @doc "NUCLEAR: Kill all running bot processes and set every bot to stopped"
  def kill_all(conn, _params) do
    case BotRegistry.kill_all_bots() do
      {:ok, killed} ->
        json(conn, %{
          status: "ok",
          killed_count: length(killed),
          bots: killed
        })

      {:error, reason} ->
        conn
        |> put_status(500)
        |> json(%{status: "error", reason: inspect(reason)})
    end
  end

  @doc "Get current sync routine anomalies"
  def sync_anomalies(conn, _params) do
    anomalies = TradeEngine.Trading.SyncRoutine.get_anomalies()
    json(conn, %{
      anomalies: anomalies,
      count: map_size(anomalies)
    })
  end

  @doc "Stop a single bot"
  def stop(conn, %{"id" => bot_id}) do
    case BotRegistry.stop_bot(bot_id) do
      {:ok, _} ->
        json(conn, %{status: "stopped", bot_id: bot_id})

      {:error, reason} ->
        conn
        |> put_status(422)
        |> json(%{status: "error", reason: inspect(reason)})
    end
  end
end
