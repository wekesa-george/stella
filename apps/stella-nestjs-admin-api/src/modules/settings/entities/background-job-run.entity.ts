import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity({ schema: 'platform', name: 'background_job_runs' })
export class BackgroundJobRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { name: 'job_name', length: 100 })
  jobName: string;

  @Column('varchar', { length: 20, default: 'completed' })
  status: string;

  @Column('varchar', { name: 'triggered_by', length: 50, default: 'system' })
  triggeredBy: string;

  @Column('int', { name: 'duration_ms', nullable: true })
  durationMs: number | null;

  @Column('text', { name: 'error_message', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column('timestamptz', { name: 'finished_at', nullable: true })
  finishedAt: Date | null;
}
