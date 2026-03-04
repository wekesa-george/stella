import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { KillSwitchActivation } from './kill-switch-activation.entity';
import { RogueBotIncident } from './rogue-bot-incident.entity';

@Entity({ schema: 'operations', name: 'incidents' })
export class Incident {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'incident_number', type: 'varchar', length: 20, unique: true })
  incidentNumber: string;

  @Column({ name: 'shift_id', type: 'uuid', nullable: true })
  shiftId: string;

  @Column({ name: 'operator_id', type: 'uuid' })
  operatorId: string;

  @Column({ name: 'date', type: 'date' })
  date: string;

  @Column({ name: 'time_detected', type: 'varchar', nullable: true })
  timeDetected: string;

  @Column({ name: 'shift_type', type: 'varchar' })
  shiftType: string;

  @Column({ name: 'priority', type: 'varchar' })
  priority: string;

  @Column({ name: 'category', type: 'varchar' })
  category: string;

  @Column({ name: 'bot_ref', type: 'varchar', length: 50, nullable: true })
  botRef: string;

  @Column({ name: 'account_ref', type: 'varchar', length: 50, nullable: true })
  accountRef: string;

  @Column({ name: 'title', type: 'varchar', length: 150 })
  title: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string;

  @Column({ name: 'action_taken', type: 'text', nullable: true })
  actionTaken: string;

  @Column({ name: 'supervisor_notified', type: 'boolean', default: false })
  supervisorNotified: boolean;

  @Column({ name: 'supervisor_id', type: 'uuid', nullable: true })
  supervisorId: string;

  @Column({ name: 'supervisor_notified_at', type: 'timestamptz', nullable: true })
  supervisorNotifiedAt: Date;

  @Column({ name: 'supervisor_countersigned_by', type: 'uuid', nullable: true })
  supervisorCountersignedBy: string;

  @Column({ name: 'supervisor_countersigned_at', type: 'timestamptz', nullable: true })
  supervisorCountersignedAt: Date;

  @Column({ name: 'time_to_contain_mins', type: 'int', nullable: true })
  timeToContainMins: number;

  @Column({ name: 'time_to_resolve_mins', type: 'int', nullable: true })
  timeToResolveMins: number;

  @Column({ name: 'status', type: 'varchar', default: 'open' })
  status: string;

  @Column({ name: 'escalated_to', type: 'varchar', length: 200, nullable: true })
  escalatedTo: string;

  @Column({
    name: 'pnl_impact_usd',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => (value !== null ? parseFloat(value) : null),
    },
  })
  pnlImpactUsd: number;

  @Column({ name: 'kill_switch_activated', type: 'boolean', default: false })
  killSwitchActivated: boolean;

  @Column({ name: 'root_cause', type: 'text', nullable: true })
  rootCause: string;

  @Column({ name: 'preventable', type: 'varchar', length: 20, nullable: true })
  preventable: string;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'corrects_incident_id', type: 'uuid', nullable: true })
  correctsIncidentId: string;

  @Column({ name: 'is_correction', type: 'boolean', default: false })
  isCorrection: boolean;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt: Date;

  @Column({ name: 'archived_by', type: 'uuid', nullable: true })
  archivedBy: string;

  @Column({ name: 'archive_month', type: 'varchar', length: 7, nullable: true })
  archiveMonth: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => KillSwitchActivation, (ks) => ks.incident)
  killSwitchActivations: KillSwitchActivation[];

  @OneToMany(() => RogueBotIncident, (rb) => rb.incident)
  rogueBotIncidents: RogueBotIncident[];
}
