import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, IsArray, IsUUID, IsOptional, MinLength, Matches, MaxLength } from 'class-validator';

export class InviteAdminDto {
  @ApiProperty({ example: 'jane.doe@stella.io' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'jane_doe', description: 'Unique username (lowercase alphanumeric, underscores allowed, must not be an email)' })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Matches(/^[a-z_][a-z0-9_]*$/, { message: 'Username must be lowercase, start with a letter or underscore, and contain only lowercase letters, numbers, and underscores' })
  username: string;

  @ApiProperty({ example: 'Jane' })
  @IsString()
  @MinLength(1)
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @MinLength(1)
  lastName: string;

  @ApiPropertyOptional({ example: ['+1 555 123 4567'] })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    description: 'Role IDs to assign on creation',
    example: ['uuid-1', 'uuid-2'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds?: string[];
}
