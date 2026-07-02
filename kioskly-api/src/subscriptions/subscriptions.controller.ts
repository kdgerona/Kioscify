import { Body, Controller, Get, Param, Patch, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SetActivationDto } from './dto/set-activation.dto';
import { UpsertPaymentDto } from './dto/upsert-payment.dto';

@ApiTags('subscriptions')
@Controller('platform/subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PLATFORM_ADMIN')
@ApiBearerAuth()
export class SubscriptionsController {
  constructor(private subscriptionsService: SubscriptionsService) {}

  @Get()
  @ApiOperation({ summary: 'Paginated list of stores with subscription/payment status' })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'brandId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['activated', 'pending'] })
  @ApiQuery({ name: 'paid', required: false, enum: ['paid', 'overdue'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getList(
    @Query('companyId') companyId?: string,
    @Query('brandId') brandId?: string,
    @Query('status') status?: 'activated' | 'pending',
    @Query('paid') paid?: 'paid' | 'overdue',
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.subscriptionsService.getList({ companyId, brandId, status, paid, page, limit });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Platform-wide subscription overview counts' })
  getStats() {
    return this.subscriptionsService.getStats();
  }

  @Get(':tenantId')
  @ApiOperation({ summary: "A store's subscription detail and rolling payment checklist" })
  getDetail(@Param('tenantId') tenantId: string) {
    return this.subscriptionsService.getDetail(tenantId);
  }

  @Patch(':tenantId/activation')
  @ApiOperation({ summary: "Set or clear a store's subscription activation date" })
  setActivation(@Param('tenantId') tenantId: string, @Body() dto: SetActivationDto) {
    return this.subscriptionsService.setActivation(tenantId, dto.activatedAt ?? null);
  }

  @Put(':tenantId/payments/:month')
  @ApiOperation({ summary: 'Upsert paid/unpaid status (+ optional note) for a given YYYY-MM month' })
  upsertPayment(
    @Param('tenantId') tenantId: string,
    @Param('month') month: string,
    @Body() dto: UpsertPaymentDto,
  ) {
    return this.subscriptionsService.upsertPayment(tenantId, month, dto);
  }
}
