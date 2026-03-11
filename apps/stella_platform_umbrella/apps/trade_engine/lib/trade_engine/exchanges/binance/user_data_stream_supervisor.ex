defmodule TradeEngine.Exchanges.Binance.UserDataStreamSupervisor do
  @moduledoc """
  DynamicSupervisor for Binance User Data Streams.

  Each active credential gets its own UserDataStream child process.
  Streams are started when bots start and stopped when they stop.
  """

  use DynamicSupervisor
  require Logger

  def start_link(opts \\ []) do
    DynamicSupervisor.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    Logger.info("UserDataStreamSupervisor started")
    DynamicSupervisor.init(strategy: :one_for_one, max_restarts: 10, max_seconds: 60)
  end
end
