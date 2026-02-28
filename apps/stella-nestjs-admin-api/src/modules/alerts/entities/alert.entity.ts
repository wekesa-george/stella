import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ schema: 'trading', name: 'monitoring_alerts' })
export class Alert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'bot_id', nullable: true })
  botId: string;

  @Column({ name: 'user_strategy_id', nullable: true })
  userStrategyId: string;

  @Column({ name: 'alert_type', length: 50 })
  alertType: string;

  @Column({ name: 'alert_name', length: 255, nullable: true })
  alertName: string;

  @Column({ name: 'alert_message', type: 'text' })
  alertMessage: string;

  @Column({ name: 'condition_type', length: 50 })
  conditionType: string;

  @Column({ name: 'condition_value', type: 'decimal', precision: 18, scale: 4, nullable: true })
  conditionValue: number;

  @Column({ name: 'condition_window_minutes', nullable: true })
  conditionWindowMinutes: number;

  @Column({ name: 'monitored_entity', length: 30, default: 'bot' })
  monitoredEntity: string;

  @Column({ length: 30, nullable: true })
  symbol: string;

  @Column({ length: 20, default: 'active' })
  status: string;

  @Column({ name: 'triggered_at', type: 'timestamptz', nullable: true })
  triggeredAt: Date;

  @Column({ name: 'triggered_count', default: 0 })
  triggeredCount: number;

  @Column({ name: 'notify_email', default: true })
  notifyEmail: boolean;

  @Column({ name: 'notify_sms', default: false })
  notifySms: boolean;

  @Column({ name: 'notify_push', default: true })
  notifyPush: boolean;

  @Column({ name: 'repeat_alert', default: false })
  repeatAlert: boolean;

  @Column({ name: 'repeat_interval_minutes', nullable: true })
  repeatIntervalMinutes: number;

  @Column({ name: 'snooze_until', type: 'timestamptz', nullable: true })
  snoozeUntil: Date;

  @Column({ name: 'last_evaluated_at', type: 'timestamptz', nullable: true })
  lastEvaluatedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
