defmodule TradeEngine.Exchanges.Bybit do
  @moduledoc """
  Bybit exchange adapter stub.

  Implements the exchange behaviour interface. Currently a placeholder
  that returns :not_implemented for all operations. Wire up the actual
  Bybit REST/WebSocket clients when ready to go live.
  """

  @behaviour TradeEngine.Exchanges.Behaviour

  # ============================================================================
  # MARKET DATA
  # ============================================================================

  @impl true
  def get_price(_symbol), do: {:error, :not_implemented}

  @impl true
  def get_prices(_symbols), do: {:error, :not_implemented}

  @impl true
  def get_ticker(_symbol), do: {:error, :not_implemented}

  @impl true
  def get_klines(_symbol, _timeframe, _opts \\ []), do: {:error, :not_implemented}

  @impl true
  def get_orderbook(_symbol, _limit \\ 20), do: {:error, :not_implemented}

  # ============================================================================
  # ACCOUNT
  # ============================================================================

  @impl true
  def get_account, do: {:error, :not_implemented}

  @impl true
  def get_balance(_asset), do: {:error, :not_implemented}

  # ============================================================================
  # ORDERS
  # ============================================================================

  @impl true
  def place_order(_params), do: {:error, :not_implemented}

  @impl true
  def cancel_order(_symbol, _order_id), do: {:error, :not_implemented}

  @impl true
  def get_order(_symbol, _order_id), do: {:error, :not_implemented}

  @impl true
  def get_open_orders(_symbol \\ nil), do: {:error, :not_implemented}

  # ============================================================================
  # SUBSCRIPTIONS
  # ============================================================================

  @impl true
  def subscribe_ticker(_symbol), do: {:error, :not_implemented}

  @impl true
  def subscribe_candles(_symbol, _timeframe), do: {:error, :not_implemented}

  @impl true
  def subscribe_depth(_symbol), do: {:error, :not_implemented}

  # ============================================================================
  # SYSTEM
  # ============================================================================

  @impl true
  def ping, do: {:error, :not_implemented}

  @impl true
  def server_time, do: {:error, :not_implemented}

  @impl true
  def rate_limit_status do
    %{used_weight: 0, max_weight: 0, reset_at: DateTime.utc_now()}
  end
end
