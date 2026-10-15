import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryShiftHistoryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by shift status (e.g. active, ended)' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by operator user ID' })
  @IsOptional()
  @IsUUID()
  userId?: string;
}
