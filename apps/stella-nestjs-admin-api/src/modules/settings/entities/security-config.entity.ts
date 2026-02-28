import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'platform', name: 'security_config' })
export class SecurityConfig {
  @PrimaryColumn('int')
  id: number;

  @Column('int', { name: 'session_timeout_minutes' })
  sessionTimeoutMinutes: number;

  @Column('boolean', { name: 'force_two_fa', nullable: true })
  forceTwoFa: boolean;

  @Column('int', { name: 'min_password_length' })
  minPasswordLength: number;

  @Column('boolean', { name: 'require_special_chars', nullable: true })
  requireSpecialChars: boolean;

  @Column('int', { name: 'max_login_attempts' })
  maxLoginAttempts: number;

  @Column('boolean', { name: 'ip_allowlist_enabled', nullable: true })
  ipAllowlistEnabled: boolean;

  @Column('int', { name: 'audit_retention_years' })
  auditRetentionYears: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column('int', { name: 'updated_by_user_id', nullable: true })
  updatedByUserId: number | null;

  @Column('timestamptz', { name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}
