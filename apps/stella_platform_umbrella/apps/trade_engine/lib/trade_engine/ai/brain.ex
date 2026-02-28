defmodule TradeEngine.AI.Brain do
  @moduledoc """
  MarginScalper Endgame: Reinforcement Learning Brain

  A GenServer that provides sub-millisecond trading decisions using either:
  - **Inference Mode**: ONNX model via Ortex (when model exists)
  - **Heuristic Mode**: Physics-based rules (fallback + data collection)

  ## Architecture

  ```
  ┌─────────────────────────────────────────────────────────────┐
  │                    TradeEngine.AI.Brain                     │
  ├─────────────────────────────────────────────────────────────┤
  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐ │
  │  │  Normalizer │───▶│   Ortex     │───▶│  Action Decoder │ │
  │  │  (6 inputs) │    │  Inference  │    │  (3 outputs)    │ │
  │  └─────────────┘    └──────┬──────┘    └─────────────────┘ │
  │                            │                               │
  │                     (model missing?)                       │
  │                            │                               │
  │                            ▼                               │
  │                   ┌────────────────┐                       │
  │                   │   Heuristic    │                       │
  │                   │  Physics Rules │                       │
  │                   └────────────────┘                       │
  └─────────────────────────────────────────────────────────────┘
  ```

  ## Input Features (6 normalized floats)

  | Index | Feature          | Raw Range        | Normalized |
  |-------|------------------|------------------|------------|
  | 0     | Momentum (v₀)    | [-1.0, 1.0]      | [-1, 1]    |
  | 1     | Gravity          | [0, 0.01]        | [0, 1]     |
  | 2     | Kinetic Energy   | [0, 1000]        | [0, 1]     |
  | 3     | Dist to Peak %   | [-10%, +10%]     | [-1, 1]    |
  | 4     | Dist to Injection| [-10%, +10%]     | [-1, 1]    |
  | 5     | Unrealized PnL % | [-100%, +100%]   | [-1, 1]    |

  ## Output Actions

  - `0` → `:hold`  (do nothing)
  - `1` → `:long`  (buy/go long)
  - `2` → `:short` (sell/go short)

  ## Usage

  ```elixir
  # Start with supervision tree (automatic)
  # Or manual start:
  {:ok, pid} = TradeEngine.AI.Brain.start_link([])

  # Get trading decision
  features = %{
    momentum: 0.5,
    gravity: 0.001,
    kinetic_energy: 150.0,
    dist_to_peak_pct: 0.02,
    dist_to_injection_pct: -0.01,
    unrealized_pnl_pct: 0.0
  }

  {:ok, %{action: :long, confidence: 0.87, mode: :inference}} = 
    TradeEngine.AI.Brain.decide(features)
  ```
  """

  use GenServer
  require Logger

  # ============================================================================
  # Configuration
  # ============================================================================

  @model_path "priv/models/margin_scalper_brain.onnx"
  @fallback_model_path "priv/models/margin_scalper_brain_v1.onnx"
  
  # Feature normalization bounds
  @normalization_config %{
    momentum:            %{min: -1.0,   max: 1.0,    clip: true},
    gravity:             %{min: 0.0,    max: 0.01,   clip: true},
    kinetic_energy:      %{min: 0.0,    max: 1000.0, clip: true},
    dist_to_peak_pct:    %{min: -0.10,  max: 0.10,   clip: true},
    dist_to_injection_pct: %{min: -0.10, max: 0.10,  clip: true},
    unrealized_pnl_pct:  %{min: -1.0,   max: 1.0,    clip: true}
  }

  # Action mapping
  @action_map %{0 => :hold, 1 => :long, 2 => :short}
  
  # Inference timeout (microseconds)
  @inference_timeout_us 500

  # ============================================================================
  # Client API
  # ============================================================================

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Get trading decision from the RL brain.

  ## Parameters
  - `features` - Map with 6 physics features
  - `opts` - Options (timeout, force_heuristic, etc.)

  ## Returns
  - `{:ok, %{action: atom, confidence: float, mode: atom, latency_us: integer}}`
  - `{:error, reason}`
  """
  @spec decide(map(), keyword()) :: {:ok, map()} | {:error, term()}
  def decide(features, opts \\ []) do
    timeout = Keyword.get(opts, :timeout, 500)
    
    try do
      GenServer.call(__MODULE__, {:decide, features, opts}, timeout)
    catch
      :exit, {:timeout, _} ->
        Logger.warning("[Brain] Inference timeout, using fast heuristic")
        {:ok, fast_heuristic_fallback(features)}
    end
  end

  @doc """
  Synchronous decision for hot path (no GenServer overhead).
  Use only when latency is critical and you accept potential race conditions.
  """
  @spec decide_sync(map()) :: {:ok, map()} | {:error, term()}
  def decide_sync(features) do
    case :ets.lookup(:brain_model_cache, :model) do
      [{:model, model}] when not is_nil(model) ->
        run_inference(model, features)
      _ ->
        {:ok, run_heuristic(features)}
    end
  end

  @doc """
  Record training sample for future model improvement.
  """
  @spec record_outcome(map(), atom(), float()) :: :ok
  def record_outcome(features, actual_action, reward) do
    GenServer.cast(__MODULE__, {:record_outcome, features, actual_action, reward})
  end

  @doc """
  Get brain status and statistics.
  """
  @spec status() :: map()
  def status do
    GenServer.call(__MODULE__, :status)
  end

  @doc """
  Hot-reload model without restart.
  """
  @spec reload_model() :: :ok | {:error, term()}
  def reload_model do
    GenServer.call(__MODULE__, :reload_model)
  end

  # ============================================================================
  # GenServer Callbacks
  # ============================================================================

  @impl true
  def init(_opts) do
    Logger.info("[Brain] 🧠 Initializing RL Brain...")
    
    # Create ETS for zero-copy model access
    :ets.new(:brain_model_cache, [:named_table, :public, read_concurrency: true])
    :ets.new(:brain_training_buffer, [:named_table, :public, :bag])
    
    # Attempt to load model
    state = %{
      model: nil,
      mode: :heuristic,
      model_path: nil,
      inference_count: 0.0,
      heuristic_count: 0.0,
      total_latency_us: 0,
      errors: 0,
      last_reload: nil,
      training_samples: 0,
      started_at: DateTime.utc_now()
    }
    
    state = attempt_model_load(state)
    
    Logger.info("[Brain] ✅ Brain initialized in #{state.mode} mode")
    {:ok, state}
  end

  @impl true
  def handle_call({:decide, features, opts}, _from, state) do
    start_time = System.monotonic_time(:microsecond)
    force_heuristic = Keyword.get(opts, :force_heuristic, false)
    
    {result, new_state} = 
      if state.mode == :inference and not force_heuristic do
        case run_inference(state.model, features) do
          {:ok, decision} ->
            latency = System.monotonic_time(:microsecond) - start_time
            decision = Map.put(decision, :latency_us, latency)
            
            new_state = %{state | 
              inference_count: state.inference_count + 1,
              total_latency_us: state.total_latency_us + latency
            }
            {{:ok, decision}, new_state}
            
          {:error, reason} ->
            Logger.warning("[Brain] Inference failed: #{inspect(reason)}, falling back to heuristic")
            decision = run_heuristic(features)
            latency = System.monotonic_time(:microsecond) - start_time
            decision = Map.merge(decision, %{latency_us: latency, fallback_reason: reason})
            
            new_state = %{state | 
              heuristic_count: state.heuristic_count + 1,
              errors: state.errors + 1
            }
            {{:ok, decision}, new_state}
        end
      else
        decision = run_heuristic(features)
        latency = System.monotonic_time(:microsecond) - start_time
        decision = Map.put(decision, :latency_us, latency)
        
        new_state = %{state | heuristic_count: state.heuristic_count + 1}
        {{:ok, decision}, new_state}
      end
    
    {:reply, result, new_state}
  end

  @impl true
  def handle_call(:status, _from, state) do
    avg_latency = if state.inference_count > 0 do
      state.total_latency_us / state.inference_count
    else
      0.0
    end
    
    status = %{
      mode: state.mode,
      model_loaded: not is_nil(state.model),
      model_path: state.model_path,
      inference_count: state.inference_count,
      heuristic_count: state.heuristic_count,
      total_decisions: state.inference_count + state.heuristic_count,
      avg_latency_us: Float.round(avg_latency, 2),
      errors: state.errors,
      training_samples: state.training_samples,
      uptime_seconds: DateTime.diff(DateTime.utc_now(), state.started_at),
      last_reload: state.last_reload
    }
    
    {:reply, status, state}
  end

  @impl true
  def handle_call(:reload_model, _from, state) do
    Logger.info("[Brain] 🔄 Reloading model...")
    new_state = attempt_model_load(%{state | last_reload: DateTime.utc_now()})
    {:reply, :ok, new_state}
  end

  @impl true
  def handle_cast({:record_outcome, features, action, reward}, state) do
    # Store training sample
    sample = %{
      features: features,
      action: action,
      reward: reward,
      timestamp: System.system_time(:millisecond)
    }
    
    :ets.insert(:brain_training_buffer, {:sample, sample})
    
    # Periodically flush to disk
    new_count = state.training_samples + 1
    if rem(new_count, 1000) == 0 do
      flush_training_buffer()
    end
    
    {:noreply, %{state | training_samples: new_count}}
  end

  @impl true
  def handle_info(:flush_training_buffer, state) do
    flush_training_buffer()
    {:noreply, state}
  end

  # ============================================================================
  # Model Loading
  # ============================================================================

  defp attempt_model_load(state) do
    model_paths = [@model_path, @fallback_model_path]
    
    result = Enum.find_value(model_paths, fn path ->
      full_path = Path.join(:code.priv_dir(:trade_engine), path |> String.replace("priv/", ""))
      
      if File.exists?(full_path) do
        Logger.info("[Brain] 📂 Found model at: #{full_path}")
        load_onnx_model(full_path)
      else
        nil
      end
    end)
    
    case result do
      {:ok, model, path} ->
        :ets.insert(:brain_model_cache, {:model, model})
        Logger.info("[Brain] ✅ Model loaded successfully: #{path}")
        %{state | model: model, mode: :inference, model_path: path}
        
      nil ->
        Logger.info("[Brain] ⚠️ No model found, running in heuristic mode")
        Logger.info("[Brain] 📝 Training data will be collected for future model training")
        :ets.insert(:brain_model_cache, {:model, nil})
        %{state | model: nil, mode: :heuristic, model_path: nil}
    end
  end

  defp load_onnx_model(path) do
    try do
      # Check if Ortex is available
      if Code.ensure_loaded?(Ortex) do
        case Ortex.load(path) do
          {:ok, model} -> {:ok, model, path}
          model when is_struct(model) -> {:ok, model, path}
          {:error, reason} -> 
            Logger.error("[Brain] Failed to load ONNX: #{inspect(reason)}")
            nil
          other -> Logger.error("[Brain] Unexpected Ortex response: #{inspect(other)}")
            nil
        end
      else
        Logger.warning("[Brain] Ortex not available, using heuristic mode")
        nil
      end
    rescue
      e ->
        Logger.error("[Brain] Model load exception: #{inspect(e)}")
        nil
    end
  end

  # ============================================================================
  # Inference Engine
  # ============================================================================

   defp run_inference(model, features) do
        try do
            input =
            features
            |> normalize_features()
            |> ensure_ortex_tensor()

            output = Ortex.run(model, input)

            decode_output(output)
        rescue
            e ->
            {:error, {:inference_exception, e}}
        end
  end

  defp ensure_ortex_tensor(%Nx.Tensor{} = t) do
    t
    |> Nx.as_type(:f32)
    |> Nx.backend_transfer(Nx.BinaryBackend)
   end

   defp ensure_ortex_tensor(other), do: other


  defp normalize_features(features) do
    # Extract and normalize each feature
    normalized = [
      normalize_value(features.momentum, :momentum),
      normalize_value(features.gravity, :gravity),
      normalize_value(features.kinetic_energy, :kinetic_energy),
      normalize_value(features.dist_to_peak_pct, :dist_to_peak_pct),
      normalize_value(features.dist_to_injection_pct, :dist_to_injection_pct),
      normalize_value(features.unrealized_pnl_pct || 0.0, :unrealized_pnl_pct)
    ]
    
    # Create Nx tensor with shape [1, 6] for batch inference
    if Code.ensure_loaded?(Nx) do
      normalized
      |> Nx.tensor(type: :f32)
      |> Nx.reshape({1, 6})
    else
      # Fallback for when Nx isn't available
      {:raw, normalized}
    end
  end

  defp normalize_value(value, feature_name) do
    config = @normalization_config[feature_name]
    
    # Clamp to bounds if configured
    value = if config.clip do
      value
      |> max(config.min)
      |> min(config.max)
    else
      value
    end
    
    # Normalize to [-1, 1] or [0, 1] range
    range = config.max - config.min
    if range > 0 do
      2.0 * (value - config.min) / range - 1.0
    else
      0.0
    end
  end

  defp decode_output(output) do
    # Output is expected to be softmax probabilities [hold, long, short]
    probabilities = case output do
                        # ✅ Ortex single-output (THIS IS YOUR CASE)
                        {%Nx.Tensor{} = t} ->
                            t
                            |> Nx.squeeze()
                            |> Nx.to_flat_list()

                        # Multi-output model (future-proof)
                        tuple when is_tuple(tuple) ->
                            tuple
                            |> Tuple.to_list()
                            |> List.first()
                            |> Nx.squeeze()
                            |> Nx.to_flat_list()

                        # Direct tensor (unlikely but safe)
                        %Nx.Tensor{} = t ->
                            t |> Nx.squeeze() |> Nx.to_flat_list()

                        # Raw list fallback
                        [list] when is_list(list) ->
                            list

                        list when is_list(list) ->
                            list

                        other ->
                            raise "Unexpected ONNX output: #{inspect(other)}"
                    end
    
    # Find argmax and confidence
    {max_prob, max_idx} = 
      probabilities
      |> Enum.with_index()
      |> Enum.max_by(fn {prob, _idx} -> prob end)
    
    action = @action_map[max_idx] || :hold
    
    {:ok, %{
      action: action,
      confidence: Float.round(max_prob, 4),
      mode: :inference,
      probabilities: %{
        hold: Enum.at(probabilities, 0, 0.0),
        long: Enum.at(probabilities, 1, 0.0),
        short: Enum.at(probabilities, 2, 0.0)
      }
    }}
  end

  # ============================================================================
  # Heuristic Engine (Physics Rules)
  # ============================================================================

  @doc """
  Physics-based heuristic for trading decisions.
  This is our battle-tested rule system that generates training data.
  """
  def run_heuristic(features) do
    momentum = features[:momentum] || features.momentum || 0.0
    gravity = features[:gravity] || features.gravity || 0.0001
    kinetic_energy = features[:kinetic_energy] || features.kinetic_energy || 0.0
    dist_to_peak = features[:dist_to_peak_pct] || features.dist_to_peak_pct || 0.0
    dist_to_injection = features[:dist_to_injection_pct] || features.dist_to_injection_pct || 0.0
    
    # Decision logic based on physics
    {action, confidence} = cond do
      # HIGH ENERGY INJECTION ZONE - Strong momentum with energy
      kinetic_energy > 100 and abs(momentum) > 0.3 ->
        if momentum > 0, do: {:long, 0.85 + min(kinetic_energy / 1000, 0.10)}, else: {:short, 0.85 + min(kinetic_energy / 1000, 0.10)}
      
      # NEAR PEAK - Price approaching predicted peak, prepare for reversal
      dist_to_peak < 0.005 and dist_to_peak > -0.005 and momentum > 0.1 ->
        {:hold, 0.70}  # Wait for confirmation
      
      # NEAR INJECTION - Good entry zone with momentum
      abs(dist_to_injection) < 0.01 and abs(momentum) > 0.2 ->
        if momentum > 0, do: {:long, 0.75}, else: {:short, 0.75}
      
      # STRONG MOMENTUM - Clear directional signal
      momentum > 0.5 ->
        {:long, 0.65 + momentum * 0.2}
      
      momentum < -0.5 ->
        {:short, 0.65 + abs(momentum) * 0.2}
      
      # MODERATE MOMENTUM with favorable gravity
      momentum > 0.2 and gravity < 0.002 ->
        {:long, 0.60}
      
      momentum < -0.2 and gravity < 0.002 ->
        {:short, 0.60}
      
      # WEAK SIGNAL - Hold
      true ->
        {:hold, 0.50}
    end
    
    # Apply gravity dampening for high gravity environments
    confidence = if gravity > 0.005 do
      confidence * 0.9  # Reduce confidence in high-gravity (volatile) conditions
    else
      confidence
    end
    
    %{
      action: action,
      confidence: Float.round(min(confidence, 0.99), 4),
      mode: :heuristic,
      reasoning: %{
        momentum_signal: momentum_signal(momentum),
        energy_level: energy_level(kinetic_energy),
        zone: zone_classification(dist_to_peak, dist_to_injection),
        gravity_regime: gravity_regime(gravity)
      }
    }
  end

  # Fast fallback for timeout scenarios (no logging, minimal computation)
  defp fast_heuristic_fallback(features) do
    momentum = features[:momentum] || features.momentum || 0.0
    
    action = cond do
      momentum > 0.3 -> :long
      momentum < -0.3 -> :short
      true -> :hold
    end
    
    %{
      action: action,
      confidence: 0.50,
      mode: :timeout_fallback,
      latency_us: 0
    }
  end

  defp momentum_signal(m) when m > 0.5, do: :strong_bullish
  defp momentum_signal(m) when m > 0.2, do: :bullish
  defp momentum_signal(m) when m < -0.5, do: :strong_bearish
  defp momentum_signal(m) when m < -0.2, do: :bearish
  defp momentum_signal(_), do: :neutral

  defp energy_level(ke) when ke > 500, do: :extreme
  defp energy_level(ke) when ke > 200, do: :high
  defp energy_level(ke) when ke > 50, do: :moderate
  defp energy_level(_), do: :low

  defp zone_classification(peak_dist, inj_dist) do
    cond do
      abs(peak_dist) < 0.01 -> :at_peak
      abs(inj_dist) < 0.01 -> :at_injection
      peak_dist > 0 -> :below_peak
      true -> :above_peak
    end
  end

  defp gravity_regime(g) when g > 0.005, do: :high_volatility
  defp gravity_regime(g) when g > 0.002, do: :moderate
  defp gravity_regime(_), do: :stable

  # ============================================================================
  # Training Data Management
  # ============================================================================

  defp flush_training_buffer do
    samples = :ets.take(:brain_training_buffer, :sample)
    
    if length(samples) > 0 do
      # Append to training data file
      data_dir = Path.join(:code.priv_dir(:trade_engine), "training_data")
      File.mkdir_p!(data_dir)
      
      filename = "samples_#{Date.to_iso8601(Date.utc_today())}.jsonl"
      filepath = Path.join(data_dir, filename)
      
      lines = Enum.map(samples, fn {:sample, sample} ->
        Jason.encode!(sample)
      end)
      
      File.write!(filepath, Enum.join(lines, "\n") <> "\n", [:append])
      
      Logger.debug("[Brain] Flushed #{length(samples)} training samples to #{filename}")
    end
  end
end