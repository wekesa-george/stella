defmodule TradeEngine.AI.Supervisor do
  @moduledoc """
  Supervisor for the AI/RL Brain subsystem.

  ## Supervision Tree

  ```
  TradeEngine.AI.Supervisor
  ├── TradeEngine.AI.Brain           (GenServer - main decision engine)
  └── TradeEngine.AI.TrainingWorker  (GenServer - async training data processing)
  ```

  The Brain is configured with `:permanent` restart strategy to ensure
  continuous operation. Training data collection is `:transient`.
  """

  use Supervisor
  require Logger

  def start_link(opts \\ []) do
    Supervisor.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    Logger.info("[AI.Supervisor] 🧠 Starting AI subsystem...")

    children = [
      # Main RL Brain - critical for trading decisions
      {TradeEngine.AI.Brain, []},
      
      # Training data worker - processes samples in background
      {TradeEngine.AI.TrainingWorker, []}
    ]

    # One-for-one: if Brain crashes, only restart Brain (not training worker)
    Supervisor.init(children, strategy: :one_for_one)
  end

  @doc """
  Check health of AI subsystem.
  """
  def health_check do
    brain_status = TradeEngine.AI.Brain.status()
    
    %{
      healthy: brain_status.mode in [:inference, :heuristic],
      brain: brain_status,
      supervisor: %{
        children: Supervisor.count_children(__MODULE__)
      }
    }
  end
end