defmodule SysAdmin.Strategies.Strategy do
  @moduledoc """
  Ecto schema for strategy.strategies table.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @schema_prefix "strategy"
  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "strategies" do
    field :name, :string
    field :description, :string
    field :class_module, :string
    field :type, :string
    field :status, :string, default: "active"
    field :version, :integer, default: 1
    field :is_core, :boolean, default: false
    field :is_public, :boolean, default: false
    field :is_backtest_enabled, :boolean, default: false
    field :is_live_enabled, :boolean, default: false

    # JSONB config fields
    field :config, :map, default: %{}
    field :entry_conditions, {:array, :map}, default: []
    field :exit_conditions, {:array, :map}, default: []
    field :position_sizing, :map, default: %{}
    field :indicators, {:array, :map}, default: []

    # Risk defaults
    field :default_stop_loss_pct, :decimal
    field :default_take_profit_pct, :decimal
    field :max_position_size_pct, :decimal

    # Pair/exchange support
    field :supported_pairs, {:array, :string}, default: []
    field :supported_exchanges, {:array, :string}, default: []
    field :timeframe, :string

    # Metadata
    field :metadata, :map, default: %{}

    timestamps(type: :utc_datetime, inserted_at: :created_at)
  end

  @cast_fields [
    :name, :description, :class_module, :type, :status, :version,
    :is_core, :is_public, :is_backtest_enabled, :is_live_enabled,
    :config, :entry_conditions, :exit_conditions, :position_sizing, :indicators,
    :default_stop_loss_pct, :default_take_profit_pct, :max_position_size_pct,
    :supported_pairs, :supported_exchanges, :timeframe, :metadata
  ]

  def changeset(strategy, attrs) do
    strategy
    |> cast(attrs, @cast_fields)
    |> validate_required([:name, :type])
    |> validate_inclusion(:type, [
      "core_momentum", "core_grid", "core_dca",
      "core_mean_reversion", "core_trend_following", "core_arbitrage",
      "custom_rule_based", "custom_config"
    ])
    |> validate_inclusion(:status, ["draft", "active", "paused", "archived"])
    |> unique_constraint(:name)
  end
end
