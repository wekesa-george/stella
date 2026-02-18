defmodule StellaAdmin.Admin.AuditLog do
  @moduledoc """
  Schema for admin.admin_audit_log table in the stella_platform_new database.
  Tracks all admin actions for compliance and auditing purposes.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  @schema_prefix "admin"

  schema "admin_audit_log" do
    field :admin_user_id, :binary_id
    field :admin_email, :string
    field :admin_name, :string
    field :ip_address, EctoNetwork.INET
    field :action, :string
    field :resource_type, :string
    field :resource_id, :binary_id
    field :old_value, :map
    field :new_value, :map
    field :reason, :string
    field :permission_used, :string
    field :correlation_id, :binary_id
    field :request_method, :string
    field :request_path, :string
    field :metadata, :map

    field :created_at, :utc_datetime
  end

  @doc false
  def changeset(audit_log, attrs) do
    audit_log
    |> cast(attrs, [
      :admin_user_id,
      :admin_email,
      :admin_name,
      :ip_address,
      :action,
      :resource_type,
      :resource_id,
      :old_value,
      :new_value,
      :reason,
      :permission_used,
      :correlation_id,
      :request_method,
      :request_path,
      :metadata
    ])
    |> validate_required([:admin_user_id, :admin_email, :admin_name, :action, :resource_type])
  end
end
