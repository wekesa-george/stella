defmodule TradeEngine.Bots.BotSupervisor do
  @moduledoc """
  DynamicSupervisor managing per-bot BotTradingProcess children.
  Started in the supervision tree before BotRegistry.
  """

  use DynamicSupervisor
  require Logger

  alias TradeEngine.Bots.BotTradingProcess

  def start_link(opts \\ []) do
    DynamicSupervisor.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    DynamicSupervisor.init(strategy: :one_for_one, max_restarts: 10, max_seconds: 60)
  end

  @doc "Start a trading process for a bot"
  def start_trading_process(bot_id) do
    child_spec = {BotTradingProcess, bot_id: bot_id}
    DynamicSupervisor.start_child(__MODULE__, child_spec)
  end

  @doc "Stop a trading process for a bot"
  def stop_trading_process(bot_id) do
    case find_process(bot_id) do
      nil ->
        Logger.debug("No trading process found for bot #{bot_id}")
        :ok

      pid ->
        DynamicSupervisor.terminate_child(__MODULE__, pid)
    end
  end

  @doc "Find the pid of a bot's trading process"
  def find_process(bot_id) do
    DynamicSupervisor.which_children(__MODULE__)
    |> Enum.find_value(fn {_, pid, _, _} ->
      if is_pid(pid) and Process.alive?(pid) do
        case GenServer.call(pid, :get_bot_id, 5_000) do
          ^bot_id -> pid
          _ -> nil
        end
      end
    end)
  rescue
    _ -> nil
  end

  @doc "List all running trading processes"
  def which_children do
    DynamicSupervisor.which_children(__MODULE__)
  rescue
    _ -> []
  end
end
