import {
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  IsEnum,
  IsInt,
  MaxLength,
  IsUUID,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ShiftType, IncidentPriority, IncidentCategory } from './create-incident.dto';

export class UpdateIncidentDto {
  @ApiPropertyOptional({ description: 'Associated shift ID' })
  @IsOptional()
  @IsUUID()
  shiftId?: string;

  @ApiPropertyOptional({ description: 'Date of incident (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ description: 'Time incident was detected (HH:MM)' })
  @IsOptional()
  @IsString()
  timeDetected?: string;

  @ApiPropertyOptional({ description: 'Shift type', enum: ShiftType })
  @IsOptional()
  @IsEnum(ShiftType)
  shiftType?: ShiftType;

  @ApiPropertyOptional({ description: 'Priority level', enum: IncidentPriority })
  @IsOptional()
  @IsEnum(IncidentPriority)
  priority?: IncidentPriority;

  @ApiPropertyOptional({ description: 'Incident category', enum: IncidentCategory })
  @IsOptional()
  @IsEnum(IncidentCategory)
  category?: IncidentCategory;

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

  @ApiPropertyOptional({ description: 'Incident title', maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

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

  @ApiPropertyOptional({ description: 'Incident status' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Escalated to (name or role)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  escalatedTo?: string;

  @ApiPropertyOptional({ description: 'Time to contain in minutes' })
  @IsOptional()
  @IsInt()
  timeToContainMins?: number;

  @ApiPropertyOptional({ description: 'Time to resolve in minutes' })
  @IsOptional()
  @IsInt()
  timeToResolveMins?: number;

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
}
