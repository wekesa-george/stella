import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ schema: 'kyc', name: 'applicants' })
export class KycApplicant {
  @PrimaryColumn({ length: 20 })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ length: 50 })
  provider: string;

  @Column({ name: 'provider_applicant_id', length: 255 })
  providerApplicantId: string;

  @Column({ length: 50, default: 'pending' })
  status: string;

  @Column({ name: 'account_tier', length: 50, nullable: true })
  accountTier: string;

  @Column({ name: 'country_code', length: 2 })
  countryCode: string;

  @Column({ name: 'document_type', length: 100, nullable: true })
  documentType: string;

  @Column({ name: 'document_number', length: 255, nullable: true })
  documentNumber: string;

  @Column({ name: 'document_expires_at', type: 'timestamptz', nullable: true })
  documentExpiresAt: Date;

  @Column({ name: 'risk_score', nullable: true })
  riskScore: number;

  @Column({ name: 'face_match_score', nullable: true })
  faceMatchScore: number;

  @Column({ name: 'document_authenticity_score', nullable: true })
  documentAuthenticityScore: number;

  @Column({ name: 'watchlist_hit', default: false })
  watchlistHit: boolean;

  @Column({ name: 'reviewed_by_user_id', type: 'uuid', nullable: true })
  reviewedByUserId: string;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date;

  @Column({ name: 'submitted_at', type: 'timestamptz', default: () => 'NOW()' })
  submittedAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date;
}
