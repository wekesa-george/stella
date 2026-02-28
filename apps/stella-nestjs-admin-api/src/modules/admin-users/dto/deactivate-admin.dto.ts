import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeactivateAdminDto {
  @ApiProperty({ description: 'Reason for deactivation' })
  @IsNotEmpty()
  @IsString()
  reason: string;
}
