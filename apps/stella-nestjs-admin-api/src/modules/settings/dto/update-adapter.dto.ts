import { IsOptional, IsEnum, IsString, IsInt, IsNumber, IsBoolean, IsObject, IsUrl, Min } from 'class-validator';
import { AdapterStatus } from '../entities/adapter.entity';

export class UpdateAdapterDto {
  @IsOptional()
  @IsEnum(AdapterStatus)
  status?: AdapterStatus;

  @IsOptional()
  @IsString()
  maintenanceMessage?: string;

  @IsOptional()
  @IsString()
  baseUrl?: string | null;

  @IsOptional()
  @IsString()
  wsUrl?: string | null;

  @IsOptional()
  @IsString()
  sandboxBaseUrl?: string | null;

  @IsOptional()
  @IsString()
  sandboxWsUrl?: string | null;

  @IsOptional()
  @IsString()
  authModel?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  rateLimitOrders?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  rateLimitQueries?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  rateLimitWs?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderSizeUsd?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxOrderSizeUsd?: number;

  @IsOptional()
  @IsBoolean()
  supportsSpot?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsMargin?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsFutures?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsOptions?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsStaking?: boolean;

  @IsOptional()
  @IsObject()
  executionCapabilities?: Record<string, any>;

  @IsOptional()
  @IsObject()
  feeSchedule?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  allowAllPairs?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresPlatformAuth?: boolean;

  @IsOptional()
  @IsString()
  platformApiKey?: string | null;

  @IsOptional()
  @IsString()
  platformApiSecret?: string | null;

  @IsOptional()
  @IsString()
  platformApiPassword?: string | null;

  @IsOptional()
  @IsString()
  sandboxApiKey?: string | null;

  @IsOptional()
  @IsString()
  sandboxApiSecret?: string | null;

  @IsOptional()
  @IsString()
  sandboxApiPassword?: string | null;
}
