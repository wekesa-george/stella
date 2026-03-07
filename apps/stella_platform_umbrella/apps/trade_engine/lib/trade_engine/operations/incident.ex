defmodule TradeEngine.Operations.Incident do
  @moduledoc """
  Ecto schema for operations.incidents — formal incident records.
  Auto-created by IncidentManager for P1/P2 alerts, or manually by operators.
  """

  use Ecto.Schema
  import Ecto.Changeset
  import Ecto.Query

  alias TradeEngine.Repo

  @schema_prefix "operations"
  @primary_key {:id, :binary_id, autogenerate: true}

  schema "incidents" do
    field :incident_number, :string
    field :shift_id, :binary_id
    field :operator_id, :binary_id
    field :date, :date
    field :time_detected, :time
    field :shift_type, :string
    field :priority, :string
    field :category, :string
    field :bot_ref, :string
    field :account_ref, :string
    field :title, :string
    field :description, :string
    field :action_taken, :string
    field :supervisor_notified, :boolean, default: false
    field :supervisor_id, :binary_id
    field :supervisor_notified_at, :utc_datetime
    field :supervisor_countersigned_by, :binary_id
    field :supervisor_countersigned_at, :utc_datetime
    field :time_to_contain_mins, :integer
    field :time_to_resolve_mins, :integer
    field :status, :string, default: "open"
    field :escalated_to, :string
    field :pnl_impact_usd, :decimal, default: Decimal.new(0)
    field :kill_switch_activated, :boolean, default: false
    field :root_cause, :string
    field :preventable, :string
    field :notes, :string
    field :corrects_incident_id, :binary_id
    field :is_correction, :boolean, default: false
    field :archived_at, :utc_datetime
    field :archived_by, :binary_id
    field :archive_month, :string
    field :source_alert_id, :binary_id

    timestamps(type: :utc_datetime, inserted_at: :created_at, updated_at: :updated_at)
  end

  @cast_fields [
    :incident_number, :shift_id, :operator_id, :date, :time_detected,
    :shift_type, :priority, :category, :bot_ref, :account_ref,
    :title, :description, :action_taken, :supervisor_notified,
    :supervisor_id, :supervisor_notified_at, :supervisor_countersigned_by,
    :supervisor_countersigned_at, :time_to_contain_mins, :time_to_resolve_mins,
    :status, :escalated_to, :pnl_impact_usd, :kill_switch_activated,
    :root_cause, :preventable, :notes, :corrects_incident_id,
    :is_correction, :archived_at, :archived_by, :archive_month,
    :source_alert_id
  ]

  def changeset(incident, attrs) do
    incident
    |> cast(attrs, @cast_fields)
    |> validate_required([:incident_number, :priority, :category, :title, :status, :date])
    |> validate_inclusion(:priority, ~w(P1 P2 P3 P4))
    |> validate_inclusion(:status, ~w(open escalated resolved))
  end

  @doc "Generate next incident number for the current year (INC-YYYY-NNNN)."
  def next_incident_number do
    year = Date.utc_today().year

    case Repo.query(
      "UPDATE operations.incident_counters SET last_number = last_number + 1 WHERE year = $1 RETURNING last_number",
      [year]
    ) do
      {:ok, %{rows: [[num]]}} ->
        "INC-#{year}-#{String.pad_leading(to_string(num), 4, "0")}"

      _ ->
        # First incident of the year — insert counter row
        Repo.query(
          "INSERT INTO operations.incident_counters (year, last_number) VALUES ($1, 1) ON CONFLICT (year) DO UPDATE SET last_number = operations.incident_counters.last_number + 1 RETURNING last_number",
          [year]
        )
        |> case do
          {:ok, %{rows: [[num]]}} ->
            "INC-#{year}-#{String.pad_leading(to_string(num), 4, "0")}"
          _ ->
            "INC-#{year}-#{:rand.uniform(9999)}"
        end
    end
  end

  @doc "Insert a new incident."
  def create(attrs) when is_map(attrs) do
    attrs = Map.put_new(attrs, :date, Date.utc_today())
    attrs = Map.put_new_lazy(attrs, :incident_number, &next_incident_number/0)

    %__MODULE__{}
    |> changeset(attrs)
    |> Repo.insert()
  end

  @doc "Update an existing incident."
  def update(id, attrs) when is_binary(id) and is_map(attrs) do
    case Repo.get(__MODULE__, id) do
      nil -> {:error, :not_found}
      incident ->
        # Convert string keys to atoms for changeset
        atom_attrs = for {k, v} <- attrs, into: %{} do
          key = if is_binary(k), do: String.to_existing_atom(k), else: k
          {key, v}
        end

        incident
        |> changeset(atom_attrs)
        |> Repo.update()
    end
  end

  @doc "List open/escalated incidents."
  def list_open(limit \\ 50) do
    __MODULE__
    |> where([i], i.status in ["open", "escalated"])
    |> order_by([i], desc: i.created_at)
    |> limit(^limit)
    |> Repo.all()
  end

  @doc "List all incidents for a month (YYYY-MM format)."
  def list_by_month(month, limit \\ 100) do
    {year, mon} = parse_month(month)
    start_date = Date.new!(year, mon, 1)
    end_date = Date.end_of_month(start_date)

    __MODULE__
    |> where([i], i.date >= ^start_date and i.date <= ^end_date)
    |> order_by([i], desc: i.created_at)
    |> limit(^limit)
    |> Repo.all()
  end

  @doc "List recent incidents (all statuses)."
  def list_recent(limit \\ 50) do
    __MODULE__
    |> order_by([i], desc: i.created_at)
    |> limit(^limit)
    |> Repo.all()
  end

  @doc "Check if an incident already exists for a given alert."
  def exists_for_alert?(alert_id) do
    __MODULE__
    |> where([i], i.source_alert_id == ^alert_id)
    |> Repo.exists?()
  end

  defp parse_month(month) when is_binary(month) do
    case String.split(month, "-") do
      [y, m] -> {String.to_integer(y), String.to_integer(m)}
      _ -> {Date.utc_today().year, Date.utc_today().month}
    end
  end
end
