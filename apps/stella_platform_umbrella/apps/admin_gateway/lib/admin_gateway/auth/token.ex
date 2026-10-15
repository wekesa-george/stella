defmodule AdminGateway.Auth.Token do
  @moduledoc """
  Verifies and decodes Logto-issued JWTs using JWKS.
  """

  require Logger

  alias AdminGateway.Auth.JWKS

  @doc """
  Verify a Bearer token string.
  Returns {:ok, claims} or {:error, reason}.
  """
  def verify(token) when is_binary(token) do
    with {:ok, header} <- peek_header(token),
         kid <- Map.get(header, "kid"),
         {:ok, jwk} <- JWKS.get_key(kid),
         {:ok, claims} <- verify_signature(token, jwk),
         :ok <- validate_claims(claims) do
      {:ok, claims}
    end
  end

  def verify(_), do: {:error, :invalid_token}

  # ── Private ──

  defp peek_header(token) do
    case String.split(token, ".") do
      [header_b64 | _rest] ->
        case Base.url_decode64(header_b64, padding: false) do
          {:ok, json} -> Jason.decode(json)
          :error -> {:error, :invalid_header_encoding}
        end

      _ ->
        {:error, :malformed_token}
    end
  end

  defp verify_signature(token, jwk) do
    case JOSE.JWT.verify_strict(jwk, ["RS256", "ES256", "ES384"], token) do
      {true, %JOSE.JWT{fields: claims}, _jws} ->
        {:ok, claims}

      {false, _, _} ->
        {:error, :invalid_signature}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp validate_claims(claims) do
    now = System.system_time(:second)
    exp = Map.get(claims, "exp")

    cond do
      is_nil(exp) ->
        {:error, :missing_exp}

      exp < now ->
        {:error, :token_expired}

      is_nil(Map.get(claims, "sub")) ->
        {:error, :missing_sub}

      true ->
        :ok
    end
  end
end
