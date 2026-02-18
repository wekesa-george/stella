defmodule StellaAdmin.Accounts.User do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: false}
  @foreign_key_type :binary_id

  schema "users" do
    field :email, :string
    field :hashed_password, :string
    field :status, :string
    field :current_plan_id, :binary_id

    timestamps(type: :utc_datetime)
  end

  @doc """
  Changeset for creating/updating users from Logto webhook
  """
  def webhook_changeset(user, attrs) do
    user
    |> cast(attrs, [:id, :email, :status])
    |> validate_required([:id, :email])
    |> validate_format(:email, ~r/@/)
    |> unique_constraint(:email)
  end
end
