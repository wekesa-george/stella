import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'compliance', name: 'jurisdiction_restrictions' })
export class JurisdictionRestriction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { name: 'country_code', length: 2, unique: true })
  countryCode: string;

  @Column('varchar', { name: 'country_name', length: 255 })
  countryName: string;

  @Column('text')
  reason: string;

  @Column('varchar', { length: 50 })
  status: string;

  @Column('boolean', { name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column('uuid', { name: 'created_by_user_id', nullable: true })
  createdByUserId: string | null;
}
