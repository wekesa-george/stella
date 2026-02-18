defmodule StellaAdmin.Auth.AdminUserRole do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key false
  @foreign_key_type :binary_id
  @schema_prefix "admin"

  schema "admin_user_roles" do
    field :admin_user_id, :binary_id, primary_key: true
    field :role_id, :binary_id, primary_key: true
    field :assigned_by, :binary_id
    field :assigned_at, :utc_datetime
    field :expires_at, :utc_datetime
  end

  def changeset(admin_user_role, attrs) do
    admin_user_role
    |> cast(attrs, [:admin_user_id, :role_id, :assigned_by, :assigned_at, :expires_at])
    |> validate_required([:admin_user_id, :role_id])
    |> foreign_key_constraint(:admin_user_id)
    |> foreign_key_constraint(:role_id)
    |> foreign_key_constraint(:assigned_by)
  end
end
