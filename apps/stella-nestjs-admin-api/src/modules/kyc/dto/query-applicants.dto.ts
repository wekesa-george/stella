import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryApplicantsDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Search by name, email, or applicant ID' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['pending', 'approved', 'review', 'declined', 'expiring', 're-verify'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ enum: ['sumsub', 'onfido', 'persona'] })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({ description: 'Filter by region name' })
  @IsOptional()
  @IsString()
  region?: string;
}
