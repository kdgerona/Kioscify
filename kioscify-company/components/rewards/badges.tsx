'use client';

import { AlertTriangle, Building2, Store } from 'lucide-react';
import type { RewardEventType, RewardProgramScope, RewardProgramStatus } from './types';
import { formatShortDate } from './loyalty-card';

const BASE = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border whitespace-nowrap';

const STATUS: Record<RewardProgramStatus, { cls: string; label: string }> = {
  DRAFT: { cls: 'bg-gray-100 text-gray-600 border-gray-200', label: 'Draft' },
  ACTIVE: { cls: 'bg-green-50 text-green-700 border-green-200', label: 'Active' },
  PAUSED: { cls: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Paused' },
  ARCHIVED: { cls: 'bg-gray-50 text-gray-400 border-gray-200 line-through', label: 'Archived' },
};

export const STATUS_LABELS: Record<RewardProgramStatus, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  ARCHIVED: 'Archived',
};

export function StatusBadge({
  status,
  startsAt,
  endsAt,
}: {
  status: RewardProgramStatus;
  startsAt?: string | null;
  endsAt?: string | null;
}) {
  const now = Date.now();
  if (status === 'ACTIVE' && startsAt && new Date(startsAt).getTime() > now) {
    return <span className={`${BASE} bg-blue-50 text-blue-700 border-blue-200`}>Starts {formatShortDate(startsAt)}</span>;
  }
  if (status === 'ACTIVE' && endsAt && new Date(endsAt).getTime() < now) {
    return <span className={`${BASE} bg-gray-100 text-gray-500 border-gray-200`}>Ended {formatShortDate(endsAt)}</span>;
  }
  const s = STATUS[status];
  return <span className={`${BASE} ${s.cls}`}>{s.label}</span>;
}

export function ScopeBadge({ scope }: { scope: RewardProgramScope }) {
  return scope === 'COMPANY' ? (
    <span className={`${BASE} bg-violet-50 text-violet-700 border-violet-200`}>
      <Building2 className="w-3 h-3" /> Company
    </span>
  ) : (
    <span className={`${BASE} bg-gray-100 text-gray-600 border-gray-200`}>
      <Store className="w-3 h-3" /> Store
    </span>
  );
}

const EVENT: Record<RewardEventType, { cls: string; label: string }> = {
  CARD_ISSUED: { cls: 'bg-blue-50 text-blue-700', label: 'Card issued' },
  STAMP_ADDED: { cls: 'bg-sky-50 text-sky-700', label: 'Stamp' },
  REWARD_REDEEMED: { cls: 'bg-green-50 text-green-700', label: 'Redeemed' },
};

export const EVENT_TYPE_LABELS: Record<RewardEventType, string> = {
  CARD_ISSUED: 'Card issued',
  STAMP_ADDED: 'Stamp',
  REWARD_REDEEMED: 'Redeemed',
};

export function EventTypeBadge({ type }: { type: RewardEventType }) {
  const e = EVENT[type];
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${e.cls}`}>{e.label}</span>;
}

export function VoidedBadge() {
  return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600 no-underline">Voided</span>;
}

/** Amber marker for events synced after the program changed (offline drift). */
export function FlaggedBadge({ warnings }: { warnings: string[] }) {
  const title = `Synced after the program changed:\n• ${warnings.join('\n• ')}`;
  return (
    <span title={title} aria-label={title} className={`${BASE} bg-amber-50 text-amber-700 border-amber-200 cursor-help`}>
      <AlertTriangle className="w-3 h-3" /> Flagged
    </span>
  );
}

export function NotLiveBadge() {
  return (
    <span title="No stores enrolled" className={`${BASE} bg-amber-50 text-amber-700 border-amber-200`}>
      Not live
    </span>
  );
}
