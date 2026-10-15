import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ schema: 'platform', name: 'ip_allowlist' })
export class IpAllowlist {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { name: 'ip_cidr', length: 50 })
  ipCidr: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column('int', { name: 'created_by_user_id', nullable: true })
  createdByUserId: number | null;

  @Column('timestamptz', { name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}
