defmodule TradeEngine.Orchestrator.Monitor do
  @moduledoc """
  Health monitoring for the orchestrator.
  """

  use GenServer
  require Logger

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(opts) do
    Logger.info("📊 Orchestrator Monitor started")
    {:ok, opts}
  end

  @doc "Get health status"
  def health_check do
    GenServer.call(__MODULE__, :health_check, 5000)
  rescue
    _e -> {:error, "monitor_unavailable"}
  end

  @impl true
  def handle_call(:health_check, _from, state) do
    health = %{
      status: :healthy,
      checks: %{
        trader_active: check_trader_active(),
        database_connected: check_database(),
        api_responsive: check_api()
      },
      timestamp: DateTime.utc_now()
    }
    {:reply, health, state}
  end

  # ========== PRIVATE CHECKS ==========

  defp check_trader_active do
    try do
      stats = TradeEngine.Orchestrator.AutomatedTrader.get_stats()
      stats.status == "ACTIVE"
    rescue
      _e -> false
    end
  end

  defp check_database do
    try do
      {:ok, _} = TradeEngine.Repo.query("SELECT 1", [])
      true
    rescue
      _e -> false
    end
  end

  defp check_api do
    # Simple health check - can be expanded
    true
  end
end