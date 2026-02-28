defmodule AdminGatewayWeb.HealthController do
  use AdminGatewayWeb, :controller

  def index(conn, _params) do
    json(conn, %{status: "ok", service: "admin_gateway"})
  end
end
