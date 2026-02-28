import { IsNotEmpty, IsUUID, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignRoleDto {
  @ApiProperty({ description: 'Role ID to assign' })
  @IsNotEmpty()
  @IsUUID()
  roleId: string;

  @ApiPropertyOptional({ description: 'Expiration date for the role assignment' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
