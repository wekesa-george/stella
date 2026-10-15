import { IsUUID, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShiftType } from './create-incident.dto';

export class NilShiftDto {
  @ApiProperty({ description: 'Operator who logged the nil shift' })
  @IsUUID()
  operatorId: string;

  @ApiProperty({ description: 'Shift type', enum: ShiftType })
  @IsEnum(ShiftType)
  shiftType: ShiftType;

  @ApiPropertyOptional({ description: 'Associated shift ID' })
  @IsOptional()
  @IsUUID()
  shiftId?: string;
}
