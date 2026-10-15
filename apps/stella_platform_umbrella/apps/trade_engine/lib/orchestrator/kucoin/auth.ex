defmodule TradeEngine.Orchestrator.KuCoin.Auth do
  @moduledoc """
  Handles request signing for KuCoin V2 API.
  Docs: https://www.kucoin.com/docs-new/
  """
  
  def get_headers(method, path, body \\ "") do
    config = Application.get_env(:trade_engine, :kucoin)
    
    timestamp = System.system_time(:millisecond) |> to_string()
    
    # Signature String: timestamp + method + endpoint + body
    str_to_sign = timestamp <> String.upcase(method) <> path <> body
    
    signature = sign(str_to_sign, config[:api_secret])
    passphrase = sign(config[:api_passphrase], config[:api_secret]) # V2 requires signed passphrase
    
    [
      {"KC-API-KEY", config[:api_key]},
      {"KC-API-SIGN", signature},
      {"KC-API-TIMESTAMP", timestamp},
      {"KC-API-PASSPHRASE", passphrase},
      {"KC-API-KEY-VERSION", "2"}, # Use V2
      {"Content-Type", "application/json"}
    ]
  end

  defp sign(data, secret) do
    :crypto.mac(:hmac, :sha256, secret, data)
    |> Base.encode64()
  end
end