import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantId } from '../common/decorators/tenant.decorator';
import { AnalyticsQueryDto, TimePeriod } from './dto/analytics-query.dto';

@ApiTags('reports')
@Controller('reports')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('daily')
  @ApiOperation({
    summary: 'Get comprehensive daily report',
    description:
      'Returns sales, expenses, and calculated metrics for a specific date (defaults to today)',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    description:
      'Date for the report (ISO 8601 format). Defaults to today if not provided.',
    example: '2024-12-14',
  })
  @ApiResponse({
    status: 200,
    description: 'Daily report generated successfully',
    schema: {
      example: {
        date: '2024-12-14',
        period: {
          start: '2024-12-14T00:00:00.000Z',
          end: '2024-12-14T23:59:59.999Z',
        },
        sales: {
          totalAmount: 5000,
          transactionCount: 25,
          averageTransaction: 200,
          totalItemsSold: 50,
          paymentMethodBreakdown: {
            CASH: { total: 3000, count: 15 },
            ONLINE: { total: 2000, count: 10 },
          },
        },
        expenses: {
          totalAmount: 1500,
          expenseCount: 5,
          averageExpense: 300,
          categoryBreakdown: {
            SUPPLIES: { total: 800, count: 2 },
            UTILITIES: { total: 500, count: 2 },
            MAINTENANCE: { total: 200, count: 1 },
          },
        },
        summary: {
          grossProfit: 3500,
          profitMargin: 70,
          netRevenue: 3500,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getDailyReport(
    @TenantId() tenantId: string,
    @Query('date') date?: string,
  ) {
    const targetDate = date ? new Date(date) : undefined;
    return this.reportsService.getDailyReport(tenantId, targetDate);
  }

  @Get('analytics')
  @ApiOperation({
    summary: 'Get comprehensive analytics report',
    description:
      'Returns sales, expenses, and analytics for various time periods (daily, weekly, monthly, yearly, overall, or custom date range)',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: TimePeriod,
    description: 'Time period for the report. Defaults to monthly.',
    example: TimePeriod.MONTHLY,
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description:
      'Start date for custom period (ISO 8601 format). Required if period is "custom".',
    example: '2024-01-01',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description:
      'End date for custom period (ISO 8601 format). Required if period is "custom".',
    example: '2024-12-31',
  })
  @ApiResponse({
    status: 200,
    description: 'Analytics report generated successfully',
    schema: {
      example: {
        period: {
          type: 'monthly',
          start: '2024-12-01T00:00:00.000Z',
          end: '2024-12-31T23:59:59.999Z',
        },
        sales: {
          totalAmount: 50000,
          transactionCount: 250,
          averageTransaction: 200,
          totalItemsSold: 500,
          paymentMethodBreakdown: {
            CASH: { total: 30000, count: 150 },
            CARD: { total: 15000, count: 75 },
            GCASH: { total: 5000, count: 25 },
          },
          growth: 12.5,
        },
        expenses: {
          totalAmount: 15000,
          expenseCount: 50,
          averageExpense: 300,
          categoryBreakdown: {
            SUPPLIES: { total: 8000, count: 20 },
            UTILITIES: { total: 5000, count: 20 },
            MAINTENANCE: { total: 2000, count: 10 },
          },
        },
        summary: {
          grossProfit: 35000,
          profitMargin: 70,
          netRevenue: 35000,
        },
        topProducts: [
          {
            productId: '123',
            productName: 'Caramel Macchiato',
            quantity: 100,
            revenue: 15000,
          },
        ],
        salesByDay: [
          { date: '2024-12-01', total: 1500, count: 8 },
          { date: '2024-12-02', total: 1800, count: 10 },
        ],
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad Request - Invalid parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getAnalytics(
    @TenantId() tenantId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.reportsService.getAnalytics(
      tenantId,
      query.period,
      query.startDate,
      query.endDate,
    );
  }
}
