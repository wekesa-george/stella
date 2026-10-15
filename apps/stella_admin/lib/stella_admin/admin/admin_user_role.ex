defmodule StellaAdmin.Admin.AdminUserRole do
  @moduledoc """
  Schema for admin.admin_user_roles table in the stella_platform_new database.
  Junction table linking admin users to their assigned roles.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @foreign_key_type :binary_id
  @schema_prefix "admin"
  @primary_key false

  schema "admin_user_roles" do
    field :admin_user_id, :binary_id, primary_key: true
    field :role_id, :binary_id, primary_key: true
    field :assigned_by, :binary_id
    field :assigned_at, :utc_datetime
    field :expires_at, :utc_datetime
  end

  @doc false
  def changeset(admin_user_role, attrs) do
    admin_user_role
    |> cast(attrs, [:admin_user_id, :role_id, :assigned_by, :assigned_at, :expires_at])
    |> validate_required([:admin_user_id, :role_id, :assigned_at])
  end
end
