import { IsBoolean, IsArray, IsUUID } from 'class-validator';

export class ToggleTradingPairDto {
  @IsBoolean()
  isActive: boolean;
}

export class BulkToggleTradingPairsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  pairIds: string[];

  @IsBoolean()
  isActive: boolean;
}
