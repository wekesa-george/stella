import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ schema: 'platform', name: 'notification_routing' })
export class NotificationRouting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'channel_id' })
  channelId: string;

  @Column('varchar', { length: 50 })
  severity: string;

  @Column('boolean', { name: 'is_enabled', default: true })
  isEnabled: boolean;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
