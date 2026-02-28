defmodule TradeEngine.Exchanges.Binance.RateLimiter do
  @moduledoc """
  Rate limiter for Binance API requests.
  
  Manages two types of limits:
  - Request weight (1200/minute)
  - Order rate (10/second, 100000/day)
  """

  use GenServer
  require Logger

  @weight_limit 1200
  @weight_window_ms 60_000
  @order_second_limit 10
  @order_second_window_ms 1_000

  # ============================================================================
  # CLIENT API
  # ============================================================================

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Acquire rate limit tokens. Returns :ok or {:error, :rate_limited, wait_ms}
  """
  def acquire(type \\ :weight, count \\ 1) do
    GenServer.call(__MODULE__, {:acquire, type, count})
  end

  @doc """
  Acquire tokens, blocking until available. Raises on timeout.
  """
  def acquire!(type \\ :weight, count \\ 1, opts \\ []) do
    timeout = Keyword.get(opts, :timeout, 30_000)
    
    case acquire(type, count) do
      :ok -> :ok
      {:error, :rate_limited, wait_ms} ->
        if wait_ms <= timeout do
          Process.sleep(wait_ms)
          acquire!(type, count, Keyword.put(opts, :timeout, timeout - wait_ms))
        else
          raise "Rate limit timeout"
        end
    end
  end

  @doc """
  Get current rate limit status.
  """
  def status(type \\ :weight) do
    GenServer.call(__MODULE__, {:status, type})
  end

  @doc """
  Update limits from response headers.
  """
  def update_from_headers(headers) do
    GenServer.cast(__MODULE__, {:update_headers, headers})
  end

  # ============================================================================
  # SERVER CALLBACKS
  # ============================================================================

  @impl true
  def init(_opts) do
    state = %{
      weight: %{
        tokens: @weight_limit,
        capacity: @weight_limit,
        last_refill: System.monotonic_time(:millisecond),
        window_ms: @weight_window_ms
      },
      orders_second: %{
        tokens: @order_second_limit,
        capacity: @order_second_limit,
        last_refill: System.monotonic_time(:millisecond),
        window_ms: @order_second_window_ms
      }
    }
    
    # Periodic refill
    :timer.send_interval(100, :refill)
    
    {:ok, state}
  end

  @impl true
  def handle_call({:acquire, type, count}, _from, state) do
    bucket = Map.get(state, type, state.weight)
    bucket = refill_bucket(bucket)
    
    if bucket.tokens >= count do
      new_bucket = %{bucket | tokens: bucket.tokens - count}
      new_state = Map.put(state, type, new_bucket)
      {:reply, :ok, new_state}
    else
      wait_ms = estimate_wait(bucket, count)
      {:reply, {:error, :rate_limited, wait_ms}, Map.put(state, type, bucket)}
    end
  end

  def handle_call({:status, type}, _from, state) do
    bucket = Map.get(state, type, state.weight)
    bucket = refill_bucket(bucket)
    
    status = %{
      available: bucket.tokens,
      capacity: bucket.capacity,
      window_ms: bucket.window_ms
    }
    
    {:reply, status, Map.put(state, type, bucket)}
  end

  @impl true
  def handle_cast({:update_headers, headers}, state) do
    # Parse Binance rate limit headers
    new_state = parse_headers(headers, state)
    {:noreply, new_state}
  end

  @impl true
  def handle_info(:refill, state) do
    new_state = state
      |> Map.update!(:weight, &refill_bucket/1)
      |> Map.update!(:orders_second, &refill_bucket/1)
    {:noreply, new_state}
  end

  # ============================================================================
  # PRIVATE
  # ============================================================================

  defp refill_bucket(bucket) do
    now = System.monotonic_time(:millisecond)
    elapsed = now - bucket.last_refill
    
    if elapsed >= bucket.window_ms do
      %{bucket | tokens: bucket.capacity, last_refill: now}
    else
      # Partial refill based on time elapsed
      refill_rate = bucket.capacity / bucket.window_ms
      refill_amount = elapsed * refill_rate
      new_tokens = min(bucket.capacity, bucket.tokens + refill_amount)
      %{bucket | tokens: new_tokens, last_refill: now}
    end
  end

  defp estimate_wait(bucket, needed) do
    deficit = needed - bucket.tokens
    refill_rate = bucket.capacity / bucket.window_ms
    round(deficit / refill_rate) + 10
  end

  defp parse_headers(headers, state) do
    headers_map = Map.new(headers, fn {k, v} -> {String.downcase(k), v} end)
    
    case Map.get(headers_map, "x-mbx-used-weight-1m") do
      nil -> state
      used_str ->
        used = String.to_integer(used_str)
        remaining = max(0, @weight_limit - used)
        
        weight_bucket = %{state.weight | tokens: remaining}
        Map.put(state, :weight, weight_bucket)
    end
  end
end