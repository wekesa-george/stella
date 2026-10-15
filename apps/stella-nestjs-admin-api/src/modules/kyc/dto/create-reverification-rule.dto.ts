import { IsString, IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReverificationRuleDto {
  @ApiProperty()
  @IsString()
  ruleName: string;

  @ApiProperty()
  @IsString()
  triggerEvent: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  frequencyDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetTier?: string;
}
