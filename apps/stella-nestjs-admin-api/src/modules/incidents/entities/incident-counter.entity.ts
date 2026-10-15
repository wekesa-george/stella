import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity({ schema: 'operations', name: 'incident_counters' })
export class IncidentCounter {
  @PrimaryColumn({ name: 'year', type: 'int' })
  year: number;

  @Column({ name: 'last_number', type: 'int', default: 0 })
  lastNumber: number;
}
