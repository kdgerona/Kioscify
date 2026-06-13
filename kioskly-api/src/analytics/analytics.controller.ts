// kioskly-api/src/analytics/analytics.controller.ts
import { Controller, Get, Query, UseGuards, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
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
@Roles('COMPANY_ADMIN')
@RequirePrivilege('analytics', 'read')
@ApiBearerAuth()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'KPI overview: total brands, stores, active stores' })
  overview(@CompanyId() companyId: string, @Query() query: AnalyticsQueryDto) {
    if (!companyId) throw new UnauthorizedException('Invalid company token');
    return this.analyticsService.getOverview(
      companyId,
      new Date(query.startDate),
      new Date(query.endDate),
    );
  }

  @Get('top-brands')
  @ApiOperation({ summary: 'Brands ranked by aggregate revenue in period' })
  topBrands(@CompanyId() companyId: string, @Query() query: AnalyticsQueryDto) {
    if (!companyId) throw new UnauthorizedException('Invalid company token');
    return this.analyticsService.getTopBrands(
      companyId,
      new Date(query.startDate),
      new Date(query.endDate),
    );
  }

  @Get('top-products')
  @ApiOperation({ summary: 'Top 10 products by units sold within a brand' })
  topProducts(@CompanyId() companyId: string, @Query() query: TopProductsQueryDto) {
    if (!companyId) throw new UnauthorizedException('Invalid company token');
    return this.analyticsService.getTopProducts(
      companyId,
      query.brandId,
      new Date(query.startDate),
      new Date(query.endDate),
    );
  }

  @Get('top-stores')
  @ApiOperation({ summary: 'Stores ranked by aggregate revenue in period' })
  topStores(@CompanyId() companyId: string, @Query() query: AnalyticsQueryDto) {
    if (!companyId) throw new UnauthorizedException('Invalid company token');
    return this.analyticsService.getTopStores(
      companyId,
      new Date(query.startDate),
      new Date(query.endDate),
    );
  }

  @Get('growth')
  @ApiOperation({ summary: 'Cumulative store and brand count time series' })
  growth(@CompanyId() companyId: string, @Query() query: AnalyticsQueryDto) {
    if (!companyId) throw new UnauthorizedException('Invalid company token');
    return this.analyticsService.getNetworkGrowth(
      companyId,
      new Date(query.startDate),
      new Date(query.endDate),
    );
  }
}
