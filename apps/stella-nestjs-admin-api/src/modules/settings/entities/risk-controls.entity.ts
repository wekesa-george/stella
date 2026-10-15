import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'platform', name: 'risk_controls' })
export class RiskControls {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('numeric', { name: 'max_drawdown_pct', precision: 5, scale: 2 })
  maxDrawdownPct: number;

  @Column('numeric', { name: 'daily_loss_limit_pct', precision: 5, scale: 2 })
  dailyLossLimitPct: number;

  @Column('numeric', { name: 'circuit_breaker_pct', precision: 5, scale: 2 })
  circuitBreakerPct: number;

  @Column('int', { name: 'circuit_breaker_window_hours' })
  circuitBreakerWindowHours: number;

  @Column('numeric', { name: 'max_slippage_pct', precision: 5, scale: 2 })
  maxSlippagePct: number;

  @Column('numeric', { name: 'max_position_size_pct', precision: 5, scale: 2 })
  maxPositionSizePct: number;

  @Column('int', { name: 'max_concurrent_positions' })
  maxConcurrentPositions: number;

  @Column('numeric', { name: 'max_leverage', precision: 6, scale: 2 })
  maxLeverage: number;

  @Column('int', { name: 'max_bots_per_user' })
  maxBotsPerUser: number;

  @Column('boolean', { name: 'force_limit_orders' })
  forceLimitOrders: boolean;

  @Column('boolean', { name: 'auto_halt_on_circuit' })
  autoHaltOnCircuit: boolean;

  @Column('boolean', { name: 'notify_on_drawdown' })
  notifyOnDrawdown: boolean;

  @Column('boolean', { name: 'allow_market_orders' })
  allowMarketOrders: boolean;

  @Column('boolean', { name: 'require_stop_loss' })
  requireStopLoss: boolean;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column('uuid', { name: 'updated_by_user_id', nullable: true })
  updatedByUserId: string | null;
}
