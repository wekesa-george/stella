import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Incident } from './incident.entity';

@Entity({ schema: 'operations', name: 'kill_switch_activations' })
export class KillSwitchActivation {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'incident_id', type: 'uuid' })
  incidentId: string;

  @Column({ name: 'date', type: 'date' })
  date: string;

  @Column({ name: 'time_activated', type: 'varchar' })
  timeActivated: string;

  @Column({ name: 'operator_id', type: 'uuid' })
  operatorId: string;

  @Column({ name: 'supervisor_notified_at', type: 'timestamptz', nullable: true })
  supervisorNotifiedAt: Date;

  @Column({ name: 'scope', type: 'varchar' })
  scope: string;

  @Column('text', { name: 'bots_affected', array: true, nullable: true })
  botsAffected: string[];

  @Column('text', { name: 'account_refs', array: true, nullable: true })
  accountRefs: string[];

  @Column({ name: 'reason', type: 'text' })
  reason: string;

  @Column({ name: 'open_orders_at_activation', type: 'text', nullable: true })
  openOrdersAtActivation: string;

  @Column({
    name: 'pnl_at_activation_usd',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => (value !== null ? parseFloat(value) : null),
    },
  })
  pnlAtActivationUsd: number;

  @Column({ name: 'time_to_resolve_interval', type: 'varchar', nullable: true })
  timeToResolveInterval: string;

  @Column({ name: 'authorized_restart_by', type: 'varchar', length: 200, nullable: true })
  authorizedRestartBy: string;

  @Column({ name: 'authorized_restart_at', type: 'timestamptz', nullable: true })
  authorizedRestartAt: Date;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Incident, (incident) => incident.killSwitchActivations)
  @JoinColumn({ name: 'incident_id' })
  incident: Incident;
}
