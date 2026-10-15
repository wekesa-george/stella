defmodule StellaAdmin.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    # Get configured trading pairs from application config
    trading_pairs =
      Application.get_env(:stella_admin, :binance_trading_pairs, [
        "BTC/USDT",
        "ETH/USDT",
        "SOL/USDT",
        "AVAX/USDT",
        "MATIC/USDT"
      ])

    children = [
      StellaAdminWeb.Telemetry,
      StellaAdmin.Repo,
      {DNSCluster, query: Application.get_env(:stella_admin, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: StellaAdmin.PubSub},
      # Binance market data services
      StellaAdmin.Binance.Cache,
      {StellaAdmin.Binance.WebSocket, pairs: trading_pairs},
      # Start to serve requests, typically the last entry
      StellaAdminWeb.Endpoint
    ]

    # See https://hexdocs.pm/elixir/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: StellaAdmin.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    StellaAdminWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
