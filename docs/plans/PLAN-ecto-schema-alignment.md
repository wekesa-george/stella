# Ecto Schema → DB Alignment Plan

The Elixir project was scaffolded against an old DB layout (`public.trading_positions`, `public.trading_orders`, etc.). The actual DB uses PostgreSQL schemas (`trading.positions`, `auth.users`, `strategy.strategies`, etc.) with different column names.

## Strategy

1. **Set `@schema_prefix`** on each Ecto schema to match the DB schema (`trading`, `auth`, `strategy`, `platform`, `exchange`)
2. **Rename the table string** (e.g. `"trading_positions"` → `"positions"`)
3. **Remap fields** to match actual DB column names
4. **Update raw SQL** in `PositionManager.build_bulk_update_sql/1` to use `trading.positions`
5. **Delete stale migrations** (they reference the old layout and will never run correctly)
6. **Configure Ecto Repo** with `after_connect` to set search_path if needed

---

## Schema-by-Schema Mapping

### 1. `TradeEngine.Trading.Position` — `position.ex`
| Current (Ecto) | Actual DB |
|---|---|
| `schema "trading_positions"` | `@schema_prefix "trading"` + `schema "positions"` |
| `field :symbol` | → `field :trading_pair` |
| `field :position_type` | → `field :side` |
| `field :profit_loss` | → `field :realized_pnl_usd` |
| `field :unrealized_profit_loss` | → `field :unrealized_pnl_usd` |
| `field :entry_time` | → `field :opened_at, :utc_datetime` |
| `field :exit_time` | → `field :closed_at, :utc_datetime` |
| `field :strategy_type` | REMOVE (doesn't exist) |
| `field :mark_price` | REMOVE (doesn't exist) |
| `field :lowest_price` | REMOVE (doesn't exist) |
| `field :highest_price` | REMOVE (doesn't exist) |
| — | ADD `field :credential_id, Ecto.UUID` |
| — | ADD `field :exchange_code, :string` |
| — | ADD `field :base_asset, :string` |
| — | ADD `field :quote_asset, :string` |
| — | ADD `field :remaining_quantity, :decimal` |
| — | ADD `field :leverage, :decimal` |
| — | ADD `field :total_fees_usd, :decimal` |
| — | ADD `field :stop_loss_price, :decimal` |
| — | ADD `field :take_profit_price, :decimal` |
| — | ADD `field :liquidation_price, :decimal` |
| — | ADD `field :margin_used_usd, :decimal` |
| — | ADD `field :strategy_id, Ecto.UUID` |
| — | ADD `field :signal_id, Ecto.UUID` |
| — | ADD `field :entry_order_id, Ecto.UUID` |
| — | ADD `field :exit_order_id, Ecto.UUID` |
| — | ADD `field :hold_duration_sec, :integer` |
| — | ADD `field :metadata, :map` |
| `belongs_to :user, SysAdmin.Accounts.User` | UPDATE FK or keep as-is (auth.users) |
| `belongs_to :user_strategy` | → `belongs_to :strategy` referencing `strategy.strategies` |
| `belongs_to :exchange_config` | REMOVE (replaced by `credential_id`) |

### 2. `TradeEngine.Trading.Order` — `order.ex`
| Current (Ecto) | Actual DB |
|---|---|
| `schema "trading_orders"` | `@schema_prefix "trading"` + `schema "orders"` |
| `field :symbol` | → `field :trading_pair` |
| `field :order_type` | → `field :type` |
| `field :filled_quantity` | ✓ exists |
| `field :average_fill_price` | → `field :avg_fill_price` |
| — | ADD many new columns (see DB dump) |

### 3. `TradeEngine.Trading.Transaction` — `transaction.ex`
| Current (Ecto) | Actual DB |
|---|---|
| `schema "trading_transactions"` | TABLE DOES NOT EXIST — replaced by `trading.fills` |
| Entire schema needs rewrite | → `@schema_prefix "trading"` + `schema "fills"` |

### 4. `TradeEngine.Trading.StopLossTakeProfit` — `stop_loss_take_profit.ex`
| Current (Ecto) | Actual DB |
|---|---|
| `schema "stop_loss_take_profit"` | `@schema_prefix "trading"` + `schema "stop_loss_take_profit"` |
| Columns mostly match | Verify all fields |

### 5. `TradeEngine.Bots.Bot` — `bot.ex`
| Current (Ecto) | Actual DB |
|---|---|
| `schema "trading_bots"` | `@schema_prefix "trading"` + `schema "bots"` |
| Verify columns match | See DB dump for `trading.bots` |

### 6. `TradeEngine.Alerts.TradingAlert` — `trading_alert.ex`
| Current (Ecto) | Actual DB |
|---|---|
| `schema "trading_alerts"` | `@schema_prefix "trading"` + `schema "monitoring_alerts"` |
| Column names differ significantly | Full remap needed |

### 7. `SysAdmin.Accounts.User` (stub) — `stubs/sys_admin/accounts/user.ex`
| Current (Ecto) | Actual DB |
|---|---|
| `schema "users"` | `@schema_prefix "auth"` + `schema "users"` |
| Minimal stub — just needs prefix | |

### 8. `SysAdmin.Strategies.Strategy` (stub) — `stubs/sys_admin/strategies/strategy.ex`
| Current (Ecto) | Actual DB |
|---|---|
| `schema "strategies"` | `@schema_prefix "strategy"` + `schema "strategies"` |

### 9. `SysAdmin.Strategies.UserStrategy` (stub) — `stubs/sys_admin/strategies/user_strategy.ex`
| Current (Ecto) | Actual DB |
|---|---|
| `schema "user_strategies"` | `@schema_prefix "trading"` + `schema "user_strategies"` |

### 10. `SysAdmin.Exchanges.ExchangeConfig` (stub) — `stubs/sys_admin/exchanges/exchange_config.ex`
| Current (Ecto) | Actual DB |
|---|---|
| `schema "exchange_configs"` | TABLE DOES NOT EXIST — replaced by `exchange.user_credentials` |

### 11. `TradeEngine.Accounts.TradingAccount` — `trading_account.ex`
| Current (Ecto) | Actual DB |
|---|---|
| `schema "trading_accounts"` | TABLE DOES NOT EXIST — equity tracked via `trading.equity_snapshots` |

### 12. `TradeEngine.Compliance.AuditLog` — `audit_log.ex`
| Current (Ecto) | Actual DB |
|---|---|
| `schema "audit_logs"` | TABLE DOES NOT EXIST in trading — exists as `admin.admin_audit_log` |

### 13. `TradeEngine.Compliance.WithdrawalRequest` — `withdrawal_request.ex`
| Current (Ecto) | Actual DB |
|---|---|
| `schema "withdrawal_requests"` | TABLE DOES NOT EXIST |

### 14. `TradeEngine.Risk.RiskLimit` — `risk_limit.ex`
| Current (Ecto) | Actual DB |
|---|---|
| `schema "risk_limits"` | TABLE DOES NOT EXIST — replaced by `platform.risk_controls` |

### 15. `TradeEngine.Analytics.TradingPerformance` — `trading_performance.ex`
| Current (Ecto) | Actual DB |
|---|---|
| `schema "trading_performance"` | `@schema_prefix "trading"` + `schema "trading_performance"` |

### 16. `TradeEngine.Analytics.BacktestResult` — `backtest_result.ex`
| Current (Ecto) | Actual DB |
|---|---|
| `schema "backtest_results"` | TABLE DOES NOT EXIST — replaced by `strategy.backtest_runs` |

### 17. `TradeEngine.MarketData.Prediction` — `prediction.ex`
| Current (Ecto) | Actual DB |
|---|---|
| `schema "predictions"` | `@schema_prefix "trading"` + `schema "predictions"` |
| Columns differ significantly | Full remap needed |

### 18. `TradeEngine.Platform.RiskControls` — `risk_controls.ex`
| Current (Ecto) | Actual DB |
|---|---|
| `schema "risk_controls"` | `@schema_prefix "platform"` + `schema "risk_controls"` |

### 19. `TradeEngine.Platform.BotEngineDefaults` — `bot_engine_defaults.ex`
| Current (Ecto) | Actual DB |
|---|---|
| `schema "bot_engine_defaults"` | `@schema_prefix "platform"` + `schema "bot_engine_defaults"` |

---

## Additional Changes

### Raw SQL in PositionManager
`position_manager.ex:391` has:
```sql
UPDATE trading_positions AS p ...
```
Must change to:
```sql
UPDATE trading.positions AS p ...
```
Also remap column references: `unrealized_profit_loss` → `unrealized_pnl_usd`

### Stale Migrations
All migrations in `apps/trade_engine/priv/repo/migrations/` are for the OLD schema. They should be:
- [ ] Deleted entirely (the real DB was created by the NestJS migrations / SQL scripts)
- [ ] OR marked as already-run by inserting their timestamps into `schema_migrations`

### Repo Config
Ensure `TradeEngine.Repo` does NOT set a default `search_path` that conflicts with `@schema_prefix`.

---

## Execution Order

1. Update stubs first (User, Strategy, UserStrategy, ExchangeConfig)
2. Update core trading schemas (Position, Order, StopLossTakeProfit)
3. Update Bot schema
4. Update Transaction → Fills
5. Update alerts, performance, predictions
6. Remove schemas for tables that don't exist (TradingAccount, WithdrawalRequest, AuditLog, RiskLimit, BacktestResult)
7. Update PositionManager raw SQL
8. Clean up migrations
9. Test with `iex -S mix phx.server`
