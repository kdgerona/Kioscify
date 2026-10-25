import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingPaymentsService } from './billing-payments.service';
import { isUniqueViolation } from '../common/utils/job-lock.util';
import { PAYMENT_PROVIDER } from './providers/payment-provider.interface';
import type { ParsedProviderEvent, PaymentProvider } from './providers/payment-provider.interface';

export interface WebhookResult {
  ok: true;
  duplicate?: boolean;
  ignored?: boolean;
}

@Injectable()
export class BillingWebhookService {
  private readonly logger = new Logger(BillingWebhookService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private provider: PaymentProvider,
    private payments: BillingPaymentsService,
  ) {}

  /**
   * Signature first (raw body), then dedupe on the provider event id. A
   * replay of an already-processed event is acknowledged without side
   * effects; recordPayment's OPEN→PAID gate is the second line of defence.
   */
  async handlePaymongo(rawBody: Buffer | undefined, signature: string | undefined): Promise<WebhookResult> {
    if (!rawBody || !this.provider.verifyWebhook(rawBody, signature)) {
      throw new UnauthorizedException('Invalid signature');
    }

    const event = this.provider.parseEvent(rawBody);
    const expectLive = this.provider.mode() === 'live';
    if (event.livemode !== expectLive) {
      this.logger.warn(`Ignoring ${event.livemode ? 'live' : 'test'} event ${event.eventId} in ${this.provider.mode()} mode`);
      return { ok: true, ignored: true };
    }

    let record: { id: string; processedAt: Date | null };
    try {
      record = await this.prisma.paymentWebhookEvent.create({
        data: {
          provider: this.provider.name,
          providerEventId: event.eventId,
          type: event.type,
          payload: JSON.parse(rawBody.toString('utf8')) as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      const existing = await this.prisma.paymentWebhookEvent.findUnique({ where: { providerEventId: event.eventId } });
      if (!existing || existing.processedAt) return { ok: true, duplicate: true };
      record = existing;
    }

    try {
      const error = await this.process(event);
      await this.prisma.paymentWebhookEvent.update({
        where: { id: record.id },
        data: { processedAt: new Date(), error },
      });
      return { ok: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Never let a failure to note the error hide the error itself.
      try {
        await this.prisma.paymentWebhookEvent.update({ where: { id: record.id }, data: { error: message } });
      } catch (noteErr) {
        this.logger.error(`Could not store error on webhook event ${record.id}: ${String(noteErr)}`);
      }
      throw e;
    }
  }

  /** Returns a non-fatal error note (stored on the event), or null. */
  private async process(event: ParsedProviderEvent): Promise<string | null> {
    if (event.type === 'payment.paid') {
      const attempt = event.providerIntentId
        ? await this.prisma.billingPaymentAttempt.findUnique({ where: { providerIntentId: event.providerIntentId } })
        : null;
      let invoiceId = attempt?.invoiceId ?? null;
      if (!invoiceId && event.invoiceId) {
        const invoice = await this.prisma.billingInvoice.findUnique({ where: { id: event.invoiceId } });
        invoiceId = invoice?.id ?? null;
      }
      // Acknowledge (no retry storm) but keep the event for investigation.
      if (!invoiceId) return 'No matching invoice';

      // The attempt is marked succeeded inside recordPayment's transaction, so
      // a failure leaves it awaiting_payment for reconcile to pick up again.
      await this.payments.recordPayment({
        attemptId: attempt?.id,
        invoiceId,
        source: 'WEBHOOK',
        method: 'QRPH',
        amountCentavos: event.amountCentavos ?? 0,
        paidAt: event.paidAt ?? new Date(),
        reference: event.paymentId ?? null,
        providerIntentId: event.providerIntentId ?? null,
      });
      return null;
    }

    if ((event.type === 'qrph.expired' || event.type === 'payment.failed') && event.providerIntentId) {
      await this.prisma.billingPaymentAttempt.updateMany({
        where: { providerIntentId: event.providerIntentId, status: 'awaiting_payment' },
        data: { status: event.type === 'qrph.expired' ? 'expired' : 'failed' },
      });
    }
    return null;
  }
}
