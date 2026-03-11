defmodule TradeEngine.AI.TradeClassifier do
  @moduledoc """
  Pre-trade filter using a GradientBoosting classifier trained on 12 months
  of backtest data across 6 pairs (ETHUSDT, BTCUSDT, SOLUSDT, BNBUSDT, XRPUSDT, DOGEUSDT).

  The model predicts win probability for a proposed trade given 19 physics + derived features.
  Trades below the confidence threshold are blocked before execution.

  ## Architecture

  ```
  Raw physics features (from signal + strategy)
      ↓
  Feature engineering (derived: sl_distance, rr_ratio, etc.)
      ↓
  StandardScaler normalization (mean/scale from training)
      ↓
  ONNX inference via Ortex (GradientBoosting classifier)
      ↓
  {win_probability, prediction} → should_trade? gate
  ```

  ## Usage

      case TradeClassifier.should_trade?(features) do
        {:ok, %{prediction: 1, win_probability: 0.72}} -> execute_trade(...)
        {:ok, %{prediction: 0, win_probability: 0.35}} -> skip (model says likely loss)
        {:error, _} -> execute anyway (fail-open)
      end
  """

  use GenServer
  require Logger

  @model_path "models/trade_classifier.onnx"
  @scaler_path "models/trade_classifier_scaler.json"

  # Minimum win probability to allow a trade (tunable)
  @default_min_win_prob 0.55

  # Categorical encodings matching ml_trainer.py
  @direction_map %{"long" => 1, :long => 1, "short" => 0, :short => 0}
  @energy_state_map %{"high" => 2, :high => 2, "medium" => 1, :medium => 1, "low" => 0, :low => 0}
  @regime_map %{
    "trending_up" => 2, :trending_up => 2,
    "trending_down" => 1, :trending_down => 1,
    "volatile" => 0, :volatile => 0,
    "ranging" => -1, :ranging => -1,
    "unknown" => 0, :unknown => 0
  }

  # ---------------------------------------------------------------------------
  # CLIENT API
  # ---------------------------------------------------------------------------

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Predict whether a trade will win based on physics features.

  Returns `{:ok, %{prediction: 0|1, win_probability: float, should_trade: bool}}`
  or `{:error, reason}` if model not loaded (fail-open: caller should proceed).

  ## Required features (map keys):
    - confidence, momentum, gravity, atr_pct, momentum_acceleration
    - trajectory_angle, kinetic_energy, entry_price, stop_loss, impulse_target
    - position_value, direction, energy_state, regime
  """
  def predict(features, opts \\ []) do
    min_prob = Keyword.get(opts, :min_win_prob, @default_min_win_prob)

    try do
      GenServer.call(__MODULE__, {:predict, features, min_prob}, 1_000)
    catch
      :exit, _ -> {:error, :timeout}
    end
  end

  @doc """
  Quick gate check — returns :ok or {:blocked, reason}.
  Fail-open: if model isn't loaded or errors, returns :ok.
  """
  def should_trade?(features, opts \\ []) do
    case predict(features, opts) do
      {:ok, %{should_trade: true}} -> :ok
      {:ok, %{should_trade: false, win_probability: prob}} ->
        {:blocked, "classifier win_prob=#{Float.round(prob, 3)} below threshold"}
      {:error, _} -> :ok  # Fail-open
    end
  end

  @doc "Get classifier stats for dashboard"
  def stats do
    try do
      GenServer.call(__MODULE__, :stats, 1_000)
    catch
      :exit, _ -> %{status: "unavailable"}
    end
  end

  @doc "Hot-reload the model"
  def reload do
    GenServer.call(__MODULE__, :reload)
  end

  # ---------------------------------------------------------------------------
  # GENSERVER
  # ---------------------------------------------------------------------------

  @impl true
  def init(_opts) do
    state = %{
      model: nil,
      scaler_mean: nil,
      scaler_scale: nil,
      feature_names: nil,
      loaded: false,
      predictions: 0,
      trades_allowed: 0,
      trades_blocked: 0,
      started_at: DateTime.utc_now()
    }

    state = load_model(state)
    {:ok, state}
  end

  @impl true
  def handle_call({:predict, features, min_prob}, _from, %{loaded: false} = state) do
    {:reply, {:error, :model_not_loaded}, state}
  end

  def handle_call({:predict, features, min_prob}, _from, state) do
    result = run_prediction(features, min_prob, state)

    new_state = case result do
      {:ok, %{should_trade: true}} ->
        %{state | predictions: state.predictions + 1, trades_allowed: state.trades_allowed + 1}
      {:ok, %{should_trade: false}} ->
        %{state | predictions: state.predictions + 1, trades_blocked: state.trades_blocked + 1}
      _ ->
        %{state | predictions: state.predictions + 1}
    end

    {:reply, result, new_state}
  end

  def handle_call(:stats, _from, state) do
    total = state.trades_allowed + state.trades_blocked
    block_rate = if total > 0, do: Float.round(state.trades_blocked / total * 100, 1), else: 0.0

    stats = %{
      status: if(state.loaded, do: "active", else: "not_loaded"),
      model_loaded: state.loaded,
      total_predictions: state.predictions,
      trades_allowed: state.trades_allowed,
      trades_blocked: state.trades_blocked,
      block_rate_pct: block_rate,
      feature_count: if(state.feature_names, do: length(state.feature_names), else: 0),
      uptime_seconds: DateTime.diff(DateTime.utc_now(), state.started_at)
    }

    {:reply, stats, state}
  end

  def handle_call(:reload, _from, state) do
    new_state = load_model(state)
    {:reply, :ok, new_state}
  end

  # ---------------------------------------------------------------------------
  # MODEL LOADING
  # ---------------------------------------------------------------------------

  defp load_model(state) do
    priv_dir = :code.priv_dir(:trade_engine)
    model_path = Path.join(priv_dir, @model_path)
    scaler_path = Path.join(priv_dir, @scaler_path)

    with true <- File.exists?(model_path),
         true <- File.exists?(scaler_path),
         {:ok, scaler_json} <- File.read(scaler_path),
         {:ok, scaler_data} <- Jason.decode(scaler_json),
         {:ok, model} <- load_onnx(model_path) do

      mean = scaler_data["mean"]
      scale = scaler_data["scale"]
      names = scaler_data["feature_names"]

      Logger.info("[TradeClassifier] Model loaded: #{length(names)} features, GradientBoosting classifier")

      %{state |
        model: model,
        scaler_mean: mean,
        scaler_scale: scale,
        feature_names: names,
        loaded: true
      }
    else
      error ->
        Logger.warning("[TradeClassifier] Model not loaded: #{inspect(error)} — running in pass-through mode")
        %{state | loaded: false}
    end
  end

  defp load_onnx(path) do
    if Code.ensure_loaded?(Ortex) do
      case Ortex.load(path) do
        {:ok, model} -> {:ok, model}
        model when is_struct(model) -> {:ok, model}
        {:error, reason} -> {:error, reason}
        other -> {:error, {:unexpected, other}}
      end
    else
      {:error, :ortex_not_available}
    end
  rescue
    e -> {:error, {:load_exception, Exception.message(e)}}
  end

  # ---------------------------------------------------------------------------
  # PREDICTION
  # ---------------------------------------------------------------------------

  defp run_prediction(features, min_prob, state) do
    # 1. Build raw feature vector matching training order
    raw = build_feature_vector(features, state.feature_names)

    # 2. Apply StandardScaler: (x - mean) / scale
    scaled = scale_features(raw, state.scaler_mean, state.scaler_scale)

    # 3. Create Nx tensor [1, 19]
    tensor = Nx.tensor([scaled], type: :f32) |> Nx.backend_transfer(Nx.BinaryBackend)

    # 4. Run ONNX inference
    output = Ortex.run(state.model, tensor)

    # 5. Parse output — sklearn ONNX outputs: {labels, probabilities}
    parse_classifier_output(output, min_prob)
  rescue
    e ->
      Logger.warning("[TradeClassifier] Prediction error: #{Exception.message(e)}")
      {:error, {:prediction_failed, Exception.message(e)}}
  end

  defp build_feature_vector(features, feature_names) do
    Enum.map(feature_names, fn name ->
      case name do
        "confidence" -> get_num(features, :confidence, 65)
        "momentum" -> get_num(features, :momentum, 0)
        "gravity" -> get_num(features, :gravity, 0)
        "atr_pct" -> get_num(features, :atr_pct, 0.003)
        "momentum_acceleration" -> get_num(features, :momentum_acceleration, 0)
        "trajectory_angle" -> get_num(features, :trajectory_angle, 0)
        "kinetic_energy" -> get_num(features, :kinetic_energy, 0)
        "entry_price" -> get_num(features, :entry_price, 0)
        "stop_loss" -> get_num(features, :stop_loss, 0)
        "impulse_target" -> get_num(features, :impulse_target, 0)
        "position_value" -> get_num(features, :position_value, 0)

        # Categorical encodings
        "direction" ->
          dir = features[:direction] || features["direction"] || :long
          Map.get(@direction_map, dir, 1) * 1.0

        "energy_state" ->
          es = features[:energy_state] || features["energy_state"] || :medium
          Map.get(@energy_state_map, es, 1) * 1.0

        "regime" ->
          r = features[:regime] || features["regime"] || :unknown
          Map.get(@regime_map, r, 0) * 1.0

        # Derived features — compute from raw features
        "sl_distance_pct" ->
          entry = get_num(features, :entry_price, 1)
          sl = get_num(features, :stop_loss, entry)
          if entry > 0, do: abs(entry - sl) / entry, else: 0.0

        "tp_distance_pct" ->
          entry = get_num(features, :entry_price, 1)
          tp = get_num(features, :impulse_target, entry)
          if entry > 0, do: abs(tp - entry) / entry, else: 0.0

        "rr_ratio" ->
          entry = get_num(features, :entry_price, 1)
          sl = get_num(features, :stop_loss, entry)
          tp = get_num(features, :impulse_target, entry)
          sl_dist = if entry > 0, do: abs(entry - sl) / entry, else: 0.001
          tp_dist = if entry > 0, do: abs(tp - entry) / entry, else: 0.001
          if sl_dist > 0, do: tp_dist / sl_dist, else: 1.0

        "momentum_atr_ratio" ->
          mom = abs(get_num(features, :momentum, 0))
          atr = max(get_num(features, :atr_pct, 0.001), 0.0001)
          mom / atr

        "mom_gravity_ratio" ->
          mom = abs(get_num(features, :momentum, 0))
          grav = max(abs(get_num(features, :gravity, 0)), 0.00001)
          mom / grav

        _ -> 0.0
      end
    end)
  end

  defp scale_features(raw, mean, scale) do
    Enum.zip([raw, mean, scale])
    |> Enum.map(fn {x, m, s} ->
      if s > 0, do: (x - m) / s, else: 0.0
    end)
  end

  defp parse_classifier_output(output, min_prob) do
    # sklearn ONNX outputs: {labels_tensor, probabilities_tensor}
    # labels: [0] or [1]
    # probabilities: [{0: p0, 1: p1}] — stored as a sequence of maps in ONNX
    case output do
      {labels, probs} ->
        label = labels |> Nx.squeeze() |> Nx.to_number()

        # Probabilities from sklearn ONNX come as a map sequence
        # In Ortex they may come as a tensor of shape [1, 2]
        win_prob = extract_win_probability(probs)

        {:ok, %{
          prediction: label,
          win_probability: Float.round(win_prob, 4),
          should_trade: win_prob >= min_prob
        }}

      other ->
        Logger.warning("[TradeClassifier] Unexpected output format: #{inspect(other)}")
        {:error, :unexpected_output}
    end
  end

  defp extract_win_probability(probs) do
    # Ortex may return this as various formats depending on the ONNX operator
    cond do
      is_struct(probs, Nx.Tensor) ->
        # Tensor of shape [1, 2] — index 1 is win probability
        probs |> Nx.squeeze() |> Nx.to_flat_list() |> Enum.at(1, 0.5)

      is_list(probs) ->
        # List of maps: [%{0 => 0.3, 1 => 0.7}]
        case List.first(probs) do
          %{1 => p} -> p
          _ -> 0.5
        end

      is_tuple(probs) ->
        # Nested tuple from Ortex
        probs
        |> Tuple.to_list()
        |> List.first()
        |> then(fn
          %Nx.Tensor{} = t -> t |> Nx.squeeze() |> Nx.to_flat_list() |> Enum.at(1, 0.5)
          other -> Logger.warning("[TradeClassifier] Unknown prob format: #{inspect(other)}"); 0.5
        end)

      true ->
        0.5
    end
  rescue
    _ -> 0.5
  end

  defp get_num(features, key, default) do
    val = features[key] || features[to_string(key)]
    case val do
      nil -> default * 1.0
      %Decimal{} = d -> Decimal.to_float(d)
      n when is_number(n) -> n * 1.0
      s when is_binary(s) ->
        case Float.parse(s) do
          {f, _} -> f
          :error -> default * 1.0
        end
      _ -> default * 1.0
    end
  end
end
