import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SummaryQueryDto {
  @ApiProperty({ description: 'Month to summarize (YYYY-MM)', example: '2026-03' })
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be in YYYY-MM format' })
  month: string;
}
