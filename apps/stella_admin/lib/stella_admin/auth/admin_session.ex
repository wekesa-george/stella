defmodule StellaAdmin.Auth.AdminSession do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  @schema_prefix "admin"

  schema "admin_sessions" do
    field :admin_user_id, :binary_id
    field :session_token_hash, :string
    field :ip_address, EctoNetwork.INET
    field :user_agent, :string
    field :is_active, :boolean, default: true
    field :last_activity_at, :utc_datetime
    field :expires_at, :utc_datetime
    field :created_at, :utc_datetime
  end

  def changeset(admin_session, attrs) do
    admin_session
    |> cast(attrs, [:admin_user_id, :session_token_hash, :ip_address, :user_agent, :is_active, :last_activity_at, :expires_at])
    |> validate_required([:admin_user_id, :session_token_hash, :ip_address, :expires_at])
    |> foreign_key_constraint(:admin_user_id)
    |> unique_constraint(:session_token_hash)
  end
end
