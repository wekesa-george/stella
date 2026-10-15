import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Shift } from './shift.entity';

@Entity({ schema: 'operations', name: 'shift_activities' })
export class ShiftActivity {
  @PrimaryGeneratedColumn('uuid', { name: 'activity_id' })
  activityId: string;

  @Column({ name: 'shift_id' })
  shiftId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ type: 'text' })
  action: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ length: 20, default: 'normal' })
  priority: string;

  @Column({ name: 'bot_id', nullable: true })
  botId: string;

  @Column({ name: 'alert_id', nullable: true })
  alertId: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Shift, (shift) => shift.activities)
  @JoinColumn({ name: 'shift_id' })
  shift: Shift;
}
