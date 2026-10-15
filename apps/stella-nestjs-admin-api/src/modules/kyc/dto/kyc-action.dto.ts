import { IsNotEmpty, IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class KycActionDto {
  @ApiProperty({ enum: ['approve', 'decline', 're-verify'] })
  @IsNotEmpty()
  @IsIn(['approve', 'decline', 're-verify'])
  action: string;

  @ApiProperty({ description: 'Compliance note (mandatory)' })
  @IsNotEmpty()
  @IsString()
  note: string;

  @ApiPropertyOptional({ description: 'Account tier (for approve action)', enum: ['Standard', 'Enhanced', 'Accredited'] })
  @IsOptional()
  @IsString()
  tier?: string;
}
