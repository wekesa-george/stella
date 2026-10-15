import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateWebhookDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
