import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ schema: 'platform', name: 'webhook_signing_keys' })
export class WebhookSigningKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { name: 'signing_secret', length: 64, unique: true })
  signingSecret: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column('timestamptz', { name: 'retired_at', nullable: true })
  retiredAt: Date | null;

  @Column('boolean', { name: 'is_active', default: true })
  isActive: boolean;
}
