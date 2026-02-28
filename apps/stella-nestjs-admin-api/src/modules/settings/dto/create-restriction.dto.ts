import { IsString, IsIn, Length } from 'class-validator';

export class CreateRestrictionDto {
  @IsString() @Length(2, 2)
  countryCode: string;

  @IsString()
  countryName: string;

  @IsString()
  reason: string;

  @IsString() @IsIn(['blocked', 'restricted'])
  status: string;
}
