import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ schema: 'platform', name: 'alert_types' })
export class AlertType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { name: 'alert_key', length: 100, unique: true })
  alertKey: string;

  @Column('varchar', { length: 200 })
  description: string;

  @Column('varchar', { length: 20 })
  severity: string;

  @Column('boolean', { name: 'is_enabled', default: true })
  isEnabled: boolean;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
