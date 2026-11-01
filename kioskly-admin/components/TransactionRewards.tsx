'use client';

import { Gift } from 'lucide-react';
import type { TransactionReward } from '@/types';
import { FlaggedBadge, VoidedBadge } from '@/components/rewards/badges';
import { peso } from '@/components/rewards/loyalty-card';

interface Props {
  rewards?: TransactionReward[];
  /** Compact variant for the dashboard/analytics transaction list modal. */
  compact?: boolean;
}

interface ProgramGroup {
  programId: string;
  programName: string;
  cardIssued: boolean;
  stamps: TransactionReward[];
  redemptions: TransactionReward[];
  isVoided: boolean;
  warnings: string[];
}

function groupByProgram(rewards: TransactionReward[]): ProgramGroup[] {
  const groups = new Map<string, ProgramGroup>();
  for (const r of rewards) {
    let g = groups.get(r.programId);
    if (!g) {
      g = { programId: r.programId, programName: r.programName, cardIssued: false, stamps: [], redemptions: [], isVoided: false, warnings: [] };
      groups.set(r.programId, g);
    }
    if (r.type === 'CARD_ISSUED') g.cardIssued = true;
    else if (r.type === 'STAMP_ADDED') g.stamps.push(r);
    else g.redemptions.push(r);
    if (r.isVoided) g.isVoided = true;
    for (const w of r.validationWarnings ?? []) if (!g.warnings.includes(w)) g.warnings.push(w);
  }
  return [...groups.values()];
}

/**
 * "Rewards" section of a transaction's detail: one line per program, e.g.
 * "Loyalty Club Card: New card · 2 stamps (Any drink ₱49+, Latte) · Reward 1 −₱44.50 on Latte".
 * Renders nothing when the sale has no reward events.
 */
export function TransactionRewards({ rewards, compact = false }: Props) {
  if (!rewards || rewards.length === 0) return null;
  const groups = groupByProgram(rewards);

  return (
    <div>
      <h3 className={compact ? 'text-sm font-semibold text-gray-900 mb-2' : 'text-base sm:text-lg font-bold text-gray-900 mb-2 sm:mb-3'}>Rewards</h3>
      <div className="space-y-2">
        {groups.map(g => {
          const parts: string[] = [];
          if (g.cardIssued) parts.push('New card');
          if (g.stamps.length > 0) {
            const labels = g.stamps.map(s => s.slotLabel).filter(Boolean);
            parts.push(`${g.stamps.length} stamp${g.stamps.length === 1 ? '' : 's'}${labels.length ? ` (${labels.join(', ')})` : ''}`);
          }
          for (const r of g.redemptions) {
            const amount = r.discountAmount ? ` −${peso(r.discountAmount)}` : '';
            const on = r.productName ? ` on ${r.productName}` : '';
            parts.push(`${r.slotLabel ?? 'Reward'}${amount}${on}`);
          }
          return (
            <div
              key={g.programId}
              className={`flex items-start gap-2 ${compact ? 'p-2 text-xs' : 'p-3 sm:p-4 text-sm'} bg-gray-50 rounded-lg border-l-4 border-green-300`}
            >
              <Gift className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-green-700 mt-0.5 flex-shrink-0`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className={g.isVoided ? 'line-through text-gray-400' : 'text-gray-800'}>
                  <span className="font-semibold">{g.programName}:</span> {parts.join(' · ')}
                </p>
                {(g.isVoided || g.warnings.length > 0) && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {g.isVoided && <VoidedBadge />}
                    {g.warnings.length > 0 && <FlaggedBadge warnings={g.warnings} />}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
