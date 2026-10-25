import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { randomBytes } from 'crypto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { StorageService } from '../../storage/storage.service';
import { BillingMeService } from '../billing-me.service';
import { BillingPayService } from '../billing-pay.service';
import { BillingClaimsService } from '../billing-claims.service';
import { SubmitClaimDto } from '../dto/claim.dto';
import { BillingRemindersService } from '../billing-reminders.service';
import { AllowWhenBillingLocked } from '../../common/decorators/allow-when-billing-locked.decorator';

const ALL_STORE_ROLES = ['STORE_ADMIN', 'ADMIN', 'CASHIER'];
const STORE_ADMINS = ['STORE_ADMIN', 'ADMIN'];

/** The caller's own store only — every route is scoped by the JWT's tenantId. */
@ApiTags('billing')
@AllowWhenBillingLocked()
@Controller('billing/me')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class StoreBillingController {
  constructor(
    private me: BillingMeService,
    private pay: BillingPayService,
    private claims: BillingClaimsService,
    private storage: StorageService,
    private reminders: BillingRemindersService,
  ) {}

  private tenantOf(req: { user: { tenantId?: string } }): string {
    if (!req.user.tenantId) throw new BadRequestException('No store selected');
    return req.user.tenantId;
  }

  @Get()
  @Roles(...ALL_STORE_ROLES)
  @ApiOperation({ summary: "This store's billing status, banner copy, open invoice and offline cache hints" })
  getMe(@Request() req) {
    return this.me.getMe({ id: req.user.id, role: req.user.role, tenantId: this.tenantOf(req) });
  }

  @Get('invoices')
  @Roles(...STORE_ADMINS)
  @ApiOperation({ summary: 'Billing history for this store' })
  listInvoices(@Request() req) {
    return this.me.listInvoices(this.tenantOf(req));
  }

  @Get('invoices/:id')
  @Roles(...STORE_ADMINS)
  @ApiOperation({ summary: 'One invoice with its payments (receipt)' })
  getInvoice(@Param('id') id: string, @Request() req) {
    return this.me.getInvoice(this.tenantOf(req), id);
  }

  @Post('pay')
  @HttpCode(200)
  @Roles(...STORE_ADMINS)
  @ApiOperation({ summary: 'Pay the current open invoice (QRPH, or the fallback bank QR)' })
  payCurrent(@Request() req) {
    return this.pay.payInvoice(this.tenantOf(req), null);
  }

  @Post('invoices/:id/pay')
  @HttpCode(200)
  @Roles(...STORE_ADMINS)
  @ApiOperation({ summary: 'Pay a specific open invoice' })
  payInvoice(@Param('id') id: string, @Request() req) {
    return this.pay.payInvoice(this.tenantOf(req), id);
  }

  @Get('invoices/:id/payment-status')
  @Roles(...ALL_STORE_ROLES)
  @ApiOperation({ summary: 'Poll while a QR is on screen (re-checks PayMongo at most every 20s)' })
  paymentStatus(@Param('id') id: string, @Request() req) {
    return this.pay.paymentStatus({ tenantId: this.tenantOf(req), invoiceId: id });
  }

  @Post('reminders/:id/ack')
  @HttpCode(200)
  @Roles(...STORE_ADMINS)
  @ApiOperation({ summary: 'Mark a reminder notice as seen by this user' })
  ackReminder(@Param('id') id: string, @Request() req) {
    return this.reminders.ack(this.tenantOf(req), id, req.user.id);
  }

  @Post('invoices/:id/claims')
  @Roles(...STORE_ADMINS)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '"I\'ve paid" — report a payment made to the fallback bank QR' })
  @UseInterceptors(
    FileInterceptor('receipt', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/png', 'image/jpeg', 'image/webp'];
        cb(
          allowed.includes(file.mimetype) ? null : new BadRequestException('Only PNG, JPEG and WebP images are allowed'),
          allowed.includes(file.mimetype),
        );
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async submitClaim(
    @Param('id') id: string,
    @Body() dto: SubmitClaimDto,
    @UploadedFile() receipt: Express.Multer.File | undefined,
    @Request() req,
  ) {
    const tenantId = this.tenantOf(req);
    let receiptUrl: string | null = null;
    if (receipt) {
      const ext = receipt.mimetype === 'image/jpeg' ? 'jpg' : receipt.mimetype.split('/')[1];
      // The bucket is publicly readable (not listable), so the name must be
      // unguessable: no store id or timestamp, 128 random bits.
      receiptUrl = await this.storage.upload(
        'billing-receipts',
        `${randomBytes(16).toString('hex')}.${ext}`,
        receipt.buffer,
        receipt.mimetype,
      );
    }
    return this.claims.submitClaim(tenantId, id, req.user.id, dto, receiptUrl);
  }
}
