import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class StartShiftDto {
  @ApiProperty({ description: 'User ID of the operator starting the shift' })
  @IsUUID()
  userId: string;
}
