defmodule StellaAdmin.Auth.AdminRolePermission do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  @schema_prefix "admin"

  schema "admin_role_permissions" do
    belongs_to :role, StellaAdmin.Auth.AdminRole, foreign_key: :admin_role_id
    belongs_to :permission, StellaAdmin.Auth.AdminPermission, foreign_key: :admin_permission_id

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def changeset(admin_role_permission, attrs) do
    admin_role_permission
    |> cast(attrs, [:admin_role_id, :admin_permission_id])
    |> validate_required([:admin_role_id, :admin_permission_id])
    |> foreign_key_constraint(:admin_role_id)
    |> foreign_key_constraint(:admin_permission_id)
    |> unique_constraint([:admin_role_id, :admin_permission_id], name: :admin_role_permissions_admin_role_id_admin_permission_id_index)
  end
end
