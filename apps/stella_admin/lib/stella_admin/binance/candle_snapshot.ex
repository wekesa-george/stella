defmodule StellaAdmin.Binance.CandleSnapshot do
  @moduledoc """
  Schema for storing historical candlestick data snapshots.
  Used for analytics and long-term chart data beyond the cache window.
  """
  use Ecto.Schema
  import Ecto.Changeset
  import Ecto.Query

  alias StellaAdmin.Repo

  schema "candle_snapshots" do
    field :pair, :string
    field :interval, :string
    field :open_time, :utc_datetime
    field :open, :decimal
    field :high, :decimal
    field :low, :decimal
    field :close, :decimal
    field :volume, :decimal
    field :close_time, :utc_datetime

    timestamps(type: :utc_datetime)
  end

  @doc false
  def changeset(candle_snapshot, attrs) do
    candle_snapshot
    |> cast(attrs, [
      :pair,
      :interval,
      :open_time,
      :open,
      :high,
      :low,
      :close,
      :volume,
      :close_time
    ])
    |> validate_required([
      :pair,
      :interval,
      :open_time,
      :open,
      :high,
      :low,
      :close,
      :volume,
      :close_time
    ])
    |> validate_inclusion(:interval, ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"])
    |> unique_constraint([:pair, :interval, :open_time])
  end

  @doc """
  Store candles in the database.
  """
  def insert_candles(candles) when is_list(candles) do
    now = DateTime.utc_now()

    entries =
      Enum.map(candles, fn candle ->
        %{
          pair: candle.pair,
          interval: candle.interval,
          open_time: candle.open_time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
          close_time: candle.close_time,
          inserted_at: now,
          updated_at: now
        }
      end)

    Repo.insert_all(__MODULE__, entries,
      on_conflict: :replace_all,
      conflict_target: [:pair, :interval, :open_time]
    )
  end

  @doc """
  Get candles for a specific pair and interval within a time range.
  """
  def get_candles(pair, interval, start_time, end_time) do
    from(c in __MODULE__,
      where: c.pair == ^pair,
      where: c.interval == ^interval,
      where: c.open_time >= ^start_time,
      where: c.open_time <= ^end_time,
      order_by: [asc: c.open_time]
    )
    |> Repo.all()
  end

  @doc """
  Get the latest candle for a pair and interval.
  """
  def get_latest(pair, interval) do
    from(c in __MODULE__,
      where: c.pair == ^pair,
      where: c.interval == ^interval,
      order_by: [desc: c.open_time],
      limit: 1
    )
    |> Repo.one()
  end

  @doc """
  Delete old candles beyond retention period (e.g., older than 30 days).
  """
  def delete_old_candles(days_to_keep \\ 30) do
    cutoff_date = DateTime.utc_now() |> DateTime.add(-days_to_keep * 24 * 60 * 60, :second)

    from(c in __MODULE__,
      where: c.open_time < ^cutoff_date
    )
    |> Repo.delete_all()
  end
end
