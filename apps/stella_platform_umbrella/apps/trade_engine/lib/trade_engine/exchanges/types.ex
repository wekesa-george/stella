defmodule TradeEngine.Exchanges.Types do
  @moduledoc """
  Common types for exchange integrations.
  """
end

defmodule TradeEngine.Exchanges.Types.Candle do
  @moduledoc "Candlestick (OHLCV) data"

  defstruct [
    :exchange,
    :symbol,
    :timeframe,
    :timestamp,
    :open,
    :high,
    :low,
    :close,
    :volume,
    :quote_volume,
    :taker_buy_volume,
    :taker_buy_quote_volume,
    :trade_count,
    closed: false
  ]
end

defmodule TradeEngine.Exchanges.Types.Ticker do
  @moduledoc "Real-time ticker data"

  defstruct [
    :exchange,
    :symbol,
    :price,
    :bid,
    :bid_qty,
    :ask,
    :ask_qty,
    :open_24h,
    :high_24h,
    :low_24h,
    :volume_24h,
    :quote_volume_24h,
    :price_change_24h,
    :price_change_percent_24h,
    :timestamp
  ]
end

defmodule TradeEngine.Exchanges.Types.OrderBook do
  @moduledoc "Order book depth data"

  defstruct [
    :exchange,
    :symbol,
    :bids,
    :asks,
    :timestamp,
    :last_update_id,
    :first_update_id
  ]
end

defmodule TradeEngine.Exchanges.Types.Balance do
  @moduledoc "Asset balance"

  defstruct [
    :asset,
    :free,
    :locked,
    :total
  ]
end

defmodule TradeEngine.Exchanges.Types.Account do
  @moduledoc "Exchange account information"

  defstruct [
    :exchange,
    :account_type,
    :can_trade,
    :can_withdraw,
    :can_deposit,
    :balances,
    :permissions,
    :update_time,
    :raw
  ]
end

defmodule TradeEngine.Exchanges.Types.Order do
  @moduledoc "Order information"

  defstruct [
    :order_id,
    :client_order_id,
    :exchange,
    :symbol,
    :side,
    :type,
    :status,
    :quantity,
    :filled_quantity,
    :price,
    :stop_price,
    :executed_price,
    :time_in_force,
    :created_at,
    :updated_at,
    :raw
  ]
end

defmodule TradeEngine.Exchanges.Types.SymbolInfo do
  @moduledoc "Trading symbol information"

  defstruct [
    :symbol,
    :exchange,
    :base_asset,
    :quote_asset,
    :status,
    :min_qty,
    :max_qty,
    :step_size,
    :min_notional,
    :tick_size,
    :min_price,
    :max_price,
    :is_spot,
    :is_margin,
    :is_futures,
    :base_precision,
    :quote_precision
  ]
end