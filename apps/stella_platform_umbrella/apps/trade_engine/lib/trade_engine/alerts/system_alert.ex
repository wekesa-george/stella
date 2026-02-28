defmodule TradeEngine.Alerts.SystemAlert do
  @moduledoc """
  Ecto schema for system/runtime alerts (service transitions, risk breaches, bot errors).
  Separate from user-configured trading.monitoring_alerts.
  Table: platform.system_alerts
  """

  use Ecto.Schema
  import Ecto.Changeset
  import Ecto.Query
  require Logger

  @schema_prefix "platform"
  @primary_key {:id, :binary_id, autogenerate: true}

  schema "system_alerts" do
    field :alert_type, :string
    field :category, :string
    field :severity, :string
    field :title, :string
    field :message, :string
    field :metadata, :map, default: %{}
    field :source, :string
    field :acknowledged, :boolean, default: false
    field :acknowledged_at, :utc_datetime
    field :acknowledged_by, :string

    timestamps(type: :utc_datetime, inserted_at: :created_at, updated_at: :updated_at)
  end

  @required ~w(alert_type category severity title message)a
  @optional ~w(metadata source acknowledged acknowledged_at acknowledged_by)a

  def changeset(struct \\ %__MODULE__{}, attrs) do
    struct
    |> cast(attrs, @required ++ @optional)
    |> validate_required(@required)
    |> validate_inclusion(:severity, ~w(info warning critical))
  end

  @doc "Insert a system alert. Never raises."
  def insert(attrs) do
    changeset(attrs)
    |> TradeEngine.Repo.insert()
    |> case do
      {:ok, record} -> {:ok, record}
      {:error, cs} ->
        Logger.warning("Failed to persist system alert: #{inspect(cs.errors)}")
        {:error, cs}
    end
  rescue
    e ->
      Logger.warning("System alert DB insert failed: #{Exception.message(e)}")
      {:error, :db_unavailable}
  end

  @doc "Acknowledge an alert by ID."
  def acknowledge(alert_id, acknowledged_by \\ "system") do
    case TradeEngine.Repo.get(__MODULE__, alert_id) do
      nil ->
        {:error, :not_found}

      alert ->
        alert
        |> change(%{
          acknowledged: true,
          acknowledged_at: DateTime.utc_now() |> DateTime.truncate(:second),
          acknowledged_by: acknowledged_by
        })
        |> TradeEngine.Repo.update()
    end
  rescue
    e ->
      Logger.warning("System alert acknowledge failed: #{Exception.message(e)}")
      {:error, :db_unavailable}
  end

  @doc "Returns the last `limit` unacknowledged alerts, newest first."
  def recent(limit \\ 50) do
    __MODULE__
    |> where([a], a.acknowledged == false)
    |> order_by([a], desc: a.created_at)
    |> limit(^limit)
    |> TradeEngine.Repo.all()
  rescue
    e ->
      Logger.warning("System alert query failed: #{Exception.message(e)}")
      []
  end

  @doc "Returns the last `limit` alerts regardless of acknowledgment status."
  def recent_all(limit \\ 100) do
    __MODULE__
    |> order_by([a], desc: a.created_at)
    |> limit(^limit)
    |> TradeEngine.Repo.all()
  rescue
    e ->
      Logger.warning("System alert query failed: #{Exception.message(e)}")
      []
  end
end
