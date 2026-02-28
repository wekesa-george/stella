import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateComplianceDto {
  @IsOptional() @IsBoolean()
  kycRequired?: boolean;

  @IsOptional() @IsNumber() @Min(0)
  enhancedDdThresholdUsd?: number;

  @IsOptional() @IsBoolean()
  sanctionsScreeningEnabled?: boolean;

  @IsOptional() @IsBoolean()
  amlMonitoringEnabled?: boolean;
}
