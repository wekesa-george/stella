import { IsNumber, IsOptional, Min, Max } from 'class-validator';

export class UpdateBillingConfigDto {
  @IsOptional() @IsNumber() @Min(0) @Max(0.5)
  platformFeePct?: number;

  @IsOptional() @IsNumber() @Min(0)
  minAumFreeTier?: number;

  @IsOptional() @IsNumber() @Min(0)
  maxAumFreeTier?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(0.5)
  tierStandardFeePct?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(0.5)
  tierProFeePct?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(0.5)
  tierEnterpriseFeePct?: number;
}
