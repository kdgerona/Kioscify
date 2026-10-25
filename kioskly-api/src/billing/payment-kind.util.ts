import { ProviderMode } from './providers/payment-provider.interface';

export type PaymentKind = 'paymongo' | 'fallback' | 'unavailable';

/**
 * Which "Pay now" a store gets. Past the configured PayMongo monthly limit
 * (unregistered individual accounts cap cash-in), stores are shown the
 * owner's static bank QR instead; without one configured, PayMongo is still
 * tried since the limit is only an estimate of what PayMongo enforces.
 */
export function selectPaymentKind(input: {
  providerMode: ProviderMode;
  qrphCollectedThisMonthCentavos: number;
  amountCentavos: number;
  limitCentavos: number;
  hasFallback: boolean;
}): PaymentKind {
  if (input.providerMode === 'unconfigured') return input.hasFallback ? 'fallback' : 'unavailable';
  if (input.qrphCollectedThisMonthCentavos + input.amountCentavos > input.limitCentavos && input.hasFallback) {
    return 'fallback';
  }
  return 'paymongo';
}
