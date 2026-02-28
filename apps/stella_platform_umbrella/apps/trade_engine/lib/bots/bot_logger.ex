defmodule TradeEngine.Bots.BotLogger do
  @moduledoc """
  Structured logging API for bot processes.

  Broadcasts log entries to PubSub for:
  - `"bot_logs"` topic — consumed by BotLogPersister for DB persistence
  - `"bot:<bot_id>"` topic — consumed by BotChannel for real-time WS delivery

  All calls are non-blocking fire-and-forget.

  ## Usage

      alias TradeEngine.Bots.BotLogger

      BotLogger.info(bot_id, :lifecycle, "Bot ready", %{config: config})
      BotLogger.error(bot_id, :trade, "Execution failed", %{reason: reason})
  """

  @pubsub TradeEngine.PubSub

  @type level :: :debug | :info | :warning | :error
  @type category :: :lifecycle | :signal | :trade | :exit | :risk | :error | :system

  @doc "Log at the given level."
  def log(bot_id, level, category, message, metadata \\ %{}) do
    entry = %{
      bot_id: bot_id,
      level: level,
      category: category,
      message: message,
      metadata: metadata,
      created_at: DateTime.utc_now() |> DateTime.truncate(:second)
    }

    Phoenix.PubSub.broadcast(@pubsub, "bot_logs", {:bot_log, entry})
    Phoenix.PubSub.broadcast(@pubsub, "bot:#{bot_id}", {:bot_log, entry})
    :ok
  end

  def debug(bot_id, category, message, metadata \\ %{}),
    do: log(bot_id, :debug, category, message, metadata)

  def info(bot_id, category, message, metadata \\ %{}),
    do: log(bot_id, :info, category, message, metadata)

  def warning(bot_id, category, message, metadata \\ %{}),
    do: log(bot_id, :warning, category, message, metadata)

  def error(bot_id, category, message, metadata \\ %{}),
    do: log(bot_id, :error, category, message, metadata)
end
