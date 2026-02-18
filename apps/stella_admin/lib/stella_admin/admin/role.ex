defmodule StellaAdmin.Admin.Role do
  @moduledoc """
  Schema for admin.roles table in the stella_platform_new database.
  Represents admin roles for RBAC (Role-Based Access Control).
  """
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  @schema_prefix "admin"

  schema "roles" do
    field :code, Ecto.Enum,
      values: [
        :super_admin,
        :operations_manager,
        :risk_officer,
        :compliance_officer,
        :support_agent,
        :finance_manager,
        :strategy_curator
      ]

    field :name, :string
    field :description, :string
    field :is_system, :boolean, default: true
    field :is_active, :boolean, default: true
    field :hierarchy_level, :integer

    field :created_at, :utc_datetime
    field :updated_at, :utc_datetime
  end

  @doc false
  def changeset(role, attrs) do
    role
    |> cast(attrs, [:code, :name, :description, :is_system, :is_active, :hierarchy_level])
    |> validate_required([:code, :name])
    |> unique_constraint(:code)
  end
end
