import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ schema: 'operations', name: 'escalation_matrix' })
export class EscalationMatrix {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 4 })
  priority: string;

  @Column('varchar', { length: 100, nullable: true })
  category: string | null;

  @Column('int', { default: 1 })
  tier: number;

  @Column('uuid', { name: 'target_role_id', nullable: true })
  targetRoleId: string | null;

  @Column('uuid', { name: 'target_user_id', nullable: true })
  targetUserId: string | null;

  @Column('text', { array: true, name: 'notification_channels', default: '{}' })
  notificationChannels: string[];

  @Column('int', { name: 'response_time_mins', default: 15 })
  responseTimeMins: number;

  @Column('int', { name: 'auto_escalate_to_tier', nullable: true })
  autoEscalateToTier: number | null;

  @Column('boolean', { name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
