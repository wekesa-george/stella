defmodule TradeEngine.Trading.EquitySnapshot do
  @moduledoc """
  Ecto schema for trading.equity_snapshots — records bot equity over time.
  Table already exists in DB; no migration needed.
  """

  use Ecto.Schema
  import Ecto.Changeset
  import Ecto.Query

  alias TradeEngine.Repo

  @schema_prefix "trading"
  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "equity_snapshots" do
    field :user_id, :binary_id
    field :total_equity_usd, :decimal
    field :available_balance_usd, :decimal
    field :unrealized_pnl_usd, :decimal
    field :realized_pnl_usd, :decimal
    field :open_positions, :integer, default: 0
    field :snapshot_source, :string
    field :high_water_mark_usd, :decimal
    field :drawdown_pct, :decimal
    field :snapshot_at, :utc_datetime

    belongs_to :bot, TradeEngine.Bots.Bot, foreign_key: :bot_id

    timestamps(type: :utc_datetime, inserted_at: :created_at, updated_at: false)
  end

  @cast_fields [
    :bot_id, :user_id, :total_equity_usd, :available_balance_usd,
    :unrealized_pnl_usd, :realized_pnl_usd, :open_positions,
    :snapshot_source, :high_water_mark_usd, :drawdown_pct, :snapshot_at
  ]

  def changeset(snapshot, attrs) do
    snapshot
    |> cast(attrs, @cast_fields)
    |> validate_required([:bot_id, :user_id, :total_equity_usd, :snapshot_source, :snapshot_at])
  end

  @doc "Insert a new equity snapshot row."
  def insert_snapshot(attrs) when is_map(attrs) do
    attrs = Map.put_new(attrs, :snapshot_at, DateTime.utc_now())

    %__MODULE__{}
    |> changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Query equity curve for a bot, ordered by snapshot_at ascending.

  Options:
    - :limit  — max rows (default 500)
    - :since  — DateTime, only snapshots after this time
  """
  def get_bot_curve(bot_id, opts \\ []) do
    limit = Keyword.get(opts, :limit, 500)
    since = Keyword.get(opts, :since)

    query =
      from(s in __MODULE__,
        where: s.bot_id == ^bot_id,
        order_by: [asc: s.snapshot_at],
        limit: ^limit
      )

    query =
      if since do
        from(s in query, where: s.snapshot_at > ^since)
      else
        query
      end

    Repo.all(query)
  end
end
