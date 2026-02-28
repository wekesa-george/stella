import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateNotesDto {
  @ApiProperty({ description: 'Draft handoff notes (autosave)' })
  @IsString()
  handoffNotes: string;
}
