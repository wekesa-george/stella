defmodule TradeEngine.Exchanges.Binance.BaseStream do
  @moduledoc """
  Base module for Binance WebSocket streams.
  
  Provides common functionality:
  - Automatic reconnection with exponential backoff
  - Heartbeat ping/pong
  - Connection age tracking (24-hour rotation)
  - Subscription management
  
  ## Usage
  
      defmodule MyStream do
        use TradeEngine.Exchanges.Binance.BaseStream
        
        @impl true
        def handle_message(data, state) do
          # Process your data
          {:ok, state}
        end
      end
  """

  defmacro __using__(_opts) do
    quote do
      use WebSockex
      require Logger

      @heartbeat_interval 60_000  # Ping every 60 seconds
      @max_connection_age 82_800_000  # 23 hours (rotate before 24h limit)
      @initial_reconnect_delay 1_000
      @max_reconnect_delay 60_000
      @reconnect_multiplier 2

      # ========================================================================
      # CALLBACKS TO IMPLEMENT
      # ========================================================================

      @doc """
      Handle incoming WebSocket message.
      Override this in your stream module.
      """
      @callback handle_message(data :: map() | list(), state :: map()) ::
        {:ok, map()} | {:reply, term(), map()}

      # Default implementation
      def handle_message(_data, state), do: {:ok, state}

      defoverridable handle_message: 2

      # ========================================================================
      # WEBSOCKEX CALLBACKS
      # ========================================================================

      @impl true
      def handle_connect(_conn, state) do
        Logger.info("✅ #{state.name} connected to Binance WebSocket")
        
        # Start heartbeat
        schedule_heartbeat()
        
        # Schedule connection rotation
        schedule_rotation()
        
        {:ok, %{state | 
          connected_at: DateTime.utc_now(),
          reconnect_attempts: 0
        }}
      end

      @impl true
      def handle_disconnect(%{reason: reason}, state) do
        Logger.warning("⚠️ #{state.name} disconnected: #{inspect(reason)}")
        
        # Calculate reconnect delay with exponential backoff
        delay = calculate_reconnect_delay(state.reconnect_attempts)
        
        Logger.info("🔄 #{state.name} reconnecting in #{delay}ms...")
        
        {:reconnect, delay, %{state | reconnect_attempts: state.reconnect_attempts + 1}}
      end

      @impl true
      def handle_frame({:text, msg}, state) do
        case Jason.decode(msg) do
          {:ok, data} ->
            handle_message(data, state)
            
          {:error, _} ->
            Logger.debug("#{state.name}: Failed to decode message")
            {:ok, state}
        end
      end

      def handle_frame({:ping, _}, state) do
        {:reply, {:pong, ""}, state}
      end

      def handle_frame({:pong, _}, state) do
        {:ok, %{state | last_pong: DateTime.utc_now()}}
      end

      def handle_frame(_frame, state) do
        {:ok, state}
      end

      @impl true
      def handle_cast({:send, payload}, state) do
        {:reply, {:text, Jason.encode!(payload)}, state}
      end

      def handle_cast({:subscribe, streams}, state) when is_list(streams) do
        payload = %{
          method: "SUBSCRIBE",
          params: streams,
          id: System.unique_integer([:positive])
        }
        
        new_subs = Enum.reduce(streams, state.subscriptions, fn s, acc ->
          MapSet.put(acc, s)
        end)
        
        {:reply, {:text, Jason.encode!(payload)}, %{state | subscriptions: new_subs}}
      end

      def handle_cast({:unsubscribe, streams}, state) when is_list(streams) do
        payload = %{
          method: "UNSUBSCRIBE",
          params: streams,
          id: System.unique_integer([:positive])
        }
        
        new_subs = Enum.reduce(streams, state.subscriptions, fn s, acc ->
          MapSet.delete(acc, s)
        end)
        
        {:reply, {:text, Jason.encode!(payload)}, %{state | subscriptions: new_subs}}
      end

      def handle_cast(msg, state) do
        Logger.debug("#{state.name}: Unhandled cast: #{inspect(msg)}")
        {:ok, state}
      end

      @impl true
      def handle_info(:heartbeat, state) do
        schedule_heartbeat()
        {:reply, {:ping, ""}, state}
      end

      def handle_info(:rotate_connection, state) do
        if should_rotate?(state) do
          Logger.info("🔄 #{state.name} rotating connection (age: #{connection_age_hours(state)}h)")
          {:close, {1000, "Scheduled rotation"}, state}
        else
          schedule_rotation()
          {:ok, state}
        end
      end

      def handle_info(msg, state) do
        Logger.debug("#{state.name}: Unhandled info: #{inspect(msg)}")
        {:ok, state}
      end

      @impl true
      def terminate(reason, state) do
        Logger.info("#{state.name} terminating: #{inspect(reason)}")
        :ok
      end

      # ========================================================================
      # PUBLIC API
      # ========================================================================

      @doc """
      Subscribe to additional streams.
      """
      def subscribe(name \\ __MODULE__, streams) do
        WebSockex.cast(name, {:subscribe, streams})
      end

      @doc """
      Unsubscribe from streams.
      """
      def unsubscribe(name \\ __MODULE__, streams) do
        WebSockex.cast(name, {:unsubscribe, streams})
      end

      @doc """
      Send raw payload.
      """
      def send_payload(name \\ __MODULE__, payload) do
        WebSockex.cast(name, {:send, payload})
      end

      @doc """
      Get connection status.
      """
      def status(name \\ __MODULE__) do
        # This would need to be implemented via call if we want sync response
        :ok
      end

      # ========================================================================
      # PRIVATE HELPERS
      # ========================================================================

      defp schedule_heartbeat do
        Process.send_after(self(), :heartbeat, @heartbeat_interval)
      end

      defp schedule_rotation do
        # Check every hour
        Process.send_after(self(), :rotate_connection, 3_600_000)
      end

      defp should_rotate?(state) do
        case state.connected_at do
          nil -> false
          connected_at ->
            age_ms = DateTime.diff(DateTime.utc_now(), connected_at, :millisecond)
            age_ms >= @max_connection_age
        end
      end

      defp connection_age_hours(state) do
        case state.connected_at do
          nil -> 0
          connected_at ->
            DateTime.diff(DateTime.utc_now(), connected_at, :hour)
        end
      end

      defp calculate_reconnect_delay(attempts) do
        delay = @initial_reconnect_delay * :math.pow(@reconnect_multiplier, attempts)
        min(round(delay), @max_reconnect_delay)
      end
    end
  end
end