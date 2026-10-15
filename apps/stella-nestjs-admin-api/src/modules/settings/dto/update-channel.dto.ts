import { IsOptional, IsBoolean, IsObject, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateChannelDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Channel-specific config (webhook URL, recipients, etc.)' })
  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}
