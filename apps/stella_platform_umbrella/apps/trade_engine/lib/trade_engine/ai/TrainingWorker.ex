defmodule TradeEngine.AI.TrainingWorker do
  @moduledoc """
  Background worker for processing and exporting training data.

  Handles:
  - Periodic flushing of training samples to disk
  - Data validation and preprocessing
  - Training data statistics
  - Export to various formats (JSONL, CSV, Parquet)
  """

  use GenServer
  require Logger

  # Flush interval in milliseconds
  @flush_interval_ms 60_000  # 1 minute
  
  # Maximum samples in memory before forced flush
  @max_buffer_size 5000

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Get training data statistics.
  """
  def stats do
    GenServer.call(__MODULE__, :stats)
  end

  @doc """
  Export all training data to a file.
  """
  def export(format \\ :jsonl) when format in [:jsonl, :csv] do
    GenServer.call(__MODULE__, {:export, format}, 30_000)
  end

  @doc """
  Clear all training data (use with caution!).
  """
  def clear_data! do
    GenServer.call(__MODULE__, :clear_data)
  end

  # ============================================================================
  # GenServer Callbacks
  # ============================================================================

  @impl true
  def init(_opts) do
    Logger.info("[TrainingWorker] 📊 Starting training data worker...")
    
    # Schedule periodic flush
    schedule_flush()
    
    state = %{
      samples_processed: 0,
      samples_flushed: 0,
      last_flush: nil,
      errors: 0,
      started_at: DateTime.utc_now()
    }
    
    {:ok, state}
  end

  @impl true
  def handle_call(:stats, _from, state) do
    # Count samples in ETS buffer
    buffer_count = case :ets.info(:brain_training_buffer, :size) do
      :undefined -> 0
      n -> n
    end
    
    stats = %{
      samples_in_buffer: buffer_count,
      samples_processed: state.samples_processed,
      samples_flushed: state.samples_flushed,
      last_flush: state.last_flush,
      errors: state.errors,
      uptime_seconds: DateTime.diff(DateTime.utc_now(), state.started_at)
    }
    
    {:reply, stats, state}
  end

  @impl true
  def handle_call({:export, format}, _from, state) do
    result = export_data(format)
    {:reply, result, state}
  end

  @impl true
  def handle_call(:clear_data, _from, state) do
    :ets.delete_all_objects(:brain_training_buffer)
    
    # Clear data files
    data_dir = Path.join(:code.priv_dir(:trade_engine), "training_data")
    if File.exists?(data_dir) do
      File.rm_rf!(data_dir)
      File.mkdir_p!(data_dir)
    end
    
    Logger.warning("[TrainingWorker] ⚠️ All training data cleared!")
    {:reply, :ok, %{state | samples_flushed: 0}}
  end

  @impl true
  def handle_info(:flush, state) do
    new_state = flush_buffer(state)
    schedule_flush()
    {:noreply, new_state}
  end

  # ============================================================================
  # Private Functions
  # ============================================================================

  defp schedule_flush do
    Process.send_after(self(), :flush, @flush_interval_ms)
  end

  defp flush_buffer(state) do
    case :ets.info(:brain_training_buffer, :size) do
      n when is_integer(n) and n > 0 ->
        try do
          samples = :ets.tab2list(:brain_training_buffer)
          :ets.delete_all_objects(:brain_training_buffer)
          
          # Write to disk
          write_samples(samples)
          
          %{state | 
            samples_flushed: state.samples_flushed + length(samples),
            last_flush: DateTime.utc_now()
          }
        rescue
          e ->
            Logger.error("[TrainingWorker] Flush error: #{inspect(e)}")
            %{state | errors: state.errors + 1}
        end
        
      _ ->
        state
    end
  end

  defp write_samples(samples) do
    data_dir = Path.join(:code.priv_dir(:trade_engine), "training_data")
    File.mkdir_p!(data_dir)
    
    filename = "samples_#{Date.to_iso8601(Date.utc_today())}.jsonl"
    filepath = Path.join(data_dir, filename)
    
    lines = Enum.map(samples, fn {:sample, sample} ->
      Jason.encode!(sample)
    end)
    
    File.write!(filepath, Enum.join(lines, "\n") <> "\n", [:append])
    Logger.debug("[TrainingWorker] Wrote #{length(samples)} samples to #{filename}")
  end

  defp export_data(:jsonl) do
    data_dir = Path.join(:code.priv_dir(:trade_engine), "training_data")
    export_path = Path.join(data_dir, "export_#{DateTime.to_unix(DateTime.utc_now())}.jsonl")
    
    # Concatenate all sample files
    files = Path.wildcard(Path.join(data_dir, "samples_*.jsonl"))
    
    content = files
    |> Enum.map(&File.read!/1)
    |> Enum.join("")
    
    File.write!(export_path, content)
    {:ok, export_path}
  end

  defp export_data(:csv) do
    data_dir = Path.join(:code.priv_dir(:trade_engine), "training_data")
    export_path = Path.join(data_dir, "export_#{DateTime.to_unix(DateTime.utc_now())}.csv")
    
    # Read all JSONL files and convert to CSV
    files = Path.wildcard(Path.join(data_dir, "samples_*.jsonl"))
    
    header = "momentum,gravity,kinetic_energy,dist_to_peak_pct,dist_to_injection_pct,unrealized_pnl_pct,action,reward,timestamp\n"
    
    rows = files
    |> Enum.flat_map(fn file ->
      file
      |> File.read!()
      |> String.split("\n", trim: true)
      |> Enum.map(&Jason.decode!/1)
    end)
    |> Enum.map(fn sample ->
      f = sample["features"]
      action_num = case sample["action"] do
        "hold" -> 0
        "long" -> 1
        "short" -> 2
        _ -> 0
      end
      
      "#{f["momentum"]},#{f["gravity"]},#{f["kinetic_energy"]}," <>
      "#{f["dist_to_peak_pct"]},#{f["dist_to_injection_pct"]},#{f["unrealized_pnl_pct"]}," <>
      "#{action_num},#{sample["reward"]},#{sample["timestamp"]}"
    end)
    
    File.write!(export_path, header <> Enum.join(rows, "\n"))
    {:ok, export_path}
  end
end