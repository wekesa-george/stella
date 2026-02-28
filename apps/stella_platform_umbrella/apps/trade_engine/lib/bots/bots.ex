defmodule TradeEngine.Bots do
  @moduledoc """
  🤖 BOTS CONTEXT - CRUD and query operations for trading bots.
  """

  import Ecto.Query
  alias TradeEngine.Repo
  alias TradeEngine.Bots.{Bot, BotRegistry}

  # ============================================================================
  # CRUD
  # ============================================================================

  def create_bot(user_id, attrs) do
    BotRegistry.register_bot(user_id, attrs)
  end

  def get_bot!(id), do: Repo.get!(Bot, id)

  def get_bot(id) do
    case Repo.get(Bot, id) do
      nil -> {:error, :not_found}
      bot -> {:ok, bot}
    end
  end

  def update_bot(%Bot{} = bot, attrs) do
    bot |> Bot.changeset(attrs) |> Repo.update()
  end

  def delete_bot(%Bot{} = bot) do
    Repo.delete(bot)
  end

  # ============================================================================
  # QUERIES
  # ============================================================================

  def list_bots do
    Repo.all(from b in Bot, order_by: [desc: b.created_at])
  end

  def list_user_bots(user_id) do
    Repo.all(
      from b in Bot,
        where: b.user_id == ^user_id,
        order_by: [desc: b.created_at]
    )
  end

  def list_running_bots do
    Repo.all(from b in Bot, where: b.status == "running")
  end

  def count_user_bots(user_id) do
    Repo.aggregate(
      from(b in Bot, where: b.user_id == ^user_id),
      :count
    )
  end

  @doc "Get the default/primary bot for a user (first running, or first one)"
  def get_default_bot(user_id) do
    Repo.one(
      from b in Bot,
        where: b.user_id == ^user_id,
        order_by: [
          fragment("CASE WHEN status = 'running' THEN 0 ELSE 1 END"),
          asc: b.created_at
        ],
        limit: 1
    )
  end

  @doc "Get or create a default bot for a user"
  def ensure_default_bot(user_id, opts \\ []) do
    case get_default_bot(user_id) do
      nil ->
        create_bot(user_id, %{
          name: Keyword.get(opts, :name, "Default Scalper"),
          credential_id: Keyword.get(opts, :credential_id),
          strategy_id: Keyword.get(opts, :strategy_id),
          trading_pairs: Keyword.get(opts, :pairs, []),
          config: Keyword.get(opts, :config, %{
            "max_positions" => 3,
            "target_profit_usd" => 0.50
          })
        })

      bot ->
        {:ok, bot}
    end
  end

  # ============================================================================
  # STATS
  # ============================================================================

  @doc "Get position count per bot"
  def get_bot_position_counts do
    Repo.all(
      from p in TradeEngine.Trading.Position,
        where: p.status == "open" and not is_nil(p.bot_id),
        group_by: p.bot_id,
        select: {p.bot_id, count(p.id)}
    )
    |> Map.new()
  end

  @doc "Get trade count per bot"
  def get_bot_trade_counts do
    Repo.all(
      from o in TradeEngine.Trading.Order,
        where: o.status == "filled" and not is_nil(o.bot_id),
        group_by: o.bot_id,
        select: {o.bot_id, count(o.id)}
    )
    |> Map.new()
  end

  @doc "Get PnL per bot from closed positions"
  def get_bot_pnl_summary do
    Repo.all(
      from p in TradeEngine.Trading.Position,
        where: p.status == "closed" and not is_nil(p.bot_id),
        group_by: p.bot_id,
        select: {
          p.bot_id,
          %{
            total_pnl: sum(p.profit_loss),
            trade_count: count(p.id),
            avg_pnl: avg(p.profit_loss)
          }
        }
    )
    |> Map.new()
  end
end
