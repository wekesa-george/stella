import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'platform', name: 'outbound_webhooks' })
export class OutboundWebhook {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 500 })
  url: string;

  @Column('text', { array: true })
  events: string[];

  @Column('boolean', { name: 'is_active', default: true })
  isActive: boolean;

  @Column('varchar', { name: 'signing_secret', length: 64 })
  signingSecret: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column('uuid', { name: 'created_by_user_id', nullable: true })
  createdByUserId: string | null;

  @Column('int', { name: 'total_deliveries', default: 0 })
  totalDeliveries: number;

  @Column('int', { name: 'successful_deliveries', default: 0 })
  successfulDeliveries: number;

  @Column('int', { name: 'failed_deliveries', default: 0 })
  failedDeliveries: number;

  @Column('timestamptz', { name: 'last_delivery_at', nullable: true })
  lastDeliveryAt: Date | null;

  @Column('timestamptz', { name: 'last_success_at', nullable: true })
  lastSuccessAt: Date | null;

  @Column('timestamptz', { name: 'last_failure_at', nullable: true })
  lastFailureAt: Date | null;

  @Column('text', { name: 'last_failure_reason', nullable: true })
  lastFailureReason: string | null;
}
