import { IsString, IsOptional, IsEmail } from 'class-validator';

export class UpdateEmailSettingsDto {
  @IsOptional() @IsString()
  senderName?: string;

  @IsOptional() @IsEmail()
  senderEmail?: string;

  @IsOptional() @IsEmail()
  supportEmail?: string;
}
