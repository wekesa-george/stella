import {
  IsOptional,
  IsNumber,
  IsArray,
  IsString,
  IsObject,
  Min,
  Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAssetTierConfigDto {
  @ApiPropertyOptional({ description: 'Tier 1 (Starter) minimum balance in USD' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  tier1MinBalance?: number;

  @ApiPropertyOptional({ description: 'Tier 2 (Growth) minimum balance in USD' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  tier2MinBalance?: number;

  @ApiPropertyOptional({ description: 'Tier 3 (Established) minimum balance in USD' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  tier3MinBalance?: number;

  @ApiPropertyOptional({ description: 'Tier 4 (Advanced) minimum balance in USD' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  tier4MinBalance?: number;

  @ApiPropertyOptional({ description: 'Tier 1 max position size as fraction of balance (e.g. 0.12 = 12%)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  tier1MaxPositionPct?: number;

  @ApiPropertyOptional({ description: 'Tier 2 max position size as fraction of balance' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  tier2MaxPositionPct?: number;

  @ApiPropertyOptional({ description: 'Tier 3 max position size as fraction of balance' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  tier3MaxPositionPct?: number;

  @ApiPropertyOptional({ description: 'Tier 4 max position size as fraction of balance' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  tier4MaxPositionPct?: number;

  @ApiPropertyOptional({ description: 'Tier 1 max concurrent positions' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  tier1MaxPositions?: number;

  @ApiPropertyOptional({ description: 'Tier 2 max concurrent positions' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  tier2MaxPositions?: number;

  @ApiPropertyOptional({ description: 'Tier 3 max concurrent positions' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  tier3MaxPositions?: number;

  @ApiPropertyOptional({ description: 'Tier 4 max concurrent positions' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  tier4MaxPositions?: number;

  @ApiPropertyOptional({ description: 'Tier 1 asset symbols', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tier1Assets?: string[];

  @ApiPropertyOptional({ description: 'Tier 2 asset symbols', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tier2Assets?: string[];

  @ApiPropertyOptional({ description: 'Tier 3 asset symbols', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tier3Assets?: string[];

  @ApiPropertyOptional({ description: 'Tier 4 asset symbols', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tier4Assets?: string[];

  @ApiPropertyOptional({ description: 'Global max position size cap as fraction' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  maxPositionPct?: number;

  @ApiPropertyOptional({ description: 'Confidence multipliers keyed by threshold' })
  @IsOptional()
  @IsObject()
  confidenceMultipliers?: Record<string, number>;
}
