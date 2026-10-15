import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'platform', name: 'bot_engine_defaults' })
export class BotEngineDefaults {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('int', { name: 'heartbeat_interval_sec' })
  heartbeatIntervalSec: number;

  @Column('int', { name: 'order_timeout_sec' })
  orderTimeoutSec: number;

  @Column('int', { name: 'max_order_age_sec' })
  maxOrderAgeSec: number;

  @Column('int', { name: 'retry_attempts' })
  retryAttempts: number;

  @Column('numeric', { name: 'retry_backoff_multiplier', precision: 3, scale: 1 })
  retryBackoffMultiplier: number;

  @Column('int', { name: 'reconcile_frequency_min' })
  reconcileFrequencyMin: number;

  @Column('numeric', { name: 'default_slippage_pct', precision: 5, scale: 2 })
  defaultSlippagePct: number;

  @Column('int', { name: 'position_precision' })
  positionPrecision: number;

  @Column('boolean', { name: 'enable_heartbeat_alert' })
  enableHeartbeatAlert: boolean;

  @Column('boolean', { name: 'enable_stale_order_cancel' })
  enableStaleOrderCancel: boolean;

  @Column('boolean', { name: 'enable_auto_reconcile' })
  enableAutoReconcile: boolean;

  @Column('boolean', { name: 'enable_partial_fill_continue' })
  enablePartialFillContinue: boolean;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column('uuid', { name: 'updated_by_user_id', nullable: true })
  updatedByUserId: string | null;
}
