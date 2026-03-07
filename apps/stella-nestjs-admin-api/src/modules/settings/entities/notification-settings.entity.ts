import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ schema: 'platform', name: 'notification_settings' })
export class NotificationSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('int', { name: 'dedup_window_minutes', default: 5 })
  dedupWindowMinutes: number;

  @Column('uuid', { name: 'updated_by_user_id', nullable: true })
  updatedByUserId: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
