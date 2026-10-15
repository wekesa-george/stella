import {
  IsUUID,
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  IsInt,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRogueBotDto {
  @ApiProperty({ description: 'Date of detection (YYYY-MM-DD)' })
  @IsString()
  date: string;

  @ApiProperty({ description: 'Time rogue behaviour was detected (HH:MM)' })
  @IsString()
  timeDetected: string;

  @ApiProperty({ description: 'Operator who detected the rogue bot' })
  @IsUUID()
  operatorId: string;

  @ApiProperty({ description: 'Bot reference identifier' })
  @IsString()
  @MaxLength(50)
  botRef: string;

  @ApiPropertyOptional({ description: 'Account reference identifier' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  accountRef?: string;

  @ApiProperty({ description: 'Description of observed rogue behaviour' })
  @IsString()
  rogueBehaviourObserved: string;

  @ApiPropertyOptional({ description: 'Normal trading frequency per hour' })
  @IsOptional()
  @IsInt()
  normalFreqPerHour?: number;

  @ApiPropertyOptional({ description: 'Rogue trading frequency per hour' })
  @IsOptional()
  @IsInt()
  rogueFreqPerHour?: number;

  @ApiPropertyOptional({ description: 'Whether bot traded wrong pair' })
  @IsOptional()
  @IsBoolean()
  wrongPair?: boolean;

  @ApiPropertyOptional({ description: 'Whether bot traded wrong direction' })
  @IsOptional()
  @IsBoolean()
  wrongDirection?: boolean;

  @ApiPropertyOptional({ description: 'Immediate action taken' })
  @IsOptional()
  @IsString()
  immediateAction?: string;

  @ApiPropertyOptional({ description: 'Whether kill switch was activated' })
  @IsOptional()
  @IsBoolean()
  killSwitchActivated?: boolean;

  @ApiPropertyOptional({ description: 'P&L impact in USD' })
  @IsOptional()
  @IsNumber()
  pnlImpactUsd?: number;

  @ApiPropertyOptional({ description: 'Root cause analysis' })
  @IsOptional()
  @IsString()
  rootCause?: string;

  @ApiPropertyOptional({ description: 'Supervisor who signed off' })
  @IsOptional()
  @IsUUID()
  supervisorSignoffId?: string;

  @ApiPropertyOptional({ description: 'When supervisor signed off' })
  @IsOptional()
  @IsString()
  supervisorSignoffAt?: string;
}
