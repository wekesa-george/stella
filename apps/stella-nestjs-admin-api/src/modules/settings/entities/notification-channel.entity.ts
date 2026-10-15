import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ schema: 'platform', name: 'notification_channels' })
export class NotificationChannel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { name: 'channel_key', length: 50, unique: true })
  channelKey: string;

  @Column('varchar', { length: 100 })
  name: string;

  @Column('varchar', { length: 50, nullable: true })
  icon: string;

  @Column('boolean', { name: 'is_active', default: true })
  isActive: boolean;

  @Column('jsonb', { default: '{}' })
  config: Record<string, any>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
