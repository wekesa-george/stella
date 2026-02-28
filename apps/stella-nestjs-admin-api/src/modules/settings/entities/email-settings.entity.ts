import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'platform', name: 'email_settings' })
export class EmailSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { name: 'sender_name', length: 255 })
  senderName: string;

  @Column('varchar', { name: 'sender_email', length: 255 })
  senderEmail: string;

  @Column('varchar', { name: 'support_email', length: 255 })
  supportEmail: string;

  @Column('varchar', { name: 'smtp_host', length: 255, nullable: true })
  smtpHost: string | null;

  @Column('int', { name: 'smtp_port', nullable: true })
  smtpPort: number | null;

  @Column('varchar', { name: 'smtp_username', length: 255, nullable: true })
  smtpUsername: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column('uuid', { name: 'updated_by_user_id', nullable: true })
  updatedByUserId: string | null;
}
