import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FinanceService } from './finance.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@ApiTags('Finance')
@ApiBearerAuth()
@Controller('finance')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  // === Page 13: Finance Overview ===

  @Get('platform-kpis')
  @RequirePermissions('finance.view_overview')
  @ApiOperation({ summary: 'Get platform-wide financial KPIs' })
  getPlatformKpis() {
    return this.financeService.getPlatformKpis();
  }

  @Get('equity-curve')
  @RequirePermissions('finance.view_overview')
  @ApiOperation({ summary: 'Get equity curve data points' })
  getEquityCurve(@Query('days') days?: number) {
    return this.financeService.getEquityCurve(days || 90);
  }

  @Get('monthly-returns')
  @RequirePermissions('finance.view_overview')
  @ApiOperation({ summary: 'Get monthly return data' })
  getMonthlyReturns(@Query('year') year?: number) {
    return this.financeService.getMonthlyReturns(year || new Date().getFullYear());
  }

  @Get('drawdown-curve')
  @RequirePermissions('finance.view_overview')
  @ApiOperation({ summary: 'Get drawdown profile data' })
  getDrawdownCurve(@Query('days') days?: number) {
    return this.financeService.getDrawdownCurve(days || 90);
  }

  // === Page 14: Finance Strategies ===

  @Get('strategies/performance')
  @RequirePermissions('finance.view_strategies')
  @ApiOperation({ summary: 'Get strategy performance metrics' })
  getStrategyPerformance() {
    return this.financeService.getStrategyPerformance();
  }

  @Get('strategies/equity-curves')
  @RequirePermissions('finance.view_strategies')
  @ApiOperation({ summary: 'Get strategy equity curves' })
  getStrategyEquityCurves(@Query('days') days?: number) {
    return this.financeService.getStrategyEquityCurves(days || 90);
  }

  // === Page 15: Finance Risk ===

  @Get('risk/overview')
  @RequirePermissions('finance.view_risk')
  @ApiOperation({ summary: 'Get risk KPIs and VaR levels' })
  getRiskOverview() {
    return this.financeService.getRiskOverview();
  }

  @Get('risk/concentration')
  @RequirePermissions('finance.view_risk')
  @ApiOperation({ summary: 'Get capital concentration by exchange, strategy, pair' })
  getRiskConcentration() {
    return this.financeService.getRiskConcentration();
  }

  @Get('risk/correlation-matrix')
  @RequirePermissions('finance.view_risk')
  @ApiOperation({ summary: 'Get strategy correlation matrix' })
  getCorrelationMatrix() {
    return this.financeService.getCorrelationMatrix();
  }

  @Get('risk/position-sizing')
  @RequirePermissions('finance.view_risk')
  @ApiOperation({ summary: 'Get position sizing distribution' })
  getPositionSizing() {
    return this.financeService.getPositionSizing();
  }

  // === Page 16: Finance Market ===

  @Get('market/kpis')
  @RequirePermissions('finance.view_market')
  @ApiOperation({ summary: 'Get market intelligence KPIs' })
  getMarketKpis() {
    return this.financeService.getMarketKpis();
  }

  @Get('market/pairs')
  @RequirePermissions('finance.view_market')
  @ApiOperation({ summary: 'Get trading pair performance' })
  getMarketPairs() {
    return this.financeService.getMarketPairs();
  }

  @Get('market/hourly-heatmap')
  @RequirePermissions('finance.view_market')
  @ApiOperation({ summary: 'Get hourly return heatmap' })
  getHourlyHeatmap() {
    return this.financeService.getHourlyHeatmap();
  }

  @Get('market/exchanges')
  @RequirePermissions('finance.view_market')
  @ApiOperation({ summary: 'Get exchange P&L breakdown' })
  getMarketExchanges() {
    return this.financeService.getMarketExchanges();
  }

  // === Page 17: Finance Users ===

  @Get('users/kpis')
  @RequirePermissions('finance.view_users')
  @ApiOperation({ summary: 'Get user analytics KPIs' })
  getUserKpis() {
    return this.financeService.getUserKpis();
  }

  @Get('users/performance')
  @RequirePermissions('finance.view_users')
  @ApiOperation({ summary: 'Get user performance leaderboard' })
  getUserPerformance() {
    return this.financeService.getUserPerformance();
  }

  @Get('users/tiers')
  @RequirePermissions('finance.view_users')
  @ApiOperation({ summary: 'Get subscription tier distribution' })
  getUserTiers() {
    return this.financeService.getUserTiers();
  }

  @Get('users/growth')
  @RequirePermissions('finance.view_users')
  @ApiOperation({ summary: 'Get user growth over time' })
  getUserGrowth(@Query('months') months?: number) {
    return this.financeService.getUserGrowth(months || 12);
  }
}
