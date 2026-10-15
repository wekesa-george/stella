import {
  IsUUID,
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateKillSwitchDto {
  @ApiProperty({ description: 'Date of activation (YYYY-MM-DD)' })
  @IsString()
  date: string;

  @ApiProperty({ description: 'Time kill switch was activated (HH:MM)' })
  @IsString()
  timeActivated: string;

  @ApiProperty({ description: 'Operator who activated kill switch' })
  @IsUUID()
  operatorId: string;

  @ApiPropertyOptional({ description: 'When supervisor was notified' })
  @IsOptional()
  @IsString()
  supervisorNotifiedAt?: string;

  @ApiProperty({ description: 'Scope of kill switch (e.g. single_bot, account, global)' })
  @IsString()
  scope: string;

  @ApiPropertyOptional({ description: 'List of affected bot references', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  botsAffected?: string[];

  @ApiPropertyOptional({ description: 'List of affected account references', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  accountRefs?: string[];

  @ApiProperty({ description: 'Reason for kill switch activation' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ description: 'Open orders at time of activation' })
  @IsOptional()
  @IsString()
  openOrdersAtActivation?: string;

  @ApiPropertyOptional({ description: 'P&L at time of activation in USD' })
  @IsOptional()
  @IsNumber()
  pnlAtActivationUsd?: number;

  @ApiPropertyOptional({ description: 'Time to resolve (interval string e.g. "2h 30m")' })
  @IsOptional()
  @IsString()
  timeToResolveInterval?: string;

  @ApiPropertyOptional({ description: 'Who authorized the restart' })
  @IsOptional()
  @IsString()
  authorizedRestartBy?: string;

  @ApiPropertyOptional({ description: 'When restart was authorized' })
  @IsOptional()
  @IsString()
  authorizedRestartAt?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
