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
}
