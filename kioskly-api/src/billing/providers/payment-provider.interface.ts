// Gateway abstraction so cards / auto-debit can be added later (registered
// business) without reworking invoices. Today the only implementation is
// PayMongo QRPH (unregistered individual account).

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export type ProviderMode = 'test' | 'live' | 'unconfigured';

export interface QrCharge {
  providerIntentId: string;
  /** data:image/png;base64,… */
  qrImage: string;
  expiresAt: Date;
  livemode: boolean;
}

export interface ChargeStatus {
  status: 'pending' | 'succeeded' | 'failed';
  paymentId?: string;
  paidAt?: Date;
  amountCentavos?: number;
}

export interface ParsedProviderEvent {
  eventId: string;
  type: string;
  livemode: boolean;
  providerIntentId?: string;
  paymentId?: string;
  amountCentavos?: number;
  paidAt?: Date;
  invoiceId?: string;
}

export interface PaymentProvider {
  readonly name: string;
  mode(): ProviderMode;
  createQrCharge(args: {
    amountCentavos: number;
    description: string;
    metadata: { invoiceId: string; tenantId: string };
  }): Promise<QrCharge>;
  getChargeStatus(providerIntentId: string): Promise<ChargeStatus>;
  verifyWebhook(rawBody: Buffer, signatureHeader: string | undefined, now?: Date): boolean;
  parseEvent(rawBody: Buffer): ParsedProviderEvent;
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'PaymentProviderError';
  }
}
