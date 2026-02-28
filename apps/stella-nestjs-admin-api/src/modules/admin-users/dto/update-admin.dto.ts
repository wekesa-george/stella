import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MinLength, Matches, MaxLength } from 'class-validator';

export class UpdateAdminDto {
  @ApiPropertyOptional({ example: 'jane_doe', description: 'Unique username (lowercase alphanumeric, underscores allowed, must not be an email)' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Matches(/^[a-z_][a-z0-9_]*$/, { message: 'Username must be lowercase, start with a letter or underscore, and contain only lowercase letters, numbers, and underscores' })
  username?: string;

  @ApiPropertyOptional({ example: 'Jane' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string;

  @ApiPropertyOptional({ example: '+1 555 123 4567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'America/New_York' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.png' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
