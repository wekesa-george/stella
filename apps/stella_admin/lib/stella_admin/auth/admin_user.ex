defmodule StellaAdmin.Auth.AdminUser do
  @moduledoc """
  Schema for admin.admin_users table in the stella_platform_new database.
  Represents admin users who can access the admin panel.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  @schema_prefix "admin"

  schema "admin_users" do
    field :logto_user_id, :string
    field :email, :string
    field :phone, :string
    field :first_name, :string
    field :last_name, :string
    field :display_name, :string
    field :status, Ecto.Enum, values: [:invited, :active, :suspended, :deactivated]
    field :password_hash, :string
    field :mfa_enabled, :boolean, default: false
    field :mfa_secret_encrypted, :binary
    field :mfa_backup_codes, :binary
    field :force_password_change, :boolean, default: false
    field :is_super_admin, :boolean, default: false
    field :last_login_at, :utc_datetime
    field :last_login_ip, EctoNetwork.INET
    field :failed_login_count, :integer, default: 0
    field :locked_until, :utc_datetime
    field :invited_by, :binary_id
    field :invited_at, :utc_datetime
    field :activated_at, :utc_datetime
    field :deactivated_at, :utc_datetime
    field :deactivated_by, :binary_id
    field :deactivation_reason, :string
    field :avatar_url, :string
    field :timezone, :string
    field :metadata, :map

    field :created_at, :utc_datetime
    field :updated_at, :utc_datetime

    # Associations
    has_many :sessions, StellaAdmin.Auth.AdminSession, foreign_key: :admin_user_id
  end

  @doc false
  def changeset(admin_user, attrs) do
    admin_user
    |> cast(attrs, [
      :logto_user_id,
      :email,
      :phone,
      :first_name,
      :last_name,
      :display_name,
      :status,
      :password_hash,
      :mfa_enabled,
      :mfa_secret_encrypted,
      :mfa_backup_codes,
      :force_password_change,
      :is_super_admin,
      :last_login_at,
      :last_login_ip,
      :failed_login_count,
      :locked_until,
      :invited_by,
      :invited_at,
      :activated_at,
      :deactivated_at,
      :deactivated_by,
      :deactivation_reason,
      :avatar_url,
      :timezone,
      :metadata
    ])
    |> validate_required([:email, :first_name, :last_name, :status])
    |> unique_constraint(:email)
    |> unique_constraint(:logto_user_id)
  end
end
