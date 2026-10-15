defmodule TradeEngine.Exchanges.CredentialDiscovery do
  @moduledoc """
  Shared credential discovery queries used by reconciliation, balance verification,
  funding tracking, and position reconciliation.

  Queries the actual DB schema: joins exchange.user_credentials to exchange.adapters
  to determine futures capability via adapter.supports_futures, NOT config_overrides.
  """

  alias TradeEngine.Repo

  @doc """
  Returns credential IDs for all active credentials whose adapter supports futures.
  """
  def get_futures_credentials do
    {:ok, %{rows: rows}} = Repo.query(
      """
      SELECT uc.id
      FROM exchange.user_credentials uc
      JOIN exchange.adapters a ON uc.adapter_id = a.id
      WHERE uc.status = 'active'
        AND a.supports_futures = true
      """,
      [],
      timeout: 10_000
    )

    Enum.map(rows, fn [id] -> raw_uuid_to_string(id) end)
  rescue
    e ->
      require Logger
      Logger.warning("CredentialDiscovery.get_futures_credentials failed: #{Exception.message(e)}")
      []
  end

  @doc """
  Returns all active credential IDs (any market type).
  """
  def get_all_active_credentials do
    {:ok, %{rows: rows}} = Repo.query(
      "SELECT id FROM exchange.user_credentials WHERE status = 'active'",
      [],
      timeout: 10_000
    )

    Enum.map(rows, fn [id] -> raw_uuid_to_string(id) end)
  rescue
    _ -> []
  end

  defp raw_uuid_to_string(<<a::32, b::16, c::16, d::16, e::48>>) do
    :io_lib.format("~8.16.0b-~4.16.0b-~4.16.0b-~4.16.0b-~12.16.0b", [a, b, c, d, e])
    |> to_string()
    |> String.downcase()
  end
  defp raw_uuid_to_string(id) when is_binary(id), do: id
  defp raw_uuid_to_string(id), do: to_string(id)
end
