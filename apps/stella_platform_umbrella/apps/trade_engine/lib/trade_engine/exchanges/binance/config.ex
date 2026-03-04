defmodule TradeEngine.Exchanges.Binance.Config do
  @moduledoc """
  Configuration management for Binance integration.
  
  Supports both mainnet and testnet configurations.
  
  ## Usage
  
      # From environment variables
      config = Config.from_env()
      
      # Explicit testnet
      config = Config.new(:testnet)
      
      # Explicit mainnet
      config = Config.new(:mainnet)
      
      # Custom config
      config = %Config{
        api_key: "your_key",
        api_secret: "your_secret",
        testnet: true
      }
  """

  @type t :: %__MODULE__{
    api_key: String.t(),
    api_secret: String.t(),
    testnet: boolean(),
    base_url: String.t(),
    ws_base_url: String.t(),
    recv_window: non_neg_integer()
  }

  defstruct [
    :api_key,
    :api_secret,
    testnet: true,
    base_url: nil,
    ws_base_url: nil,
    recv_window: 5000
  ]

  @mainnet_rest "https://api.binance.com"
  @mainnet_ws "wss://stream.binance.com:9443/ws"

  @testnet_rest "https://testnet.binance.vision/api"
  @testnet_ws "wss://stream.testnet.binance.vision/ws"

  @doc """
  Create configuration from environment variables.
  
  Environment variables:
  - `BINANCE_API_KEY`
  - `BINANCE_API_SECRET`
  - `BINANCE_TESTNET` (default: "true")
  """
  def from_env do
    testnet = System.get_env("BINANCE_TESTNET", "true") == "true"
    
    %__MODULE__{
      api_key: System.get_env("BINANCE_API_KEY", ""),
      api_secret: System.get_env("BINANCE_API_SECRET", ""),
      testnet: testnet,
      base_url: if(testnet, do: @testnet_rest, else: @mainnet_rest),
      ws_base_url: if(testnet, do: @testnet_ws, else: @mainnet_ws)
    }
  end

  @doc """
  Create configuration for a specific environment.
  """
  def new(:testnet) do
    %__MODULE__{
      api_key: System.get_env("BINANCE_API_KEY", ""),
      api_secret: System.get_env("BINANCE_API_SECRET", ""),
      testnet: true,
      base_url: @testnet_rest,
      ws_base_url: @testnet_ws
    }
  end

  def new(:mainnet) do
    %__MODULE__{
      api_key: System.get_env("BINANCE_API_KEY", ""),
      api_secret: System.get_env("BINANCE_API_SECRET", ""),
      testnet: false,
      base_url: @mainnet_rest,
      ws_base_url: @mainnet_ws
    }
  end

  @doc """
  Validate configuration has required fields.
  """
  def valid?(%__MODULE__{api_key: key, api_secret: secret}) do
    key != "" and secret != ""
  end

  def valid?(_), do: false

  @doc """
  Get REST API base URL.
  """
  def rest_url(%__MODULE__{base_url: url}), do: url

  @doc """
  Get WebSocket base URL.
  """
  def ws_url(%__MODULE__{ws_base_url: url}), do: url

  @doc """
  Check if using testnet.
  """
  def testnet?(%__MODULE__{testnet: t}), do: t

end