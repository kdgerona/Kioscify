'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import type { SubscriptionDetail } from '@/types';

/**
 * The original manual month checklist. Read-only for stores on automated
 * billing — their ledger is written by invoice payments and prepayments.
 */
export function LegacyMonthsPanel({ tenantId, readOnly, reloadKey }: { tenantId: string; readOnly: boolean; reloadKey: number }) {
  const [detail, setDetail] = useState<SubscriptionDetail | null>(null);
  const [savingMonth, setSavingMonth] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const result = await api.getSubscriptionDetail(tenantId);
    setDetail(result);
    setNoteDrafts(Object.fromEntries(result.months.map(m => [m.month, m.note ?? ''])));
  }, [tenantId]);

  useEffect(() => { load().catch(() => {}); }, [load, reloadKey]);

  const save = async (month: string, paid: boolean, success?: string) => {
    setSavingMonth(month);
    try {
      await api.upsertSubscriptionPayment(tenantId, month, { paid, note: noteDrafts[month] || undefined });
      if (success) toast.success(success);
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update payment status'));
    } finally {
      setSavingMonth(null);
    }
  };

  if (!detail) {
    return <div className="py-10 text-center text-sm text-gray-400">Loading...</div>;
  }
  if (!detail.activatedAt) {
    return <div className="py-10 text-center text-sm text-gray-400">Set an activation date to start the monthly payment checklist.</div>;
  }

  return (
    <div className="space-y-3">
      {readOnly && (
        <p className="text-xs text-gray-500 bg-gray-50 rounded-md px-3 py-2">
          Managed by billing — months are marked paid automatically from invoice payments and prepayments.
        </p>
      )}
      <div className="divide-y border rounded-lg">
        {detail.months.slice().reverse().map(m => (
          <div key={m.month} className="px-5 py-3 flex items-center gap-4">
            <button
              onClick={() => save(m.month, !m.paid)}
              disabled={readOnly || savingMonth === m.month}
              aria-label={`${m.paid ? 'Mark unpaid' : 'Mark paid'} ${m.month}`}
              className={`w-6 h-6 rounded flex items-center justify-center shrink-0 border transition-colors disabled:cursor-not-allowed ${
                m.paid ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300 text-transparent'
              } ${readOnly ? 'opacity-70' : ''}`}
            >
              <Check className="w-4 h-4" />
            </button>
            <div className="w-28 shrink-0">
              <p className="text-sm font-medium text-gray-900">{m.month}</p>
              {m.paid && m.paidAt && <p className="text-xs text-gray-400">Paid {new Date(m.paidAt).toLocaleDateString()}</p>}
            </div>
            {readOnly ? (
              <p className="flex-1 text-sm text-gray-500 truncate">{m.note || ''}</p>
            ) : (
              <input
                type="text"
                placeholder="Note (optional)"
                value={noteDrafts[m.month] ?? ''}
                onChange={e => setNoteDrafts(prev => ({ ...prev, [m.month]: e.target.value }))}
                onBlur={() => save(m.month, m.paid, 'Note saved')}
                className="flex-1 px-3 py-1.5 border border-gray-200 rounded-md text-sm"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
