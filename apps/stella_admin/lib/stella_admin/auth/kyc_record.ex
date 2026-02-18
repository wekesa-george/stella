defmodule StellaAdmin.Auth.KycRecord do
  @moduledoc """
  Schema for auth.kyc_records table in the stella_platform_new database.
  Represents KYC (Know Your Customer) verification records for platform users.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  @schema_prefix "auth"

  schema "kyc_records" do
    field :user_id, :binary_id
    field :status, Ecto.Enum, values: [:not_started, :pending, :in_review, :approved, :rejected, :expired]
    field :level, Ecto.Enum, values: [:none, :basic, :standard, :enhanced]
    field :provider, :string
    field :provider_reference_id, :string
    field :document_type, :string
    field :document_country, :string
    field :document_number, :string
    field :document_expiry, :date
    field :document_path, :string
    field :passport_photo_path, :string
    field :submitted_first_name, :string
    field :submitted_last_name, :string
    field :submitted_phone, :string
    field :submitted_country, :string
    field :submitted_city, :string
    field :verified_name, :string
    field :verified_dob, :date
    field :verified_address, :map
    field :verification_score, :decimal
    field :risk_rating, :string
    field :extracted_metadata, :map, default: %{}
    field :validation_details, :map, default: %{}
    field :submitted_at, :utc_datetime
    field :reviewed_at, :utc_datetime
    field :reviewed_by, :binary_id
    field :rejection_reason, :string
    field :expires_at, :utc_datetime
    field :notes, :string
    field :metadata, :map, default: %{}

    field :created_at, :utc_datetime
    field :updated_at, :utc_datetime
  end

  @doc false
  def changeset(kyc_record, attrs) do
    kyc_record
    |> cast(attrs, [
      :user_id,
      :status,
      :level,
      :provider,
      :provider_reference_id,
      :document_type,
      :document_country,
      :document_number,
      :document_expiry,
      :document_path,
      :passport_photo_path,
      :submitted_first_name,
      :submitted_last_name,
      :submitted_phone,
      :submitted_country,
      :submitted_city,
      :verified_name,
      :verified_dob,
      :verified_address,
      :verification_score,
      :risk_rating,
      :extracted_metadata,
      :validation_details,
      :submitted_at,
      :reviewed_at,
      :reviewed_by,
      :rejection_reason,
      :expires_at,
      :notes,
      :metadata
    ])
    |> validate_required([:user_id, :status, :level])
  end
end
