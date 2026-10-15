defmodule StellaAdmin.Admin.RolePermission do
  @moduledoc """
  Schema for admin.role_permissions table in the stella_platform_new database.
  Junction table linking roles to their assigned permissions.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @foreign_key_type :binary_id
  @schema_prefix "admin"
  @primary_key false

  schema "role_permissions" do
    field :role_id, :binary_id, primary_key: true
    field :permission_id, :binary_id, primary_key: true
    field :granted_by, :binary_id
    field :granted_at, :utc_datetime
  end

  @doc false
  def changeset(role_permission, attrs) do
    role_permission
    |> cast(attrs, [:role_id, :permission_id, :granted_by, :granted_at])
    |> validate_required([:role_id, :permission_id, :granted_at])
  end
end
