import { IsUUID, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class HandoffDto {
  @ApiProperty()
  @IsUUID()
  shiftId: string;

  @ApiProperty({ description: 'Handoff notes summary' })
  @IsString()
  handoffNotes: string;

  @ApiProperty({ description: 'User ID receiving the handoff' })
  @IsUUID()
  receivedBy: string;
}
