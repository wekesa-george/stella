defmodule AdminGateway.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      AdminGatewayWeb.Telemetry,
      {DNSCluster, query: Application.get_env(:admin_gateway, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: AdminGateway.PubSub},
      # Auth: JWKS key cache and permissions cache
      AdminGateway.Auth.JWKS,
      AdminGateway.Auth.Permissions,
      # Start to serve requests, typically the last entry
      AdminGatewayWeb.Endpoint
    ]

    # See https://hexdocs.pm/elixir/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: AdminGateway.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    AdminGatewayWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
