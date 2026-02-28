import { IsNumber, IsBoolean, IsOptional, Min, Max, IsArray, IsString } from 'class-validator';

export class UpdateSecurityConfigDto {
  @IsOptional() @IsNumber() @Min(1)
  sessionTimeoutMinutes?: number;

  @IsOptional() @IsBoolean()
  forceTwoFa?: boolean;

  @IsOptional() @IsNumber() @Min(8) @Max(128)
  minPasswordLength?: number;

  @IsOptional() @IsBoolean()
  requireSpecialChars?: boolean;

  @IsOptional() @IsNumber() @Min(1)
  maxLoginAttempts?: number;

  @IsOptional() @IsBoolean()
  ipAllowlistEnabled?: boolean;

  @IsOptional() @IsNumber() @Min(1)
  auditRetentionYears?: number;

  @IsOptional() @IsArray() @IsString({ each: true })
  ipAddresses?: string[];
}
