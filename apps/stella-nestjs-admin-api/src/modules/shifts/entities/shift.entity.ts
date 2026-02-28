import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ShiftActivity } from './shift-activity.entity';

@Entity({ schema: 'operations', name: 'shifts' })
export class Shift {
  @PrimaryGeneratedColumn('uuid', { name: 'shift_id' })
  shiftId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'start_time', type: 'timestamptz' })
  startTime: Date;

  @Column({ name: 'end_time', type: 'timestamptz', nullable: true })
  endTime: Date;

  @Column({ name: 'duration_minutes', nullable: true })
  durationMinutes: number;

  @Column({ length: 20, default: 'active' })
  status: string;

  @Column({ name: 'actions_count', default: 0 })
  actionsCount: number;

  @Column({ name: 'incidents_count', default: 0 })
  incidentsCount: number;

  @Column({ name: 'handoff_notes', type: 'text', nullable: true })
  handoffNotes: string;

  @Column({ name: 'handoff_submitted_at', type: 'timestamptz', nullable: true })
  handoffSubmittedAt: Date;

  @Column({ name: 'handoff_received_by', nullable: true })
  handoffReceivedBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => ShiftActivity, (activity) => activity.shift)
  activities: ShiftActivity[];
}
