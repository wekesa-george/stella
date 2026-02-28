defmodule TradeEngine.API.Router do
  @moduledoc """
  🔌 API ROUTER

  Sets up the API endpoint for TradeEngine.
  This runs as a separate endpoint (default port 4002) so it doesn't
  interfere with the existing sys_admin_web (port 4001) or
  trade_engine_web (port 4000).

  ## Setup

  Add to your application.ex children:

      {Bandit, plug: TradeEngine.API.Router, port: 4002}

  Or if using Plug.Cowboy:

      {Plug.Cowboy, scheme: :http, plug: TradeEngine.API.Router, port: 4002}

  ## Alternative: Mount in existing Phoenix router

  If you'd rather mount this in the sys_admin_web router:

      # In sys_admin_web/router.ex
      forward "/api", TradeEngine.API.Controller

  """

  use Plug.Router
  require Logger

  # CORS support for dashboard
  plug Plug.Logger, log: :debug
  plug :put_cors_headers
  plug :match
  plug Plug.Parsers,
    parsers: [:json, :urlencoded],
    pass: ["application/json", "text/*"],
    json_decoder: Jason
  plug :dispatch

  # Forward all routes to the controller (controller defines /api/* paths)
  forward "/", to: TradeEngine.API.Controller

  defp put_cors_headers(conn, _opts) do
    conn
    |> put_resp_header("access-control-allow-origin", "*")
    |> put_resp_header("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS")
    |> put_resp_header("access-control-allow-headers", "content-type, authorization")
  end
end
