import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { getPaymongoMode, isSecretConfigured } from '../paymongo-mode.util';
import {
  ChargeStatus,
  ParsedProviderEvent,
  PaymentProvider,
  PaymentProviderError,
  ProviderMode,
  QrCharge,
} from './payment-provider.interface';

const BASE_URL = 'https://api.paymongo.com/v1';
// QR Ph payment methods accept 60–9000s; 30 minutes matches PayMongo's default.
const QR_EXPIRY_SECONDS = 1800;
const SIGNATURE_TOLERANCE_SECONDS = 300;
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * PayMongo QRPH via the Payment Intent workflow (verified against
 * developers.paymongo.com, 2026-10-24): create intent → create qrph payment
 * method → attach → next_action.code.image_url is the QR (base64 PNG).
 * Every call uses the secret key, server-side only.
 */
@Injectable()
export class PaymongoProvider implements PaymentProvider {
  readonly name = 'paymongo';
  private readonly logger = new Logger(PaymongoProvider.name);

  constructor(private config: ConfigService) {}

  private get secretKey(): string | undefined {
    return this.config.get<string>('PAYMONGO_SECRET_KEY');
  }

  mode(): ProviderMode {
    return getPaymongoMode(this.secretKey);
  }

  private async request<T = any>(path: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<T> {
    if (this.mode() === 'unconfigured') throw new ServiceUnavailableException('Online payment is not configured');
    // A hung PayMongo call must fail, not wait forever: Pay now falls back to
    // the bank QR on any provider error.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}${path}`, {
        method: init.method,
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
      });
    } catch (e) {
      if (controller.signal.aborted) throw new PaymentProviderError('PayMongo did not respond in time');
      throw new PaymentProviderError(`Could not reach PayMongo: ${e instanceof Error ? e.message : e}`);
    } finally {
      clearTimeout(timer);
    }
    const payload = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      const detail = payload?.errors?.[0]?.detail ?? `PayMongo request failed (${res.status})`;
      throw new PaymentProviderError(detail, res.status);
    }
    return payload as T;
  }

  async createQrCharge(args: {
    amountCentavos: number;
    description: string;
    metadata: { invoiceId: string; tenantId: string };
  }): Promise<QrCharge> {
    const intent = await this.request('/payment_intents', {
      method: 'POST',
      body: {
        data: {
          attributes: {
            amount: args.amountCentavos,
            currency: 'PHP',
            payment_method_allowed: ['qrph'],
            description: args.description,
            metadata: args.metadata,
          },
        },
      },
    });
    const intentId: string = intent.data.id;
    const clientKey: string = intent.data.attributes.client_key;

    const method = await this.request('/payment_methods', {
      method: 'POST',
      body: { data: { attributes: { type: 'qrph', expiry_seconds: QR_EXPIRY_SECONDS } } },
    });
    const createdAt = Date.now();

    const attached = await this.request(`/payment_intents/${intentId}/attach`, {
      method: 'POST',
      body: { data: { attributes: { payment_method: method.data.id, client_key: clientKey } } },
    });
    const qrImage: string | undefined = attached.data?.attributes?.next_action?.code?.image_url;
    if (!qrImage) throw new PaymentProviderError('PayMongo did not return a QR code');

    // Test-mode QR codes are real QR Ph codes and must not be scanned and
    // paid; PayMongo returns a test_url for simulating the payment instead.
    if (this.mode() === 'test') {
      const testUrl = findTestUrl(attached);
      if (testUrl) this.logger.log(`PayMongo test mode: simulate payment for ${intentId} at ${testUrl}`);
    }

    return {
      providerIntentId: intentId,
      qrImage,
      expiresAt: new Date(createdAt + QR_EXPIRY_SECONDS * 1000),
      livemode: !!(attached.data?.attributes?.livemode ?? intent.data.attributes.livemode),
    };
  }

  async getChargeStatus(providerIntentId: string): Promise<ChargeStatus> {
    const intent = await this.request(`/payment_intents/${providerIntentId}`, { method: 'GET' });
    const attrs = intent.data.attributes;
    switch (attrs.status) {
      case 'succeeded': {
        const payment = attrs.payments?.[0];
        return {
          status: 'succeeded',
          ...(payment
            ? {
                paymentId: payment.id,
                amountCentavos: payment.attributes?.amount,
                paidAt: payment.attributes?.paid_at ? new Date(payment.attributes.paid_at * 1000) : undefined,
              }
            : {}),
        };
      }
      case 'awaiting_payment_method':
        // After a QR is attached, falling back here means the attempt failed or expired.
        return { status: 'failed' };
      default:
        return { status: 'pending' };
    }
  }

  verifyWebhook(rawBody: Buffer, signatureHeader: string | undefined, now: Date = new Date()): boolean {
    const secret = this.config.get<string>('PAYMONGO_WEBHOOK_SECRET');
    if (!isSecretConfigured(secret) || !signatureHeader) return false;

    const parts = Object.fromEntries(
      signatureHeader.split(',').map(p => {
        const i = p.indexOf('=');
        return i === -1 ? [p.trim(), ''] : [p.slice(0, i).trim(), p.slice(i + 1).trim()];
      }),
    );
    const t = Number(parts.t);
    if (!Number.isFinite(t) || !parts.t) return false;
    if (Math.abs(now.getTime() / 1000 - t) > SIGNATURE_TOLERANCE_SECONDS) return false;

    const provided = this.mode() === 'live' ? parts.li : parts.te;
    if (!provided) return false;
    const expected = createHmac('sha256', secret).update(`${parts.t}.`).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseEvent(rawBody: Buffer): ParsedProviderEvent {
    const event = JSON.parse(rawBody.toString('utf8'));
    const attrs = event?.data?.attributes ?? {};
    const resource = attrs.data ?? {};
    const r = resource.attributes ?? {};
    const intentFromResource = typeof resource.id === 'string' && resource.id.startsWith('pi_') ? resource.id : undefined;
    return {
      eventId: event?.data?.id,
      type: attrs.type,
      livemode: !!attrs.livemode,
      providerIntentId: r.payment_intent_id ?? intentFromResource,
      paymentId: resource.type === 'payment' ? resource.id : undefined,
      amountCentavos: typeof r.amount === 'number' ? r.amount : undefined,
      paidAt: typeof r.paid_at === 'number' ? new Date(r.paid_at * 1000) : undefined,
      invoiceId: r.metadata?.invoiceId,
    };
  }
}

/** The first `test_url` anywhere in a PayMongo response (its exact location isn't documented). */
function findTestUrl(value: unknown, depth = 0): string | undefined {
  if (!value || typeof value !== 'object' || depth > 6) return undefined;
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'test_url' && typeof v === 'string') return v;
    const found = findTestUrl(v, depth + 1);
    if (found) return found;
  }
  return undefined;
}
