import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ schema: 'kyc', name: 'provider_config' })
export class KycProvider {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50, unique: true })
  provider: string;

  @Column({ name: 'api_key_encrypted', type: 'text' })
  apiKeyEncrypted: string;

  @Column({ name: 'api_secret_encrypted', type: 'text', nullable: true })
  apiSecretEncrypted: string;

  @Column({ name: 'webhook_secret_encrypted', type: 'text' })
  webhookSecretEncrypted: string;

  @Column({ name: 'base_url', type: 'text' })
  baseUrl: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'is_sandbox', default: false })
  isSandbox: boolean;

  @Column({ length: 7, nullable: true })
  color: string;

  @Column({ name: 'bg_color', length: 9, nullable: true })
  bgColor: string;

  @Column({ length: 10, nullable: true })
  abbreviation: string;

  @Column({ name: 'logo_filename', length: 255, nullable: true })
  logoFilename: string;

  @Column({ name: 'docs_url', type: 'text', nullable: true })
  docsUrl: string;

  @Column({ name: 'updated_by_user_id', type: 'uuid', nullable: true })
  updatedByUserId: string;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
