// kioskly-api/src/analytics/analytics.controller.ts
import { Controller, Get, Query, Request, UseGuards, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto, TopProductsQueryDto } from './dto/analytics-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrivilegeGuard } from '../common/guards/privilege.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePrivilege } from '../common/decorators/require-privilege.decorator';
import { CompanyId } from '../common/decorators/tenant.decorator';

@ApiTags('analytics')
@Controller('analytics/company')
@UseGuards(JwtAuthGuard, RolesGuard, PrivilegeGuard)
@Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
@RequirePrivilege('analytics', 'read')
@ApiBearerAuth()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  private resolveCompanyId(req, jwtCompanyId: string, queryCompanyId: string): string {
    const companyId = req.user.role === 'PLATFORM_ADMIN' ? queryCompanyId : jwtCompanyId;
    if (!companyId) throw new UnauthorizedException('Invalid company token');
    return companyId;
  }

  @Get('overview')
  @ApiOperation({ summary: 'KPI overview: total brands, stores, active stores' })
  @ApiQuery({ name: 'companyId', required: false, description: 'Required for PLATFORM_ADMIN' })
  overview(
    @CompanyId() jwtCompanyId: string,
    @Query('companyId') queryCompanyId: string,
    @Query() query: AnalyticsQueryDto,
    @Request() req,
  ) {
    const companyId = this.resolveCompanyId(req, jwtCompanyId, queryCompanyId);
    return this.analyticsService.getOverview(
      companyId,
      new Date(query.startDate),
      new Date(query.endDate),
    );
  }

  @Get('top-brands')
  @ApiOperation({ summary: 'Brands ranked by aggregate revenue in period' })
  @ApiQuery({ name: 'companyId', required: false, description: 'Required for PLATFORM_ADMIN' })
  topBrands(
    @CompanyId() jwtCompanyId: string,
    @Query('companyId') queryCompanyId: string,
    @Query() query: AnalyticsQueryDto,
    @Request() req,
  ) {
    const companyId = this.resolveCompanyId(req, jwtCompanyId, queryCompanyId);
    return this.analyticsService.getTopBrands(
      companyId,
      new Date(query.startDate),
      new Date(query.endDate),
    );
  }

  @Get('top-products')
  @ApiOperation({ summary: 'Top 10 products by units sold within a brand' })
  @ApiQuery({ name: 'companyId', required: false, description: 'Required for PLATFORM_ADMIN' })
  topProducts(
    @CompanyId() jwtCompanyId: string,
    @Query('companyId') queryCompanyId: string,
    @Query() query: TopProductsQueryDto,
    @Request() req,
  ) {
    const companyId = this.resolveCompanyId(req, jwtCompanyId, queryCompanyId);
    return this.analyticsService.getTopProducts(
      companyId,
      query.brandId,
      new Date(query.startDate),
      new Date(query.endDate),
    );
  }

  @Get('top-stores')
  @ApiOperation({ summary: 'Stores ranked by aggregate revenue in period' })
  @ApiQuery({ name: 'companyId', required: false, description: 'Required for PLATFORM_ADMIN' })
  topStores(
    @CompanyId() jwtCompanyId: string,
    @Query('companyId') queryCompanyId: string,
    @Query() query: AnalyticsQueryDto,
    @Request() req,
  ) {
    const companyId = this.resolveCompanyId(req, jwtCompanyId, queryCompanyId);
    return this.analyticsService.getTopStores(
      companyId,
      new Date(query.startDate),
      new Date(query.endDate),
    );
  }

  @Get('growth')
  @ApiOperation({ summary: 'Cumulative store and brand count time series' })
  @ApiQuery({ name: 'companyId', required: false, description: 'Required for PLATFORM_ADMIN' })
  growth(
    @CompanyId() jwtCompanyId: string,
    @Query('companyId') queryCompanyId: string,
    @Query() query: AnalyticsQueryDto,
    @Request() req,
  ) {
    const companyId = this.resolveCompanyId(req, jwtCompanyId, queryCompanyId);
    return this.analyticsService.getNetworkGrowth(
      companyId,
      new Date(query.startDate),
      new Date(query.endDate),
    );
  }
}
