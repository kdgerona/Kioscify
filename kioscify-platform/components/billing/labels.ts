import type { BillingInvoiceStatus, BillingPaymentMethod, BillingPaymentSource, ManualPaymentMethod } from '@/types';

export const MANUAL_METHOD_OPTIONS: { value: ManualPaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'bank_qr', label: 'Bank QR' },
  { value: 'gcash_direct', label: 'GCash (direct)' },
  { value: 'other', label: 'Other' },
];

export const METHOD_LABELS: Record<BillingPaymentMethod, string> = { QRPH: 'QRPH', MANUAL: 'Manual', PREPAID: 'Prepaid' };

export const SOURCE_LABELS: Record<BillingPaymentSource, string> = {
  WEBHOOK: 'PayMongo webhook',
  RECONCILE: 'PayMongo re-check',
  MANUAL: 'Recorded by admin',
  PREPAYMENT: 'Prepayment',
};

export const INVOICE_STATUS_STYLES: Record<BillingInvoiceStatus, { label: string; className: string }> = {
  OPEN: { label: 'Open', className: 'bg-amber-50 text-amber-700' },
  PAID: { label: 'Paid', className: 'bg-green-50 text-green-700' },
  VOID: { label: 'Void', className: 'bg-gray-100 text-gray-500' },
  WAIVED: { label: 'Waived', className: 'bg-blue-50 text-blue-700' },
};

export function manualMethodLabel(value: string | null): string {
  return MANUAL_METHOD_OPTIONS.find(o => o.value === value)?.label ?? value ?? '';
}
