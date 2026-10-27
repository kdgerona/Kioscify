import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingInvoice, BillingInvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingConfigService } from './billing-config.service';
import { BillingInvoicesService } from './billing-invoices.service';
import { BillingPaymentsService } from './billing-payments.service';
import { BillingReconcileService } from './billing-reconcile.service';
import { selectPaymentKind } from './payment-kind.util';
import { PAYMENT_PROVIDER } from './providers/payment-provider.interface';
import type { PaymentProvider } from './providers/payment-provider.interface';

// A QR with less than this left is replaced rather than shown.
const ATTEMPT_REUSE_MARGIN_MS = 2 * 60_000;
const RECONCILE_THROTTLE_MS = 20_000;
const UNAVAILABLE_MESSAGE = 'Online payment is unavailable right now. Please email us at support@kioscify.com.';

interface PayBase {
  invoiceId: string;
  invoiceNumber: string;
  amountCentavos: number;
}

export type PayResult =
  | (PayBase & { kind: 'paymongo'; qrImage: string; expiresAt: Date; payUrl: string })
  | (PayBase & {
      kind: 'fallback';
      fallbackQrImageUrl: string;
      accountName: string | null;
      instructions: string | null;
      payUrl: string;
    })
  | (PayBase & { kind: 'unavailable'; message: string });

/** "Pay now": one QRPH Payment Intent per attempt, reused while still valid. */
@Injectable()
export class BillingPayService {
  private readonly logger = new Logger(BillingPayService.name);
  /** QR creations in progress, by invoice — per process (production runs one API instance). */
  private readonly qrInFlight = new Map<string, Promise<PayResult>>();

  constructor(
    private prisma: PrismaService,
    private billingConfig: BillingConfigService,
    private invoices: BillingInvoicesService,
    private payments: BillingPaymentsService,
    private reconcile: BillingReconcileService,
    @Inject(PAYMENT_PROVIDER) private provider: PaymentProvider,
    private env: ConfigService,
  ) {}

  private payUrl(invoice: BillingInvoice): string {
    const base = (this.env.get<string>('BILLING_PAY_PAGE_BASE_URL') ?? '').replace(/\/$/, '');
    return `${base}/pay/${invoice.payToken}`;
  }

  /** The store's current OPEN invoice — turning a passed billing date into a real invoice if the scheduler hasn't yet. */
  private async currentInvoice(tenantId: string, now: Date): Promise<BillingInvoice | null> {
    const [sub, tenant] = await Promise.all([
      this.prisma.storeSubscription.findUnique({ where: { tenantId } }),
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { isActive: true } }),
    ]);
    if (!sub) return null;
    const open = await this.prisma.billingInvoice.findFirst({
      where: { subscriptionId: sub.id, status: 'OPEN' },
      orderBy: { dueAt: 'asc' },
    });
    // An inactive store resubscribing pays its next period now, even before
    // its billing date: there is nothing else for it to pay to come back.
    return open ?? this.invoices.ensureInvoice(sub.id, now, { ignoreDate: tenant?.isActive === false });
  }

  async payInvoice(tenantId: string, invoiceId: string | null, now: Date = new Date()): Promise<PayResult> {
    const config = await this.billingConfig.get();
    if (!config.billingEnabled) throw new BadRequestException('Billing is OFF globally');

    let invoice: BillingInvoice | null;
    if (invoiceId) {
      invoice = await this.prisma.billingInvoice.findUnique({ where: { id: invoiceId } });
      if (!invoice || invoice.tenantId !== tenantId) throw new NotFoundException(`Invoice ${invoiceId} not found`);
      if (invoice.status !== 'OPEN') throw new BadRequestException('This invoice is no longer open');
    } else {
      invoice = await this.currentInvoice(tenantId, now);
      if (!invoice) throw new BadRequestException('Nothing to pay right now');
    }
    return this.paymentFor(invoice, config, now);
  }

  private async paymentFor(
    invoice: BillingInvoice,
    config: Awaited<ReturnType<BillingConfigService['get']>>,
    now: Date,
  ): Promise<PayResult> {
    const base: PayBase = { invoiceId: invoice.id, invoiceNumber: invoice.number, amountCentavos: invoice.amountCentavos };
    const fallback = (): PayResult =>
      config.fallbackQrImageUrl
        ? {
            ...base,
            kind: 'fallback',
            fallbackQrImageUrl: config.fallbackQrImageUrl,
            accountName: config.fallbackQrAccountName,
            instructions: config.fallbackQrInstructions,
            payUrl: this.payUrl(invoice),
          }
        : { ...base, kind: 'unavailable', message: UNAVAILABLE_MESSAGE };

    const kind = selectPaymentKind({
      providerMode: this.provider.mode(),
      qrphCollectedThisMonthCentavos: await this.payments.qrphCollectedThisMonth(now),
      amountCentavos: invoice.amountCentavos,
      limitCentavos: config.paymongoMonthlyLimitCentavos,
      hasFallback: !!config.fallbackQrImageUrl,
    });
    if (kind !== 'paymongo') return fallback();

    // Concurrent first views of the same invoice (two tabs, portal + kiosk)
    // share one QR instead of each creating a PayMongo intent.
    const pending = this.qrInFlight.get(invoice.id);
    if (pending) return pending;
    const created = this.paymongoQr(invoice, base, now, fallback).finally(() => this.qrInFlight.delete(invoice.id));
    this.qrInFlight.set(invoice.id, created);
    return created;
  }

  private async paymongoQr(
    invoice: BillingInvoice,
    base: PayBase,
    now: Date,
    fallback: () => PayResult,
  ): Promise<PayResult> {
    const reusable = await this.prisma.billingPaymentAttempt.findFirst({
      where: {
        invoiceId: invoice.id,
        status: 'awaiting_payment',
        expiresAt: { gt: new Date(now.getTime() + ATTEMPT_REUSE_MARGIN_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (reusable) {
      return { ...base, kind: 'paymongo', qrImage: reusable.qrImage, expiresAt: reusable.expiresAt, payUrl: this.payUrl(invoice) };
    }

    try {
      const charge = await this.provider.createQrCharge({
        amountCentavos: invoice.amountCentavos,
        description: `Kioscify subscription ${invoice.number}`,
        metadata: { invoiceId: invoice.id, tenantId: invoice.tenantId },
      });
      await this.prisma.billingPaymentAttempt.create({
        data: {
          invoiceId: invoice.id,
          provider: this.provider.name,
          providerIntentId: charge.providerIntentId,
          qrImage: charge.qrImage,
          expiresAt: charge.expiresAt,
          status: 'awaiting_payment',
          livemode: charge.livemode,
        },
      });
      return { ...base, kind: 'paymongo', qrImage: charge.qrImage, expiresAt: charge.expiresAt, payUrl: this.payUrl(invoice) };
    } catch (e) {
      this.logger.warn(`QR creation for ${invoice.number} failed: ${e instanceof Error ? e.message : e}`);
      return fallback();
    }
  }

  /** Public /pay/<token> page: status always, a QR only while the invoice is open. */
  async payByToken(token: string, now: Date = new Date()) {
    const invoice = await this.prisma.billingInvoice.findUnique({ where: { payToken: token } });
    if (!invoice) throw new NotFoundException('Payment link not found');
    const tenant = await this.prisma.tenant.findUnique({ where: { id: invoice.tenantId }, select: { name: true } });
    const config = await this.billingConfig.get();
    const payment = invoice.status === 'OPEN' && config.billingEnabled ? await this.paymentFor(invoice, config, now) : null;
    return {
      storeName: tenant?.name ?? '',
      invoiceNumber: invoice.number,
      amountCentavos: invoice.amountCentavos,
      dueAt: invoice.dueAt,
      status: invoice.status,
      payment,
    };
  }

  /** Polled while a QR is on screen; asks PayMongo directly at most every 20s per invoice. */
  async paymentStatus(
    ref: { tenantId: string; invoiceId: string } | { token: string },
    now: Date = new Date(),
  ): Promise<{ status: BillingInvoiceStatus; paid: boolean }> {
    const invoice =
      'token' in ref
        ? await this.prisma.billingInvoice.findUnique({ where: { payToken: ref.token } })
        : await this.prisma.billingInvoice.findUnique({ where: { id: ref.invoiceId } });
    if (!invoice || ('tenantId' in ref && invoice.tenantId !== ref.tenantId)) throw new NotFoundException('Invoice not found');
    if (invoice.status !== 'OPEN') return { status: invoice.status, paid: invoice.status === 'PAID' };

    // The throttle lives on the invoice, so every API instance shares it and
    // nothing accumulates in memory. Whoever claims the slot asks PayMongo.
    const claimed = await this.prisma.billingInvoice.updateMany({
      where: {
        id: invoice.id,
        status: 'OPEN',
        OR: [
          { lastReconciledAt: { isSet: false } },
          { lastReconciledAt: null },
          { lastReconciledAt: { lt: new Date(now.getTime() - RECONCILE_THROTTLE_MS) } },
        ],
      },
      data: { lastReconciledAt: now },
    });
    if (claimed.count === 1) {
      const { paid } = await this.reconcile.reconcileInvoice(invoice.id, now);
      if (paid) return { status: 'PAID', paid: true };
    }
    return { status: 'OPEN', paid: false };
  }
}
