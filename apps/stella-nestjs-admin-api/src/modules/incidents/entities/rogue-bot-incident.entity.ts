import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Incident } from './incident.entity';

@Entity({ schema: 'operations', name: 'rogue_bot_incidents' })
export class RogueBotIncident {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'incident_id', type: 'uuid' })
  incidentId: string;

  @Column({ name: 'date', type: 'date' })
  date: string;

  @Column({ name: 'time_detected', type: 'varchar' })
  timeDetected: string;

  @Column({ name: 'operator_id', type: 'uuid' })
  operatorId: string;

  @Column({ name: 'bot_ref', type: 'varchar', length: 50 })
  botRef: string;

  @Column({ name: 'account_ref', type: 'varchar', length: 50, nullable: true })
  accountRef: string;

  @Column({ name: 'rogue_behaviour_observed', type: 'text' })
  rogueBehaviourObserved: string;

  @Column({ name: 'normal_freq_per_hour', type: 'int', nullable: true })
  normalFreqPerHour: number;

  @Column({ name: 'rogue_freq_per_hour', type: 'int', nullable: true })
  rogueFreqPerHour: number;

  @Column({ name: 'wrong_pair', type: 'boolean', default: false })
  wrongPair: boolean;

  @Column({ name: 'wrong_direction', type: 'boolean', default: false })
  wrongDirection: boolean;

  @Column({ name: 'immediate_action', type: 'text', nullable: true })
  immediateAction: string;

  @Column({ name: 'kill_switch_activated', type: 'boolean', default: false })
  killSwitchActivated: boolean;

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

  @Column({ name: 'root_cause', type: 'text', nullable: true })
  rootCause: string;

  @Column({ name: 'supervisor_signoff_id', type: 'uuid', nullable: true })
  supervisorSignoffId: string;

  @Column({ name: 'supervisor_signoff_at', type: 'timestamptz', nullable: true })
  supervisorSignoffAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Incident, (incident) => incident.rogueBotIncidents)
  @JoinColumn({ name: 'incident_id' })
  incident: Incident;
}
