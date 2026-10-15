import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateAlertTypeDto {
  @ApiProperty()
  @IsBoolean()
  isEnabled: boolean;
}
