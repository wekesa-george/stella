import { IsString, IsOptional } from 'class-validator';

export class UpdateEmailTemplateDto {
  @IsOptional() @IsString()
  subjectLine?: string;

  @IsOptional() @IsString()
  bodyMarkdown?: string;
}
