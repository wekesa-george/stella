defmodule StellaAdmin.Auth.AdminRole do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  @schema_prefix "admin"

  schema "admin_roles" do
    field :code, :string
    field :name, :string
    field :description, :string
    field :is_super_admin, :boolean, default: false

    has_many :role_permissions, StellaAdmin.Auth.AdminRolePermission
    has_many :permissions, through: [:role_permissions, :permission]
    has_many :user_roles, StellaAdmin.Auth.AdminUserRole

    timestamps(type: :utc_datetime)
  end

  def changeset(admin_role, attrs) do
    admin_role
    |> cast(attrs, [:code, :name, :description, :is_super_admin])
    |> validate_required([:code, :name])
    |> unique_constraint(:code)
  end
end
