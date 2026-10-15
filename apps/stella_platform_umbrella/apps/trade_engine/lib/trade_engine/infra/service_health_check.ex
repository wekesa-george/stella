defmodule TradeEngine.Infra.ServiceHealthCheck do
  @moduledoc """
  Ecto schema for persisting service health check results.
  Table: platform.service_health_checks
  """

  use Ecto.Schema
  import Ecto.Changeset
  require Logger

  @schema_prefix "platform"
  @primary_key {:id, :binary_id, autogenerate: true}

  schema "service_health_checks" do
    field :service_name, :string
    field :category, :string
    field :environment, :string
    field :status, :string
    field :message, :string
    field :details, :map, default: %{}
    field :response_time_ms, :integer
    field :checked_at, :utc_datetime

    timestamps(type: :utc_datetime, inserted_at: :created_at, updated_at: false)
  end

  @required ~w(service_name category environment status checked_at)a
  @optional ~w(message details response_time_ms)a

  def changeset(struct \\ %__MODULE__{}, attrs) do
    struct
    |> cast(attrs, @required ++ @optional)
    |> validate_required(@required)
  end

  @doc "Insert a health check record. Never raises — logs and returns error on failure."
  def insert(attrs) do
    changeset(attrs)
    |> TradeEngine.Repo.insert()
    |> case do
      {:ok, record} ->
        {:ok, record}

      {:error, changeset} ->
        Logger.warning("Failed to persist health check: #{inspect(changeset.errors)}")
        {:error, changeset}
    end
  rescue
    e ->
      Logger.warning("Health check DB insert failed: #{Exception.message(e)}")
      {:error, :db_unavailable}
  end
end
