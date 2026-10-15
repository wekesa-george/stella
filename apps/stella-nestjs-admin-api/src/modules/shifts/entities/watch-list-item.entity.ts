import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Shift } from './shift.entity';

@Entity({ schema: 'operations', name: 'watch_list_items' })
export class WatchListItem {
  @PrimaryGeneratedColumn('uuid', { name: 'watch_item_id' })
  watchItemId: string;

  @Column({ name: 'shift_id' })
  shiftId: string;

  @Column({ name: 'created_by' })
  createdBy: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 20, default: 'warning' })
  priority: string;

  @Column({ length: 20, default: 'active' })
  status: string;

  @Column({ name: 'bot_id', nullable: true })
  botId: string;

  @Column({ name: 'service_name', length: 100, nullable: true })
  serviceName: string;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date;

  @Column({ name: 'resolved_by', nullable: true })
  resolvedBy: string;

  @Column({ name: 'resolution_notes', type: 'text', nullable: true })
  resolutionNotes: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Shift, (shift) => shift.watchItems)
  @JoinColumn({ name: 'shift_id' })
  shift: Shift;
}
