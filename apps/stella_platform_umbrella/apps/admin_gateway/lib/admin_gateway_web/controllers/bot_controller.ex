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
end
