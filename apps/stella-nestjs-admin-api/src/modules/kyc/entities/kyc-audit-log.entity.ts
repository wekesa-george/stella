import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity({ schema: 'kyc', name: 'audit_log' })
export class KycAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { name: 'event_type', length: 100 })
  eventType: string;

  @Column('varchar', { length: 200 })
  actor: string;

  @Column('varchar', { name: 'target_type', length: 50, nullable: true })
  targetType: string | null;

  @Column('varchar', { name: 'target_id', length: 100, nullable: true })
  targetId: string | null;

  @Column('text', { nullable: true })
  description: string | null;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any> | null;

  @Column('varchar', { name: 'ip_address', length: 45, nullable: true })
  ipAddress: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
