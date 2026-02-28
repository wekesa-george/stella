import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity({ schema: 'exchange', name: 'exchange_health_checks' })
export class ExchangeHealthCheck {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'exchange_id' })
  exchangeId: string;

  @Column('varchar', { length: 50 })
  status: string;

  @Column('int', { name: 'response_time_ms', nullable: true })
  responseTimeMs: number | null;

  @Column('text', { name: 'error_message', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'checked_at', type: 'timestamptz' })
  checkedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
