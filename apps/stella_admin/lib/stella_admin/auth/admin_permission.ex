defmodule StellaAdmin.Auth.AdminPermission do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  @schema_prefix "admin"

  schema "admin_permissions" do
    field :code, :string
    field :name, :string
    field :description, :string
    field :category, :string
    field :is_sensitive, :boolean, default: false

    has_many :role_permissions, StellaAdmin.Auth.AdminRolePermission

    timestamps(type: :utc_datetime)
  end

  def changeset(admin_permission, attrs) do
    admin_permission
    |> cast(attrs, [:code, :name, :description, :category, :is_sensitive])
    |> validate_required([:code, :name, :category])
    |> unique_constraint(:code)
  end
end
