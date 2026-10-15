import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateRoutingDto {
  @ApiProperty()
  @IsBoolean()
  isEnabled: boolean;
}
