import { IsString, IsArray, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRegionDto {
  @ApiProperty()
  @IsString()
  regionName: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  countryCodes: string[];

  @ApiProperty()
  @IsString()
  primaryProvider: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fallbackProvider?: string;
}
