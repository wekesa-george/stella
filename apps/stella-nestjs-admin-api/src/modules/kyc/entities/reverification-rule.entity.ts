import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ schema: 'kyc', name: 'reverification_rules' })
export class ReverificationRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { name: 'rule_name', length: 100 })
  ruleName: string;

  @Column('varchar', { name: 'trigger_event', length: 50 })
  triggerEvent: string;

  @Column('int', { name: 'frequency_days', nullable: true })
  frequencyDays: number | null;

  @Column('varchar', { name: 'target_tier', length: 50, nullable: true })
  targetTier: string | null;

  @Column('boolean', { name: 'is_active', default: true })
  isActive: boolean;

  @Column('uuid', { name: 'created_by_user_id', nullable: true })
  createdByUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
