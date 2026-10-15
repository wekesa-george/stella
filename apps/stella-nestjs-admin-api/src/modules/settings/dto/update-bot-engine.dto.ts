import { IsNumber, IsBoolean, IsOptional, Min, Max } from 'class-validator';

export class UpdateBotEngineDto {
  @IsOptional() @IsNumber() @Min(1) @Max(60)
  heartbeatIntervalSec?: number;

  @IsOptional() @IsNumber() @Min(5) @Max(300)
  orderTimeoutSec?: number;

  @IsOptional() @IsNumber() @Min(60) @Max(3600)
  maxOrderAgeSec?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(10)
  retryAttempts?: number;

  @IsOptional() @IsNumber() @Min(1) @Max(5)
  retryBackoffMultiplier?: number;

  @IsOptional() @IsNumber() @Min(1) @Max(60)
  reconcileFrequencyMin?: number;

  @IsOptional() @IsNumber() @Min(0.01) @Max(5)
  defaultSlippagePct?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(8)
  positionPrecision?: number;

  @IsOptional() @IsBoolean()
  enableHeartbeatAlert?: boolean;

  @IsOptional() @IsBoolean()
  enableStaleOrderCancel?: boolean;

  @IsOptional() @IsBoolean()
  enableAutoReconcile?: boolean;

  @IsOptional() @IsBoolean()
  enablePartialFillContinue?: boolean;
}
