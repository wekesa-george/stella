defmodule TradeEngine.MarketData.Prediction do
  use Ecto.Schema
  import Ecto.Changeset

  @schema_prefix "trading"
  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "predictions" do
    field :run_id, :binary_id
    field :exchange, :string
    field :symbol, :string
    field :model_type, :string
    field :prediction_timestamp, :utc_datetime
    field :target_timestamp, :utc_datetime
    
    # Physics Metrics
    field :p0, :decimal
    field :v0, :float
    field :acceleration, :float
    field :r_squared, :float
    
    # Order Flow Metrics (NEW)
    field :order_flow_delta, :float # Net Buying Volume
    field :pressure_ratio, :float   # Buy / Total Ratio (0.0 to 1.0)

    # Outcomes
    field :predicted_signal, :string
    field :confidence, :float
    field :predicted_peak_price, :decimal
    field :predicted_dip_price, :decimal

    timestamps(type: :utc_datetime, inserted_at: :created_at)
  end

  def changeset(prediction, attrs) do
    prediction
    |> cast(attrs, [
      :run_id, :exchange, :symbol, :model_type, 
      :prediction_timestamp, :target_timestamp,
      :p0, :v0, :acceleration, :r_squared,
      :predicted_signal, :confidence,
      :predicted_peak_price, :predicted_dip_price,
      :order_flow_delta, :pressure_ratio # Added
    ])
    |> validate_required([:exchange, :symbol, :prediction_timestamp, :p0])
  end
end