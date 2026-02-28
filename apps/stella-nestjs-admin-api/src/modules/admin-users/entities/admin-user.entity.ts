import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity({ schema: 'admin', name: 'admin_users' })
export class AdminUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'logto_user_id', length: 255, nullable: true, unique: true })
  logtoUserId: string;

  @Column({ length: 255, unique: true })
  email: string;

  @Column({ length: 100, unique: true, nullable: true })
  username: string;

  @Column({ length: 50, nullable: true })
  phone: string;

  @Column({ name: 'first_name', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', length: 100 })
  lastName: string;

  // display_name is a generated column — read-only
  @Column({ name: 'display_name', length: 200, insert: false, update: false, nullable: true })
  displayName: string;

  @Column({ length: 20, default: 'invited' })
  status: string;

  @Column({ name: 'password_hash', length: 255, nullable: true, select: false })
  passwordHash: string;

  @Column({ name: 'mfa_enabled', default: false })
  mfaEnabled: boolean;

  @Column({ name: 'force_password_change', default: false })
  forcePasswordChange: boolean;

  @Column({ name: 'is_super_admin', default: false })
  isSuperAdmin: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date;

  @Column({ name: 'last_login_ip', type: 'inet', nullable: true })
  lastLoginIp: string;

  @Column({ name: 'failed_login_count', default: 0 })
  failedLoginCount: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil: Date;

  @Column({ name: 'invited_by', type: 'uuid', nullable: true })
  invitedBy: string;

  @Column({ name: 'invited_at', type: 'timestamptz', nullable: true })
  invitedAt: Date;

  @Column({ name: 'activated_at', type: 'timestamptz', nullable: true })
  activatedAt: Date;

  @Column({ name: 'deactivated_at', type: 'timestamptz', nullable: true })
  deactivatedAt: Date;

  @Column({ name: 'deactivated_by', type: 'uuid', nullable: true })
  deactivatedBy: string;

  @Column({ name: 'deactivation_reason', type: 'text', nullable: true })
  deactivationReason: string;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl: string;

  @Column({ length: 50, nullable: true, default: 'UTC' })
  timezone: string;

  @Column({ type: 'jsonb', nullable: true, default: '{}' })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
