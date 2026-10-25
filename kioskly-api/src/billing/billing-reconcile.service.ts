import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingPaymentsService } from './billing-payments.service';
import { PAYMENT_PROVIDER } from './providers/payment-provider.interface';
import type { PaymentProvider } from './providers/payment-provider.interface';

const RECHECK_WINDOW_MS = 24 * 3600_000;
const RECENT_WINDOW_MS = 2 * 3600_000;

/** Backstop for missed webhooks: ask PayMongo directly about open QR attempts. */
@Injectable()
export class BillingReconcileService {
  private readonly logger = new Logger(BillingReconcileService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private provider: PaymentProvider,
    private payments: BillingPaymentsService,
  ) {}

  async reconcileInvoice(invoiceId: string, now: Date = new Date()): Promise<{ paid: boolean }> {
    const invoice = await this.prisma.billingInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found`);
    if (invoice.status === 'PAID') return { paid: true };

    const attempts = await this.prisma.billingPaymentAttempt.findMany({
      where: { invoiceId, status: 'awaiting_payment', createdAt: { gte: new Date(now.getTime() - RECHECK_WINDOW_MS) } },
      orderBy: { createdAt: 'desc' },
    });

    let paid = false;
    for (const attempt of attempts) {
      try {
        const status = await this.provider.getChargeStatus(attempt.providerIntentId);
        if (status.status === 'succeeded') {
          await this.payments.recordPayment({
            attemptId: attempt.id,
            invoiceId,
            source: 'RECONCILE',
            method: 'QRPH',
            amountCentavos: status.amountCentavos ?? invoice.amountCentavos,
            paidAt: status.paidAt ?? now,
            reference: status.paymentId ?? null,
            providerIntentId: attempt.providerIntentId,
          });
          paid = true;
        } else if (status.status === 'failed') {
          await this.prisma.billingPaymentAttempt.update({ where: { id: attempt.id }, data: { status: 'failed' } });
        } else if (attempt.expiresAt <= now) {
          await this.prisma.billingPaymentAttempt.update({ where: { id: attempt.id }, data: { status: 'expired' } });
        }
      } catch (e) {
        this.logger.warn(`Reconcile of ${attempt.providerIntentId} failed: ${e instanceof Error ? e.message : e}`);
      }
    }
    return { paid };
  }

  /** Scheduler pass: every invoice with a QR attempt still awaiting payment from the last 2 hours. */
  async reconcileRecent(now: Date = new Date()): Promise<number> {
    const recent = await this.prisma.billingPaymentAttempt.findMany({
      where: { status: 'awaiting_payment', createdAt: { gte: new Date(now.getTime() - RECENT_WINDOW_MS) } },
      select: { invoiceId: true },
    });
    const invoiceIds = [...new Set(recent.map(a => a.invoiceId))];
    for (const id of invoiceIds) await this.reconcileInvoice(id, now);
    return invoiceIds.length;
  }
}
