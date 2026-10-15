defmodule AdminGatewayWeb.UserSocket do
  use Phoenix.Socket

  require Logger

  alias AdminGateway.Auth.Token
  alias AdminGateway.Auth.Permissions

  # Channel routes
  channel "bot:*", AdminGatewayWeb.BotChannel
  channel "positions:*", AdminGatewayWeb.PositionChannel
  channel "orders:*", AdminGatewayWeb.OrderChannel
  channel "market_data:*", AdminGatewayWeb.MarketDataChannel
  channel "infra:*", AdminGatewayWeb.InfraChannel
  channel "platform:*", AdminGatewayWeb.PlatformChannel
  channel "alerts:*", AdminGatewayWeb.AlertChannel

  @impl true
  def connect(%{"token" => token}, socket, _connect_info) do
    Logger.info("UserSocket: connect with token (#{String.length(token)} chars)")

    with {:ok, claims} <- Token.verify(token),
         logto_user_id <- Map.get(claims, "sub"),
         {:ok, admin} <- Permissions.get_admin(logto_user_id),
         "active" <- admin.status do
      Logger.info("UserSocket: authenticated as #{inspect(admin.id)}")

      socket =
        socket
        |> assign(:admin_user, admin)
        |> assign(:user_id, admin.id)
        |> assign(:permissions, admin.permissions)

      {:ok, socket}
    else
      error ->
        Logger.error("UserSocket: auth failed — #{inspect(error)}")
        :error
    end
  end

  # Allow anonymous connections in dev (no token required)
  @env Mix.env()
  def connect(_params, socket, _connect_info) do
    if @env == :prod do
      Logger.warning("UserSocket: anonymous connection rejected in prod")
      :error
    else
      Logger.info("UserSocket: anonymous dev connection accepted")
      {:ok, assign(socket, :user_id, "dev-user")}
    end
  end

  @impl true
  def id(socket) do
    uid = socket.assigns.user_id
    id_str = if is_binary(uid) and not String.valid?(uid), do: Base.encode16(uid, case: :lower), else: to_string(uid)
    "user_socket:#{id_str}"
  end
end
