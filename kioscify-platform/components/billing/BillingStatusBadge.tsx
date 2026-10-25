import type { BillingListStatus } from '@/types';

const STYLES: Record<BillingListStatus, { label: string; className: string }> = {
  TRIAL: { label: 'Trial', className: 'bg-blue-50 text-blue-700' },
  ACTIVE: { label: 'Active', className: 'bg-green-50 text-green-700' },
  DUE: { label: 'Due', className: 'bg-amber-50 text-amber-700' },
  LOCKED: { label: 'Locked', className: 'bg-red-50 text-red-600' },
  EXEMPT: { label: 'Exempt', className: 'bg-gray-100 text-gray-600' },
  NOT_ACTIVATED: { label: 'Not activated', className: 'bg-gray-100 text-gray-500' },
  NOT_SET_UP: { label: 'Not set up', className: 'bg-gray-50 text-gray-400 border border-gray-200' },
};

export const BILLING_STATUS_LABELS: Record<BillingListStatus, string> = Object.fromEntries(
  Object.entries(STYLES).map(([k, v]) => [k, v.label]),
) as Record<BillingListStatus, string>;

export function BillingStatusBadge({ status }: { status: BillingListStatus }) {
  const style = STYLES[status];
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${style.className}`}>{style.label}</span>;
}
