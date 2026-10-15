-- =============================================================================
-- Seed Core Strategies into strategy.strategies
-- =============================================================================
-- Seeds all 5 core strategy types with their default configs.
-- Physics Impulse (core_momentum) is the only one with a live implementation.
-- Others are seeded as drafts with config schemas ready for implementation.
-- =============================================================================

BEGIN;

-- 1. Physics Impulse Scalper (core_momentum) — LIVE
INSERT INTO strategy.strategies (
  id, name, description, type, status, version,
  is_core, is_public, is_live_enabled, is_backtest_enabled,
  class_module, timeframe,
  config, entry_conditions, exit_conditions, position_sizing, indicators,
  default_stop_loss_pct, default_take_profit_pct, max_position_size_pct,
  supported_pairs, supported_exchanges,
  metadata, created_at, updated_at
) VALUES (
  uuid_generate_v4(),
  'Physics Impulse Scalper',
  'Newtonian physics-based impulse scalping. Treats price as a projectile: computes momentum (velocity), market resistance (gravity), and predicts peak price using v²/2g. Enters on high-confidence impulses, exits at predicted peak or golden-ratio stop loss.',
  'core_momentum',
  'active',
  1,
  true, true, true, true,
  'TradeEngine.Strategies.PhysicsImpulse',
  '5m',
  '{
    "target_profit_usd": 0.50,
    "min_impulse_pct": 0.001,
    "max_hold_minutes": 5,
    "golden_ratio": 0.618,
    "min_notional": 10.0,
    "min_trade_value": 12.0,
    "min_confidence_long": 55,
    "min_confidence_short": 60,
    "max_positions": 3,
    "max_position_pct": 0.15
  }'::jsonb,
  '[
    {"indicator": "confidence", "operator": ">=", "value": 55, "note": "Long threshold"},
    {"indicator": "confidence", "operator": ">=", "value": 60, "note": "Short threshold"},
    {"indicator": "impulse_pct", "operator": ">=", "value": 0.001, "note": "Min impulse size"},
    {"indicator": "trajectory_angle", "operator": ">=", "value": 18, "note": "Min angle degrees"},
    {"indicator": "energy_state", "operator": "in", "value": ["high", "medium"], "note": "Sufficient energy"}
  ]'::jsonb,
  '[
    {"type": "take_profit", "method": "impulse_target", "note": "Physics peak prediction P₀ + v²/2g"},
    {"type": "stop_loss", "method": "golden_ratio", "value": 0.618, "note": "0.618 × impulse below entry"},
    {"type": "time_exit", "max_hold_minutes": 5, "note": "Force close after max hold"}
  ]'::jsonb,
  '{
    "method": "impulse_based",
    "formula": "quantity = target_profit_usd / impulse_size",
    "max_position_pct": 0.15,
    "min_trade_value": 12.0,
    "min_notional": 10.0
  }'::jsonb,
  '[
    {"name": "physics_momentum", "type": "custom", "params": {"method": "linear_regression_slope"}},
    {"name": "physics_gravity", "type": "custom", "params": {"components": ["volatility", "decay", "reversals"]}},
    {"name": "physics_energy", "type": "custom", "params": {"formula": "0.5 * mass * v²"}},
    {"name": "trajectory_angle", "type": "custom", "params": {"formula": "arctan(v/g)"}},
    {"name": "ai_brain", "type": "onnx", "params": {"model": "margin_scalper_brain.onnx", "features": 6}}
  ]'::jsonb,
  1.5000,  -- default_stop_loss_pct (derived from golden ratio on typical impulse)
  2.0000,  -- default_take_profit_pct (typical peak distance)
  15.0000, -- max_position_size_pct
  ARRAY['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT'],
  ARRAY['binance', 'binance_testnet'],
  '{"origin": "core", "ai_model": "margin_scalper_brain.onnx"}'::jsonb,
  NOW(), NOW()
)
ON CONFLICT DO NOTHING;

-- 2. Grid Bot (core_grid) — DRAFT
INSERT INTO strategy.strategies (
  id, name, description, type, status, version,
  is_core, is_public, is_live_enabled, is_backtest_enabled,
  class_module, timeframe,
  config, entry_conditions, exit_conditions, position_sizing, indicators,
  supported_exchanges,
  metadata, created_at, updated_at
) VALUES (
  uuid_generate_v4(),
  'Grid Bot',
  'Places a grid of buy and sell orders at fixed intervals between upper and lower price boundaries. Profits from price oscillation within the range. Best for ranging/sideways markets.',
  'core_grid',
  'draft',
  1,
  true, true, false, false,
  'TradeEngine.Strategies.GridBot',
  NULL,
  '{
    "upper_price": 0,
    "lower_price": 0,
    "grid_levels": 20,
    "investment_per_grid": 100.0,
    "total_investment": 2000.0,
    "rebalance_on_breakout": true,
    "max_positions": 20
  }'::jsonb,
  '[
    {"indicator": "price", "operator": "within_range", "note": "Price must be within grid boundaries"}
  ]'::jsonb,
  '[
    {"type": "grid_fill", "note": "Close when opposite grid level is filled"},
    {"type": "breakout", "note": "Optional: close all if price breaks grid boundary"}
  ]'::jsonb,
  '{
    "method": "fixed_per_grid",
    "investment_per_grid": 100.0
  }'::jsonb,
  '[]'::jsonb,
  ARRAY['binance', 'bybit', 'okx'],
  '{"origin": "core"}'::jsonb,
  NOW(), NOW()
)
ON CONFLICT DO NOTHING;

-- 3. DCA Strategy (core_dca) — DRAFT
INSERT INTO strategy.strategies (
  id, name, description, type, status, version,
  is_core, is_public, is_live_enabled, is_backtest_enabled,
  class_module, timeframe,
  config, entry_conditions, exit_conditions, position_sizing, indicators,
  supported_exchanges,
  metadata, created_at, updated_at
) VALUES (
  uuid_generate_v4(),
  'Dollar-Cost Averaging',
  'Scheduled periodic buys with dip-enhancement. Increases buy amounts when price drops below configurable thresholds. Closes all positions at aggregate take-profit target.',
  'core_dca',
  'draft',
  1,
  true, true, false, false,
  'TradeEngine.Strategies.DCA',
  NULL,
  '{
    "interval": "4h",
    "amount_usd": 100.0,
    "max_budget_usd": 3000.0,
    "dip_thresholds": [
      {"drop_pct": 3.0, "multiplier": 1.5},
      {"drop_pct": 6.0, "multiplier": 2.0},
      {"drop_pct": 10.0, "multiplier": 3.0}
    ],
    "take_profit_pct": 10.0,
    "use_twap": false,
    "max_positions": 50
  }'::jsonb,
  '[
    {"indicator": "timer", "operator": "interval", "value": "4h", "note": "Buy every N hours"},
    {"indicator": "price_drop", "operator": ">=", "value": 3.0, "note": "Enhanced buy on dip"}
  ]'::jsonb,
  '[
    {"type": "aggregate_take_profit", "value": 10.0, "note": "Close all at 10% aggregate gain"},
    {"type": "budget_exhausted", "note": "Stop buying when max budget reached"}
  ]'::jsonb,
  '{
    "method": "fixed_amount",
    "base_amount_usd": 100.0,
    "dip_multipliers": true
  }'::jsonb,
  '[]'::jsonb,
  ARRAY['binance', 'bybit', 'okx', 'kraken', 'kucoin'],
  '{"origin": "core"}'::jsonb,
  NOW(), NOW()
)
ON CONFLICT DO NOTHING;

-- 4. Mean Reversion Grid (core_mean_reversion) — DRAFT
INSERT INTO strategy.strategies (
  id, name, description, type, status, version,
  is_core, is_public, is_live_enabled, is_backtest_enabled,
  class_module, timeframe,
  config, entry_conditions, exit_conditions, position_sizing, indicators,
  supported_exchanges,
  metadata, created_at, updated_at
) VALUES (
  uuid_generate_v4(),
  'Mean Reversion Grid',
  'Dynamic grid anchored to EMA. Buys below the moving average and sells above it, profiting from mean reversion. Grid levels adjust as the EMA moves.',
  'core_mean_reversion',
  'draft',
  1,
  true, true, false, false,
  'TradeEngine.Strategies.MeanReversionGrid',
  '1h',
  '{
    "ema_period": 20,
    "grid_levels": 8,
    "grid_spacing_pct": 0.8,
    "position_size_pct": 5.0,
    "rebalance_mode": "auto",
    "max_deviation_pct": 5.0,
    "max_positions": 16
  }'::jsonb,
  '[
    {"indicator": "price_vs_ema", "operator": "deviation", "value": 0.8, "note": "Enter when price deviates from EMA by grid spacing"}
  ]'::jsonb,
  '[
    {"type": "mean_reversion", "note": "Close when price reverts to EMA"},
    {"type": "max_deviation", "value": 5.0, "note": "Pause if price deviates beyond max"}
  ]'::jsonb,
  '{
    "method": "percent_of_capital",
    "position_size_pct": 5.0
  }'::jsonb,
  '[
    {"name": "ema", "type": "moving_average", "params": {"period": 20, "type": "exponential"}}
  ]'::jsonb,
  ARRAY['binance', 'bybit', 'okx'],
  '{"origin": "core"}'::jsonb,
  NOW(), NOW()
)
ON CONFLICT DO NOTHING;

-- 5. Trend Follower (core_trend_following) — DRAFT
INSERT INTO strategy.strategies (
  id, name, description, type, status, version,
  is_core, is_public, is_live_enabled, is_backtest_enabled,
  class_module, timeframe,
  config, entry_conditions, exit_conditions, position_sizing, indicators,
  default_stop_loss_pct, default_take_profit_pct,
  supported_exchanges,
  metadata, created_at, updated_at
) VALUES (
  uuid_generate_v4(),
  'Multi-Timeframe Trend Follower',
  'Enters when multiple timeframe EMAs align (macro + intermediate + trigger). Uses trailing stops to ride trends. Volume confirmation optional.',
  'core_trend_following',
  'draft',
  1,
  true, true, false, false,
  'TradeEngine.Strategies.TrendFollower',
  '1h',
  '{
    "fast_ema": 9,
    "slow_ema": 21,
    "signal_ema": 50,
    "timeframes": ["1h", "4h", "1d"],
    "volume_confirmation": true,
    "trailing_stop_pct": 2.0,
    "trailing_step_pct": 0.5,
    "min_trend_strength": 0.6,
    "max_positions": 5
  }'::jsonb,
  '[
    {"indicator": "ema_alignment", "operator": "all_bullish", "timeframes": ["1h", "4h", "1d"], "note": "All timeframes must align"},
    {"indicator": "trend_strength", "operator": ">=", "value": 0.6, "note": "Min alignment score"},
    {"indicator": "volume", "operator": "above_average", "note": "Volume confirmation"}
  ]'::jsonb,
  '[
    {"type": "trailing_stop", "value": 2.0, "step": 0.5, "note": "2% trailing stop, 0.5% steps"},
    {"type": "trend_reversal", "note": "Close when macro timeframe flips bearish"}
  ]'::jsonb,
  '{
    "method": "percent_of_capital",
    "position_size_pct": 5.0
  }'::jsonb,
  '[
    {"name": "ema_fast", "type": "moving_average", "params": {"period": 9, "type": "exponential"}},
    {"name": "ema_slow", "type": "moving_average", "params": {"period": 21, "type": "exponential"}},
    {"name": "ema_signal", "type": "moving_average", "params": {"period": 50, "type": "exponential"}},
    {"name": "volume_sma", "type": "volume_average", "params": {"period": 20}}
  ]'::jsonb,
  2.0000,  -- default_stop_loss_pct
  NULL,    -- no fixed TP (trailing stop)
  ARRAY['binance', 'bybit', 'okx'],
  '{"origin": "core"}'::jsonb,
  NOW(), NOW()
)
ON CONFLICT DO NOTHING;

COMMIT;
