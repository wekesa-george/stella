defmodule TradeEngine.MarketData.APIThrottle do
  @moduledoc """
  Token bucket rate limiter for Alpaca API
  
  Alpaca limits:
  - 200 requests per minute per API key
  - Recommended: Stay at 80% capacity (160 req/min)
  
  Strategy:
  - Token bucket refills at steady rate
  - Requests consume tokens
  - Block when bucket empty
  - Exponential backoff on 429 errors
  """
  use GenServer
  require Logger

  # Rate limiting config
  @max_tokens 160.0                  # Max requests per minute (80% of 200)
  @refill_rate_per_sec 2.67         # 160/60 = 2.67 tokens per second
  @refill_interval_ms 500            # Refill every 500ms for smoother flow
  @min_tokens_per_request 1.0

  # Backoff on 429 errors
  @initial_backoff_ms 5_000
  @max_backoff_ms 60_000
  @backoff_multiplier 2.0

  # ========== PUBLIC API ==========

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Acquire a token to make an API request.
  Blocks until a token is available or timeout occurs.
  
  Returns: :ok | {:error, :timeout}
  """
  def acquire(timeout_ms \\ 10_000) do
    GenServer.call(__MODULE__, :acquire, timeout_ms)
  end

  @doc "Called when Alpaca returns 429 Too Many Requests"
  def on_rate_limit_error do
    GenServer.cast(__MODULE__, :rate_limit_hit)
  end

  @doc "Get current throttle statistics"
  def get_stats do
    GenServer.call(__MODULE__, :get_stats)
  end

  @doc "Reset throttle (useful for testing)"
  def reset do
    GenServer.cast(__MODULE__, :reset)
  end

  # ========== GENSERVER CALLBACKS ==========

  @impl true
  def init(_opts) do
    #Logger.info("🚦 API Throttle initialized: #{@max_tokens} req/min")
    
    # Start refill timer
    schedule_refill()
    
    state = %{
      tokens: @max_tokens,
      max_tokens: @max_tokens,
      requests_this_minute: 0,
      last_refill: System.monotonic_time(:millisecond),
      total_requests: 0,
      total_blocks: 0,
      rate_limit_hits: 0,
      backoff_ms: 0,
      backoff_until: nil,
      started_at: System.monotonic_time(:second)
    }
    
    {:ok, state}
  end

  @impl true
  def handle_call(:acquire, from, state) do
    now = System.monotonic_time(:millisecond)
    
    # Check if in backoff period
    if state.backoff_until && now < state.backoff_until do
      wait_ms = state.backoff_until - now
      Logger.warning("⚠️ In backoff period, waiting #{wait_ms}ms")
      Process.send_after(self(), {:retry_acquire, from}, wait_ms)
      {:noreply, %{state | total_blocks: state.total_blocks + 1}}
    else
      # Try to consume a token
      if state.tokens >= @min_tokens_per_request do
        new_state = %{state | 
          tokens: state.tokens - @min_tokens_per_request,
          requests_this_minute: state.requests_this_minute + 1,
          total_requests: state.total_requests + 1,
          backoff_until: nil
        }
        {:reply, :ok, new_state}
      else
        # No tokens available - block caller
        Logger.debug("🚦 Rate limit: blocking request (#{Float.round(state.tokens, 1)} tokens)")
        Process.send_after(self(), {:retry_acquire, from}, 1_000)
        {:noreply, %{state | total_blocks: state.total_blocks + 1}}
      end
    end
  end

  @impl true
  def handle_call(:get_stats, _from, state) do
    now = System.monotonic_time(:second)
    uptime_sec = now - state.started_at
    uptime_min = uptime_sec / 60.0
    
    effective_rate = if uptime_min > 0, 
      do: state.total_requests / uptime_min, 
      else: 0.0
    
    stats = %{
      tokens_available: Float.round(state.tokens, 2),
      max_tokens: state.max_tokens,
      requests_this_minute: state.requests_this_minute,
      total_requests: state.total_requests,
      total_blocks: state.total_blocks,
      rate_limit_hits: state.rate_limit_hits,
      effective_rate: Float.round(effective_rate, 1),
      backoff_active: state.backoff_until != nil,
      backoff_ms: state.backoff_ms
    }
    
    {:reply, stats, state}
  end

  @impl true
  def handle_cast(:rate_limit_hit, state) do
    Logger.error("❌ 429 Rate Limit Hit - activating backoff")
    
    new_backoff = if state.backoff_ms == 0 do
      @initial_backoff_ms
    else
      min(trunc(state.backoff_ms * @backoff_multiplier), @max_backoff_ms)
    end
    
    backoff_until = System.monotonic_time(:millisecond) + new_backoff
    
    Logger.warning("⏸️ Backing off for #{new_backoff}ms")
    
    new_state = %{state |
      rate_limit_hits: state.rate_limit_hits + 1,
      backoff_ms: new_backoff,
      backoff_until: backoff_until,
      tokens: 0.0  # Drain all tokens
    }
    
    {:noreply, new_state}
  end

  @impl true
  def handle_cast(:reset, state) do
    #Logger.info("🔄 Throttle reset")
    
    new_state = %{state |
      tokens: @max_tokens * 1.0,
      requests_this_minute: 0,
      backoff_ms: 0,
      backoff_until: nil
    }
    
    {:noreply, new_state}
  end

  @impl true
  def handle_info(:refill_tokens, state) do
    now = System.monotonic_time(:millisecond)
    elapsed_sec = (now - state.last_refill) / 1_000.0
    
    # Add tokens based on elapsed time
    tokens_to_add = @refill_rate_per_sec * elapsed_sec
    new_tokens = min(state.tokens + tokens_to_add, @max_tokens * 1.0)
    
    # Reset minute counter
    new_state = %{state |
      tokens: new_tokens,
      last_refill: now,
      requests_this_minute: 0
    }
    
    # Log only if significant change or every 30 seconds
    if rem(div(now, 1_000), 30) == 0 do
      tokens_rounded = Float.round(new_tokens, 1)
      #Logger.debug("🚦 Throttle: #{state.requests_this_minute} req/min (tokens: #{tokens_rounded}/#{@max_tokens})")
    end
    
    # Schedule next refill
    schedule_refill()
    
    {:noreply, new_state}
  end

  @impl true
  def handle_info({:retry_acquire, from}, state) do
    # Retry the acquire call
    if state.tokens >= @min_tokens_per_request do
      GenServer.reply(from, :ok)
      new_state = %{state | 
        tokens: state.tokens - @min_tokens_per_request,
        requests_this_minute: state.requests_this_minute + 1,
        total_requests: state.total_requests + 1
      }
      {:noreply, new_state}
    else
      # Still no tokens, retry later
      Process.send_after(self(), {:retry_acquire, from}, 1_000)
      {:noreply, state}
    end
  end

  # Catch-all for unexpected messages (fixes old state structure conflicts)
  @impl true
  def handle_info(msg, state) do
    #Logger.warning("⚠️ Unexpected message in APIThrottle: #{inspect(msg)}")
    {:noreply, state}
  end

  # ========== PRIVATE HELPERS ==========

  defp schedule_refill do
    Process.send_after(self(), :refill_tokens, @refill_interval_ms)
  end
end