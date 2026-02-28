# ============================================================================
# HELPER: Decimal to Float conversion wrapper
# ============================================================================
defmodule TradeEngine.Physics.Utils do
  @doc "Safely convert Decimal or number to float"
  def to_float(%Decimal{} = d), do: Decimal.to_float(d)
  def to_float(n) when is_number(n), do: n * 1.0
  def to_float(_), do: 0.0

  @doc "Safely extract close price from candle"
  def get_close(candle) do
    case candle do
      %{close: c} -> to_float(c)
      _ -> 0.0
    end
  end

  @doc "Safely extract high price from candle"
  def get_high(candle) do
    case candle do
      %{high: h} -> to_float(h)
      _ -> 0.0
    end
  end

  @doc "Safely extract low price from candle"
  def get_low(candle) do
    case candle do
      %{low: l} -> to_float(l)
      _ -> 0.0
    end
  end
end