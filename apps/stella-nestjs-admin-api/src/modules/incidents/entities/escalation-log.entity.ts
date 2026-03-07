import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Incident } from './incident.entity';

@Entity({ schema: 'operations', name: 'escalation_log' })
export class EscalationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'incident_id' })
  incidentId: string;

  @Column('uuid', { name: 'matrix_rule_id', nullable: true })
  matrixRuleId: string | null;

  @Column('int')
  tier: number;

  @Column('uuid', { name: 'escalated_by', nullable: true })
  escalatedBy: string | null;

  @Column('uuid', { name: 'target_role_id', nullable: true })
  targetRoleId: string | null;

  @Column('uuid', { name: 'target_user_id', nullable: true })
  targetUserId: string | null;

  @Column('text', { array: true, name: 'notification_channels_used', default: '{}' })
  notificationChannelsUsed: string[];

  @Column('jsonb', { name: 'notification_status', default: '{}' })
  notificationStatus: Record<string, any>;

  @Column('timestamptz', { name: 'acknowledged_at', nullable: true })
  acknowledgedAt: Date | null;

  @Column('uuid', { name: 'acknowledged_by', nullable: true })
  acknowledgedBy: string | null;

  @Column('boolean', { name: 'auto_escalated', default: false })
  autoEscalated: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Incident)
  @JoinColumn({ name: 'incident_id' })
  incident: Incident;
}
