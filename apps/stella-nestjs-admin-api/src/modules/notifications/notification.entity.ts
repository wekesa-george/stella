import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity({ schema: 'platform', name: 'notification_log' })
export class NotificationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'channel_id' })
  channelId: string;

  @Column('uuid', { name: 'alert_type_id', nullable: true })
  alertTypeId: string | null;

  @Column('varchar', { length: 50 })
  severity: string;

  @Column('text')
  message: string;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any> | null;

  @Column('varchar', { length: 50, default: 'pending' })
  status: string; // pending, sent, failed

  @Column('text', { name: 'error_message', nullable: true })
  errorMessage: string | null;

  @Column('timestamptz', { name: 'sent_at', nullable: true })
  sentAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
