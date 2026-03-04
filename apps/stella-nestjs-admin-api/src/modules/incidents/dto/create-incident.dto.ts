import {
  IsUUID,
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  IsEnum,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { CreateKillSwitchDto } from './create-kill-switch.dto';
import { CreateRogueBotDto } from './create-rogue-bot.dto';

export enum ShiftType {
  AM = 'AM',
  PM = 'PM',
  Night = 'Night',
  Weekend = 'Weekend',
}

export enum IncidentPriority {
  P1 = 'P1',
  P2 = 'P2',
  P3 = 'P3',
  P4 = 'P4',
}

export enum IncidentCategory {
  TRADING_ERROR = 'trading_error',
  ROGUE_BOT = 'rogue_bot',
  EXCHANGE_ISSUE = 'exchange_issue',
  CONNECTIVITY = 'connectivity',
  DATA_FEED = 'data_feed',
  RISK_BREACH = 'risk_breach',
  KILL_SWITCH = 'kill_switch',
  MANUAL_INTERVENTION = 'manual_intervention',
  SYSTEM_ERROR = 'system_error',
  SECURITY = 'security',
  NIL_SHIFT = 'nil_shift',
  OTHER = 'other',
}

export class CreateIncidentDto {
  @ApiPropertyOptional({ description: 'Associated shift ID' })
  @IsOptional()
  @IsUUID()
  shiftId?: string;

  @ApiProperty({ description: 'Operator who logged the incident' })
  @IsUUID()
  operatorId: string;

  @ApiPropertyOptional({ description: 'Date of incident (YYYY-MM-DD), defaults to today' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ description: 'Time incident was detected (HH:MM)' })
  @IsOptional()
  @IsString()
  timeDetected?: string;

  @ApiProperty({ description: 'Shift type', enum: ShiftType })
  @IsEnum(ShiftType)
  shiftType: ShiftType;

  @ApiProperty({ description: 'Priority level', enum: IncidentPriority })
  @IsEnum(IncidentPriority)
  priority: IncidentPriority;

  @ApiProperty({ description: 'Incident category', enum: IncidentCategory })
  @IsEnum(IncidentCategory)
  category: IncidentCategory;

  @ApiPropertyOptional({ description: 'Bot reference identifier' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  botRef?: string;

  @ApiPropertyOptional({ description: 'Account reference identifier' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  accountRef?: string;

  @ApiProperty({ description: 'Incident title', maxLength: 150 })
  @IsString()
  @MaxLength(150)
  title: string;

  @ApiPropertyOptional({ description: 'Detailed description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Action taken to address the incident' })
  @IsOptional()
  @IsString()
  actionTaken?: string;

  @ApiPropertyOptional({ description: 'Whether supervisor was notified' })
  @IsOptional()
  @IsBoolean()
  supervisorNotified?: boolean;

  @ApiPropertyOptional({ description: 'Supervisor user ID' })
  @IsOptional()
  @IsUUID()
  supervisorId?: string;

  @ApiPropertyOptional({ description: 'P&L impact in USD' })
  @IsOptional()
  @IsNumber()
  pnlImpactUsd?: number;

  @ApiPropertyOptional({ description: 'Whether kill switch was activated' })
  @IsOptional()
  @IsBoolean()
  killSwitchActivated?: boolean;

  @ApiPropertyOptional({ description: 'Root cause analysis' })
  @IsOptional()
  @IsString()
  rootCause?: string;

  @ApiPropertyOptional({ description: 'Whether incident was preventable (yes/no/unknown)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  preventable?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Kill switch activation details (transactional create)', type: CreateKillSwitchDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateKillSwitchDto)
  killSwitch?: CreateKillSwitchDto;

  @ApiPropertyOptional({ description: 'Rogue bot details (transactional create)', type: CreateRogueBotDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateRogueBotDto)
  rogueBot?: CreateRogueBotDto;
}
