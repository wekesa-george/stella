import { IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkAcknowledgeDto {
  @ApiProperty({ type: [String], description: 'Array of alert UUIDs to acknowledge' })
  @IsArray()
  @IsUUID('4', { each: true })
  ids: string[];
}
