defmodule TradeEngine.Orchestrator.Alpaca.Auth do
  @moduledoc """
  Handles authentication headers for Alpaca API.
  """

  def get_headers do
    config = Application.get_env(:trade_engine, :alpaca)

    [
      {"APCA-API-KEY-ID", config[:api_key]},
      {"APCA-API-SECRET-KEY", config[:api_secret]},
      {"Content-Type", "application/json"},
      {"Accept", "application/json"}
    ]
  end
end