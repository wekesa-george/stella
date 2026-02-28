import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity({ schema: 'auth', name: 'user_profiles' })
export class UserProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'first_name', length: 100, nullable: true })
  firstName: string;

  @Column({ name: 'last_name', length: 100, nullable: true })
  lastName: string;

  @Column({ name: 'display_name', length: 200, nullable: true })
  displayName: string;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth: Date;

  @Column({ name: 'country_code', type: 'char', length: 2, nullable: true })
  countryCode: string;

  @Column({ length: 50, nullable: true, default: 'UTC' })
  timezone: string;

  @Column({ name: 'preferred_currency', type: 'char', length: 3, nullable: true, default: 'USD' })
  preferredCurrency: string;

  @Column({ length: 10, nullable: true, default: 'en' })
  language: string;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl: string;

  @Column({ type: 'text', nullable: true })
  bio: string;

  @Column({ name: 'risk_tolerance', length: 20, nullable: true })
  riskTolerance: string;

  @Column({ name: 'investment_experience', length: 20, nullable: true })
  investmentExperience: string;

  @Column({ name: 'annual_income_range', length: 30, nullable: true })
  annualIncomeRange: string;

  @Column({ name: 'net_worth_range', length: 30, nullable: true })
  netWorthRange: string;

  @Column({ name: 'investment_goals', type: 'jsonb', nullable: true, default: '[]' })
  investmentGoals: any[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => User, (user) => user.profile)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
