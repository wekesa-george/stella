import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'platform', name: 'integrations' })
export class Integration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { name: 'integration_key', length: 50, unique: true })
  integrationKey: string;

  @Column('varchar', { length: 100 })
  name: string;

  @Column('varchar', { length: 50 })
  category: string;

  @Column('varchar', { length: 10, nullable: true })
  icon: string | null;

  @Column('text', { nullable: true })
  description: string | null;

  @Column('varchar', { length: 50 })
  status: string;

  @Column('jsonb', { default: '{}' })
  config: Record<string, any>;

  @Column('timestamptz', { name: 'last_synced_at', nullable: true })
  lastSyncedAt: Date | null;

  @Column('text', { name: 'last_error', nullable: true })
  lastError: string | null;

  @Column('boolean', { name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
