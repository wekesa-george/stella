defmodule TradeEngine.Orchestrator.Supervisor do
  @moduledoc """
  Supervisor for all orchestrator components.
  """

  use Supervisor
  require Logger

  def start_link(init_arg) do
    Supervisor.start_link(__MODULE__, init_arg, name: __MODULE__)
  end

  @impl true
  def init(_init_arg) do
    Logger.info("🎯 Starting Orchestrator Supervisor")

    children = [
      # ⚡ Account Balance Pool
      #{TradeEngine.Orchestrator.AccountBalancePool, []},

      # ⚡ Automated Trader
      #{TradeEngine.Orchestrator.AutomatedTrader, []},

      # ⚡ Monitor (optional - if exists)
      monitor_child(),

      # ⚡ Health Check (optional - if exists)
      health_check_child()
    ]
    |> Enum.filter(&(&1 != nil))

    Supervisor.init(children, strategy: :one_for_one)
  end

  # ========== OPTIONAL CHILDREN ==========

  # Only add Monitor if the module exists
  defp monitor_child do
    if Code.ensure_loaded?(TradeEngine.Orchestrator.Monitor) do
      {TradeEngine.Orchestrator.Monitor, []}
    else
      nil
    end
  end

  # Only add HealthCheck if the module exists
  defp health_check_child do
    if Code.ensure_loaded?(TradeEngine.Orchestrator.HealthCheck) do
      {TradeEngine.Orchestrator.HealthCheck, []}
    else
      nil
    end
  end
end