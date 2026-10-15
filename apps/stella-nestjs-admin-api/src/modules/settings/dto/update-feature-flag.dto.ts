import { IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateFeatureFlagDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabledProduction?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabledStaging?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabledDevelopment?: boolean;
}
