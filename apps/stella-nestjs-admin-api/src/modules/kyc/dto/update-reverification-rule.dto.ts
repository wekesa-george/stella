import { IsOptional, IsString, IsInt, IsBoolean, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateReverificationRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ruleName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  triggerEvent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  frequencyDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetTier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
