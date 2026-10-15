import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RotateCredentialsDto {
  @ApiProperty()
  @IsString()
  apiKey: string;

  @ApiProperty()
  @IsString()
  apiSecret: string;
}
