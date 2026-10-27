import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { BillingConfigService } from '../billing-config.service';
import { UpdateBillingConfigDto } from '../dto/update-billing-config.dto';
import { BillingSettingsService } from '../billing-settings.service';
import type { BillingListStatus } from '../billing-settings.service';
import { BulkStoreBillingDto } from '../dto/bulk-store-billing.dto';
import { UpdateStoreBillingDto } from '../dto/update-store-billing.dto';
import { BillingInvoicesService } from '../billing-invoices.service';
import { BillingPaymentsService } from '../billing-payments.service';
import { BillingReconcileService } from '../billing-reconcile.service';
import { BillingClaimsService } from '../billing-claims.service';
import { BillingRemindersService } from '../billing-reminders.service';
import type { ClaimStatus } from '../billing-claims.service';
import { ExtendGraceDto, MarkPaidDto, PrepaymentDto, ReasonDto } from '../dto/billing-actions.dto';

@ApiTags('billing')
@Controller('platform/billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PLATFORM_ADMIN')
@ApiBearerAuth()
export class PlatformBillingController {
  constructor(
    private billingConfig: BillingConfigService,
    private billingSettings: BillingSettingsService,
    private invoices: BillingInvoicesService,
    private payments: BillingPaymentsService,
    private reconcile: BillingReconcileService,
    private claims: BillingClaimsService,
    private reminders: BillingRemindersService,
  ) {}

  @Get('config')
  @ApiOperation({ summary: 'Global billing settings (+ PayMongo mode from env; keys are never returned)' })
  getConfig() {
    return this.billingConfig.getForAdmin();
  }

  @Patch('config')
  @ApiOperation({ summary: 'Update global billing settings' })
  async updateConfig(@Body() dto: UpdateBillingConfigDto, @Request() req) {
    await this.billingConfig.update(dto, req.user.id);
    return this.billingConfig.getForAdmin();
  }

  @Post('config/fallback-qr')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload the fallback bank QR (PNG/JPEG/WebP, max 2 MB) shown once the PayMongo limit is reached' })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/png', 'image/jpeg', 'image/webp'];
        cb(
          allowed.includes(file.mimetype) ? null : new BadRequestException('Only PNG, JPEG and WebP images are allowed'),
          allowed.includes(file.mimetype),
        );
      },
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  async uploadFallbackQr(@UploadedFile() file: Express.Multer.File, @Request() req) {
    if (!file) throw new BadRequestException('Attach the QR image as "image"');
    await this.billingConfig.setFallbackQrImage(file, req.user.id);
    return this.billingConfig.getForAdmin();
  }

  @Delete('config/fallback-qr')
  @ApiOperation({ summary: 'Remove the fallback bank QR' })
  async removeFallbackQr(@Request() req) {
    await this.billingConfig.setFallbackQrImage(null, req.user.id);
    return this.billingConfig.getForAdmin();
  }

  @Get('claims')
  @ApiOperation({ summary: '"I\'ve paid" claims for bank-QR payments, newest first' })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'APPROVED', 'REJECTED'] })
  listClaims(@Query('status') status?: ClaimStatus) {
    return this.claims.listClaims(status);
  }

  @Post('claims/:id/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve a payment claim — records a bank-QR manual payment' })
  approveClaim(@Param('id') id: string, @Request() req) {
    return this.claims.approveClaim(id, req.user.id);
  }

  @Post('claims/:id/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reject a payment claim (the store sees the reason)' })
  rejectClaim(@Param('id') id: string, @Body() dto: ReasonDto, @Request() req) {
    return this.claims.rejectClaim(id, dto.reason, req.user.id);
  }

  @Get('payments')
  @ApiOperation({ summary: 'Cross-store payments log (newest first); ?format=csv downloads all payments' })
  @ApiQuery({ name: 'format', required: false, enum: ['csv'] })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listPayments(
    @Res({ passthrough: true }) res: Response,
    @Query('format') format?: string,
    @Query('tenantId') tenantId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    if (format === 'csv') {
      const date = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="kioscify-payments-${date}.csv"`);
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      return this.payments.paymentsCsv();
    }
    return this.payments.listPayments({ page, limit, tenantId });
  }

  @Get('overview')
  @ApiOperation({ summary: 'Store counts by billing status (previewed as if enabled while billing is OFF)' })
  getOverview() {
    return this.billingSettings.overview();
  }

  @Get('stores')
  @ApiOperation({ summary: 'Billing table: price, status, paid-through, next billing, days overdue' })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'brandId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['EXEMPT', 'NOT_ACTIVATED', 'TRIAL', 'ACTIVE', 'DUE', 'LOCKED', 'NOT_SET_UP'] })
  @ApiQuery({ name: 'dueFrom', required: false })
  @ApiQuery({ name: 'dueTo', required: false })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'inactive', required: false, type: Boolean, description: 'true lists only inactive stores; otherwise only active ones' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getStores(
    @Query('companyId') companyId?: string,
    @Query('brandId') brandId?: string,
    @Query('status') status?: BillingListStatus,
    @Query('dueFrom') dueFrom?: string,
    @Query('dueTo') dueTo?: string,
    @Query('q') q?: string,
    @Query('inactive') inactive?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.billingSettings.listStores({
      companyId, brandId, status, dueFrom, dueTo, q, inactive: inactive === 'true', page, limit,
    });
  }

  @Post('invoices/:id/mark-paid')
  @HttpCode(200)
  @ApiOperation({ summary: 'Record a manual (cash / bank transfer / bank QR) payment for an invoice' })
  markPaid(@Param('id') id: string, @Body() dto: MarkPaidDto, @Request() req) {
    return this.payments.markPaid(id, dto, req.user.id);
  }

  @Post('invoices/:id/void')
  @HttpCode(200)
  @ApiOperation({ summary: 'Void an OPEN invoice issued in error — the period is reissued at the current price' })
  voidInvoice(@Param('id') id: string, @Body() dto: ReasonDto, @Request() req) {
    return this.invoices.voidInvoice(id, dto.reason, req.user.id);
  }

  @Post('invoices/:id/waive')
  @HttpCode(200)
  @ApiOperation({ summary: 'Waive an OPEN invoice — the period counts as covered with no payment' })
  waiveInvoice(@Param('id') id: string, @Body() dto: ReasonDto, @Request() req) {
    return this.invoices.waiveInvoice(id, dto.reason, req.user.id);
  }

  @Post('invoices/:id/extend-grace')
  @HttpCode(200)
  @ApiOperation({ summary: 'Extend the grace period of an OPEN invoice' })
  extendGrace(@Param('id') id: string, @Body() dto: ExtendGraceDto, @Request() req) {
    return this.invoices.extendGrace(id, dto.until, req.user.id);
  }

  @Post('invoices/:id/recheck')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ask PayMongo whether an open invoice was paid (backstop for a missed webhook)' })
  recheck(@Param('id') id: string) {
    return this.reconcile.reconcileInvoice(id);
  }

  @Post('invoices/:id/reminders/resend')
  @HttpCode(200)
  @ApiOperation({ summary: 'Show the latest reminder notice again to the store admins' })
  resendReminder(@Param('id') id: string, @Request() req) {
    return this.reminders.resend(id, req.user.id);
  }

  @Patch('stores/bulk')
  @ApiOperation({ summary: 'Apply the same billing settings to many stores; reports per-store results' })
  bulkUpdate(@Body() dto: BulkStoreBillingDto, @Request() req) {
    return this.billingSettings.bulkUpdate(dto.tenantIds, dto.patch, req.user.id);
  }
}

@ApiTags('billing')
@Controller('platform/subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PLATFORM_ADMIN')
@ApiBearerAuth()
export class PlatformStoreBillingController {
  constructor(
    private billingSettings: BillingSettingsService,
    private invoices: BillingInvoicesService,
    private payments: BillingPaymentsService,
  ) {}

  @Post(':tenantId/billing/invoices')
  @ApiOperation({ summary: 'Generate the next invoice now (ignores the billing date; one OPEN invoice at a time)' })
  generateInvoice(@Param('tenantId') tenantId: string, @Request() req) {
    return this.invoices.generateNow(tenantId, req.user.id);
  }

  @Post(':tenantId/billing/prepayments')
  @ApiOperation({ summary: 'Record money paid in advance outside the platform (sets paid-through and next billing date)' })
  recordPrepayment(@Param('tenantId') tenantId: string, @Body() dto: PrepaymentDto, @Request() req) {
    return this.payments.recordPrepayment(tenantId, dto, req.user.id);
  }

  @Get(':tenantId/billing')
  @ApiOperation({ summary: "A store's billing settings, computed status, store-view preview and audit log" })
  getStoreBilling(@Param('tenantId') tenantId: string) {
    return this.billingSettings.getStoreBilling(tenantId);
  }

  @Get(':tenantId/billing/enable-preview')
  @ApiOperation({ summary: 'Dates that would apply if billing were enabled now (honors paid ledger months)' })
  enablePreview(@Param('tenantId') tenantId: string) {
    return this.billingSettings.enablePreview(tenantId);
  }

  @Patch(':tenantId/billing')
  @ApiOperation({ summary: "Update a store's billing settings (price required to enable; reason required to exempt)" })
  updateStoreBilling(@Param('tenantId') tenantId: string, @Body() dto: UpdateStoreBillingDto, @Request() req) {
    return this.billingSettings.updateStoreBilling(tenantId, dto, req.user.id);
  }
}
