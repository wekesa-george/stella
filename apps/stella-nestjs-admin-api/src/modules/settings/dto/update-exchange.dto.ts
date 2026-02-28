import { IsOptional, IsInt, IsBoolean, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateExchangeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  rateLimitPerSecond?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
