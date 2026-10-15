import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity({ schema: 'admin', name: 'admin_audit_log' })
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'admin_user_id', type: 'uuid' })
  adminUserId: string;

  @Column({ name: 'admin_email', length: 255 })
  adminEmail: string;

  @Column({ name: 'admin_name', length: 200 })
  adminName: string;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress: string;

  @Column({ length: 100 })
  action: string;

  @Column({ name: 'resource_type', length: 50 })
  resourceType: string;

  @Column({ name: 'resource_id', type: 'uuid', nullable: true })
  resourceId: string;

  @Column({ name: 'old_value', type: 'jsonb', nullable: true })
  oldValue: Record<string, any>;

  @Column({ name: 'new_value', type: 'jsonb', nullable: true })
  newValue: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({ name: 'permission_used', length: 100, nullable: true })
  permissionUsed: string;

  @Column({ name: 'correlation_id', type: 'uuid', nullable: true })
  correlationId: string;

  @Column({ name: 'request_method', length: 10, nullable: true })
  requestMethod: string;

  @Column({ name: 'request_path', type: 'text', nullable: true })
  requestPath: string;

  @Column({ type: 'jsonb', nullable: true, default: '{}' })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
