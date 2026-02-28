defmodule TradeEngine.Debug.PubSubMonitor do
  @moduledoc "Monitor what's actually being broadcast on PubSub"
  
  use GenServer
  require Logger
  
  @pubsub TradeEngine.PubSub

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, [], name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    Logger.info("🔍 PubSub Monitor started - listening for all messages")
    
    # Subscribe to multiple patterns to catch everything
    Phoenix.PubSub.subscribe(@pubsub, "kline:BTCUSDT:5m")
    Phoenix.PubSub.subscribe(@pubsub, "kline:BTCUSDT:15m")
    Phoenix.PubSub.subscribe(@pubsub, "kline:BTCUSDT")
    Phoenix.PubSub.subscribe(@pubsub, "kline:BTCUSDT:*")
    
    # Also monitor candle_closed
    Phoenix.PubSub.subscribe(@pubsub, "candle_closed:5m")
    Phoenix.PubSub.subscribe(@pubsub, "candle_closed:15m")
    
    state = %{
      kline_count: 0,
      candle_closed_count: 0,
      last_kline_topic: nil,
      last_kline_data: nil
    }
    
    {:ok, state}
  end

  @impl true
  def handle_info({topic, msg}, state) when is_binary(topic) and is_map(msg) do
    cond do
      String.starts_with?(topic, "kline:") ->
        new_state = %{state | 
          kline_count: state.kline_count + 1,
          last_kline_topic: topic,
          last_kline_data: msg
        }
        
        if rem(new_state.kline_count, 10) == 0 do
          Logger.info("📡 KLINE: #{topic} | #{inspect(msg |> Map.keys())}")
        end
        
        {:noreply, new_state}
      
      String.starts_with?(topic, "candle_closed:") ->
        new_state = %{state | candle_closed_count: state.candle_closed_count + 1}
        
        if rem(new_state.candle_closed_count, 5) == 0 do
          Logger.info("🕯️  CANDLE_CLOSED: #{topic}")
        end
        
        {:noreply, new_state}
      
      true ->
        Logger.debug("❓ Unknown: #{topic}")
        {:noreply, state}
    end
  end

  def handle_info(_msg, state) do
    {:noreply, state}
  end

  def status do
    GenServer.call(__MODULE__, :status)
  end

  def handle_call(:status, _from, state) do
    status = %{
      kline_messages: state.kline_count,
      candle_closed_messages: state.candle_closed_count,
      last_kline_topic: state.last_kline_topic,
      last_kline_keys: state.last_kline_data && Map.keys(state.last_kline_data)
    }
    {:reply, status, state}
  end
end