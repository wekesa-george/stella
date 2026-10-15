import { IsOptional, IsString, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryAlertsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ['active', 'triggered', 'acknowledged', 'resolved', 'snoozed'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Alert type filter' })
  @IsOptional()
  @IsString()
  alertType?: string;

  @ApiPropertyOptional({ description: 'Monitored entity (bot, position, system)' })
  @IsOptional()
  @IsString()
  monitoredEntity?: string;

  @ApiPropertyOptional({ description: 'Filter from date (ISO)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Filter to date (ISO)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
