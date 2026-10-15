defmodule StellaAdmin.Admin.Permission do
  @moduledoc """
  Schema for admin.permissions table in the stella_platform_new database.
  Represents individual permissions that can be assigned to roles.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  @schema_prefix "admin"

  schema "permissions" do
    field :code, :string
    field :name, :string
    field :description, :string

    field :category, Ecto.Enum,
      values: [
        :users,
        :admins,
        :exchanges,
        :trading,
        :strategies,
        :billing,
        :risk,
        :pool,
        :reports,
        :system
      ]

    field :action, Ecto.Enum,
      values: [:view, :create, :update, :delete, :approve, :execute, :export]

    field :resource_scope, :string
    field :is_sensitive, :boolean, default: false

    field :created_at, :utc_datetime
  end

  @doc false
  def changeset(permission, attrs) do
    permission
    |> cast(attrs, [:code, :name, :description, :category, :action, :resource_scope, :is_sensitive])
    |> validate_required([:code, :name, :category, :action])
    |> unique_constraint(:code)
  end
end
