defmodule TradeEngine.Bots.BotStateTransition do
  @moduledoc """
  Ecto schema for bot state transition history records.
  Maps to trading.bot_state_transitions.
  """

  use Ecto.Schema
  import Ecto.Changeset

  @schema_prefix "trading"
  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "bot_state_transitions" do
    field :bot_id, :binary_id
    field :from_status, :string
    field :to_status, :string
    field :trigger, :string
    field :reason, :string
    field :metadata, :map, default: %{}
    field :triggered_by, :string
    field :transitioned_at, :utc_datetime
  end

  @required_fields [:bot_id, :from_status, :to_status]
  @optional_fields [:trigger, :reason, :metadata, :triggered_by, :transitioned_at]

  def changeset(transition, attrs) do
    transition
    |> cast(attrs, @required_fields ++ @optional_fields)
    |> validate_required(@required_fields)
    |> put_default_transitioned_at()
  end

  defp put_default_transitioned_at(changeset) do
    if get_field(changeset, :transitioned_at) do
      changeset
    else
      put_change(changeset, :transitioned_at, DateTime.utc_now() |> DateTime.truncate(:second))
    end
  end
end
