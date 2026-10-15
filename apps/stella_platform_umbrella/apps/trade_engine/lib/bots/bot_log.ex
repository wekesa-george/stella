defmodule TradeEngine.Bots.BotLog do
  @moduledoc """
  Ecto schema and query helpers for per-bot structured logs.

  Logs are stored in `trading.bot_logs` and provide a persistent,
  queryable record of bot lifecycle events, signals, trades, and errors.
  """

  use Ecto.Schema
  import Ecto.Query

  alias TradeEngine.Repo

  @schema_prefix "trading"
  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "bot_logs" do
    field :bot_id, :binary_id
    field :level, :string
    field :category, :string
    field :message, :string
    field :metadata, :map, default: %{}
    field :created_at, :utc_datetime
  end

  @valid_levels ~w(debug info warning error)
  @valid_categories ~w(lifecycle signal trade exit risk error system)

  def changeset(log, attrs) do
    log
    |> Ecto.Changeset.cast(attrs, [:bot_id, :level, :category, :message, :metadata, :created_at])
    |> Ecto.Changeset.validate_required([:bot_id, :level, :category, :message])
    |> Ecto.Changeset.validate_inclusion(:level, @valid_levels)
    |> Ecto.Changeset.validate_inclusion(:category, @valid_categories)
  end

  @doc """
  Query logs for a bot with optional filters.

  ## Options
    * `:limit` — max entries (default 100)
    * `:level` — filter by level (e.g. "error")
    * `:category` — filter by category (e.g. "trade")
    * `:before` — only entries before this DateTime
  """
  def query_logs(bot_id, opts \\ []) do
    limit = Keyword.get(opts, :limit, 100)
    level = Keyword.get(opts, :level)
    category = Keyword.get(opts, :category)
    before = Keyword.get(opts, :before)

    from(l in __MODULE__,
      where: l.bot_id == ^bot_id,
      order_by: [desc: l.created_at],
      limit: ^limit
    )
    |> maybe_filter(:level, level)
    |> maybe_filter(:category, category)
    |> maybe_before(before)
    |> Repo.all()
  end

  @doc "Batch-insert a list of log entry maps. Returns {count, nil}."
  def insert_batch([]), do: {0, nil}

  def insert_batch(entries) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    rows =
      Enum.map(entries, fn entry ->
        %{
          id: Ecto.UUID.generate(),
          bot_id: entry.bot_id,
          level: to_string(entry.level),
          category: to_string(entry.category),
          message: entry.message,
          metadata: entry.metadata || %{},
          created_at: entry[:created_at] || now
        }
      end)

    Repo.insert_all(__MODULE__, rows)
  end

  @doc "Delete logs older than `days` days. Returns {count, nil}."
  def cleanup(days \\ 30) do
    cutoff = DateTime.utc_now() |> DateTime.add(-days * 86_400, :second) |> DateTime.truncate(:second)

    from(l in __MODULE__, where: l.created_at < ^cutoff)
    |> Repo.delete_all()
  end

  # -- Private helpers --

  defp maybe_filter(query, _field, nil), do: query
  defp maybe_filter(query, :level, level), do: where(query, [l], l.level == ^level)
  defp maybe_filter(query, :category, cat), do: where(query, [l], l.category == ^cat)

  defp maybe_before(query, nil), do: query
  defp maybe_before(query, dt), do: where(query, [l], l.created_at < ^dt)
end
