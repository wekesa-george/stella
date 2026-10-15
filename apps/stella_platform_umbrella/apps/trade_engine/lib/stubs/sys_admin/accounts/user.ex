defmodule SysAdmin.Accounts.User do
  @moduledoc """
  Stub schema for SysAdmin.Accounts.User.
  Maps to auth.users in the real database.
  """
  use Ecto.Schema

  @schema_prefix "auth"
  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "users" do
    field :email, :string
    field :logto_user_id, :string
    field :username, :string
    field :phone, :string
    field :status, :string, default: "active"
    field :tier, :string
    field :email_verified, :boolean, default: false
    field :kyc_status, :string

    timestamps(type: :utc_datetime, inserted_at: :created_at)
  end
end
