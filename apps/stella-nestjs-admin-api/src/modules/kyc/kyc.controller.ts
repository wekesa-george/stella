import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { KycService } from './kyc.service';
import { QueryApplicantsDto } from './dto/query-applicants.dto';
import { KycActionDto } from './dto/kyc-action.dto';
import { CreateRegionDto } from './dto/create-region.dto';
import { UpdateRegionDto } from './dto/update-region.dto';
import { CreateReverificationRuleDto } from './dto/create-reverification-rule.dto';
import { UpdateReverificationRuleDto } from './dto/update-reverification-rule.dto';
import { QueryAuditDto } from './dto/query-audit.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@ApiTags('KYC')
@ApiBearerAuth()
@Controller('kyc')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class KycController {
  constructor(private readonly kycService: KycService) {}

  // Applicants
  @Get('applicants/stats')
  @RequirePermissions('kyc.view_applicants')
  @ApiOperation({ summary: 'Get KYC applicant status counts and work queue' })
  getApplicantStats() {
    return this.kycService.getApplicantStats();
  }

  @Get('applicants')
  @RequirePermissions('kyc.view_applicants')
  @ApiOperation({ summary: 'List KYC applicants with filters and pagination' })
  findAllApplicants(@Query() query: QueryApplicantsDto) {
    return this.kycService.findAllApplicants(query);
  }

  @Get('applicants/:id')
  @RequirePermissions('kyc.view_detail')
  @ApiOperation({ summary: 'Get KYC applicant detail with compliance notes and history' })
  findOneApplicant(@Param('id') id: string) {
    return this.kycService.findOneApplicant(id);
  }

  @Post('applicants/:id/action')
  @RequirePermissions('kyc.approve')
  @ApiOperation({ summary: 'Perform compliance action (approve/decline/re-verify)' })
  performAction(@Param('id') id: string, @Body() dto: KycActionDto) {
    return this.kycService.performAction(id, dto);
  }

  // Providers
  @Get('providers/stats')
  @RequirePermissions('kyc.view_providers')
  @ApiOperation({ summary: 'Get KYC provider statistics' })
  getProviderStats() {
    return this.kycService.getProviderStats();
  }

  @Get('providers')
  @RequirePermissions('kyc.view_providers')
  @ApiOperation({ summary: 'List KYC providers' })
  findAllProviders() {
    return this.kycService.findAllProviders();
  }

  @Put('providers/:id')
  @RequirePermissions('kyc.test_provider')
  @ApiOperation({ summary: 'Update KYC provider configuration' })
  updateProvider(@Param('id') id: string, @Body() data: any) {
    return this.kycService.updateProvider(id, data);
  }

  // Regions
  @Get('regions')
  @RequirePermissions('kyc.view_regions')
  @ApiOperation({ summary: 'List KYC regions with summary stats' })
  getRegions() {
    return this.kycService.getRegions();
  }

  @Post('regions')
  @RequirePermissions('kyc.manage_regions')
  @ApiOperation({ summary: 'Create KYC region' })
  createRegion(@Body() dto: CreateRegionDto) {
    return this.kycService.createRegion(dto);
  }

  @Put('regions/:id')
  @RequirePermissions('kyc.manage_regions')
  @ApiOperation({ summary: 'Update KYC region' })
  updateRegion(@Param('id') id: string, @Body() dto: UpdateRegionDto) {
    return this.kycService.updateRegion(id, dto);
  }

  // Reverification Rules
  @Get('reverification-rules')
  @RequirePermissions('kyc.view_regions')
  @ApiOperation({ summary: 'List re-verification rules' })
  getReverificationRules() {
    return this.kycService.getReverificationRules();
  }

  @Post('reverification-rules')
  @RequirePermissions('kyc.manage_regions')
  @ApiOperation({ summary: 'Create re-verification rule' })
  createReverificationRule(@Body() dto: CreateReverificationRuleDto) {
    return this.kycService.createReverificationRule(dto);
  }

  @Put('reverification-rules/:id')
  @RequirePermissions('kyc.manage_regions')
  @ApiOperation({ summary: 'Update re-verification rule' })
  updateReverificationRule(@Param('id') id: string, @Body() dto: UpdateReverificationRuleDto) {
    return this.kycService.updateReverificationRule(id, dto);
  }

  // Audit
  @Get('audit')
  @RequirePermissions('kyc.view_audit')
  @ApiOperation({ summary: 'Get paginated KYC audit log' })
  getAuditLog(@Query() query: QueryAuditDto) {
    return this.kycService.getAuditLog(query);
  }

  @Get('audit/export')
  @RequirePermissions('kyc.export_audit')
  @ApiOperation({ summary: 'Export KYC audit log as CSV' })
  async exportAuditLog(@Query() query: QueryAuditDto, @Res() res: Response) {
    const csv = await this.kycService.exportAuditLogCsv(query);
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="kyc-audit-${new Date().toISOString().split('T')[0]}.csv"`,
    });
    res.send(csv);
  }
}
