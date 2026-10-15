defmodule StellaAdmin.Auth.User do
  @moduledoc """
  Schema for auth.users table in the stella_platform_new database.
  Represents platform users (not admin users).
  """
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  @schema_prefix "auth"

  schema "users" do
    field :logto_user_id, :string
    field :email, :string
    field :phone, :string
    field :username, :string
    field :status, Ecto.Enum, values: [:pending_verification, :active, :suspended, :deactivated, :banned]
    field :tier, Ecto.Enum, values: [:stella_one, :stella_unum, :stella_eon, :stella_plenum]
    field :email_verified, :boolean, default: false
    field :phone_verified, :boolean, default: false
    field :last_login_at, :utc_datetime
    field :last_login_ip, EctoNetwork.INET
    field :failed_login_count, :integer, default: 0
    field :locked_until, :utc_datetime
    field :referral_code, :string
    field :referred_by, :binary_id
    field :metadata, :map, default: %{}

    field :created_at, :utc_datetime
    field :updated_at, :utc_datetime
  end

  @doc false
  def changeset(user, attrs) do
    user
    |> cast(attrs, [
      :logto_user_id,
      :email,
      :phone,
      :username,
      :status,
      :tier,
      :email_verified,
      :phone_verified,
      :last_login_at,
      :last_login_ip,
      :failed_login_count,
      :locked_until,
      :referral_code,
      :referred_by,
      :metadata
    ])
    |> validate_required([:logto_user_id, :email, :status, :tier])
    |> validate_format(:email, ~r/^[^\s]+@[^\s]+$/, message: "must be a valid email")
    |> unique_constraint(:logto_user_id)
    |> unique_constraint(:email)
    |> unique_constraint(:username)
    |> unique_constraint(:referral_code)
  end
end
