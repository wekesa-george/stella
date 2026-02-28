import { IsNumber, IsBoolean, IsOptional, Min, Max } from 'class-validator';

export class UpdateRiskControlsDto {
  @IsOptional() @IsNumber() @Min(1) @Max(30)
  maxDrawdownPct?: number;

  @IsOptional() @IsNumber() @Min(1) @Max(20)
  dailyLossLimitPct?: number;

  @IsOptional() @IsNumber() @Min(5) @Max(50)
  circuitBreakerPct?: number;

  @IsOptional() @IsNumber() @Min(1) @Max(24)
  circuitBreakerWindowHours?: number;

  @IsOptional() @IsNumber() @Min(0.05) @Max(3)
  maxSlippagePct?: number;

  @IsOptional() @IsNumber() @Min(1) @Max(50)
  maxPositionSizePct?: number;

  @IsOptional() @IsNumber() @Min(1) @Max(100)
  maxConcurrentPositions?: number;

  @IsOptional() @IsNumber() @Min(1) @Max(125)
  maxLeverage?: number;

  @IsOptional() @IsNumber() @Min(1) @Max(50)
  maxBotsPerUser?: number;

  @IsOptional() @IsBoolean()
  forceLimitOrders?: boolean;

  @IsOptional() @IsBoolean()
  autoHaltOnCircuit?: boolean;

  @IsOptional() @IsBoolean()
  notifyOnDrawdown?: boolean;

  @IsOptional() @IsBoolean()
  allowMarketOrders?: boolean;

  @IsOptional() @IsBoolean()
  requireStopLoss?: boolean;
}
