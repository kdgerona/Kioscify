'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { SubscriptionDetail } from '@/types';
import { ChevronLeft, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function SubscriptionDetailPage() {
  const params = useParams();
  const tenantId = params.tenantId as string;

  const [detail, setDetail] = useState<SubscriptionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activationInput, setActivationInput] = useState('');
  const [savingActivation, setSavingActivation] = useState(false);
  const [savingMonth, setSavingMonth] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getSubscriptionDetail(tenantId);
      setDetail(result);
      setActivationInput(result.activatedAt ? result.activatedAt.slice(0, 10) : '');
      setNoteDrafts(Object.fromEntries(result.months.map(m => [m.month, m.note ?? ''])));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const handleSaveActivation = async (nextValue: string) => {
    setSavingActivation(true);
    try {
      await api.setStoreActivation(tenantId, nextValue || null);
      toast.success(nextValue ? 'Activation date updated' : 'Activation cleared');
      await load();
    } catch {
      toast.error('Failed to update activation date');
    } finally {
      setSavingActivation(false);
    }
  };

  const handleTogglePaid = async (month: string, currentlyPaid: boolean) => {
    setSavingMonth(month);
    try {
      await api.upsertSubscriptionPayment(tenantId, month, {
        paid: !currentlyPaid,
        note: noteDrafts[month] || undefined,
      });
      await load();
    } catch {
      toast.error('Failed to update payment status');
    } finally {
      setSavingMonth(null);
    }
  };

  const handleSaveNote = async (month: string, paid: boolean) => {
    setSavingMonth(month);
    try {
      await api.upsertSubscriptionPayment(tenantId, month, { paid, note: noteDrafts[month] || undefined });
      toast.success('Note saved');
      await load();
    } catch {
      toast.error('Failed to save note');
    } finally {
      setSavingMonth(null);
    }
  };

  if (loading || !detail) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/subscriptions" className="text-gray-400 hover:text-gray-600">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{detail.storeName}</h1>
          <p className="text-sm text-gray-500">{[detail.company?.name, detail.brand?.name].filter(Boolean).join(' · ')}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border p-5 flex items-end gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Subscription Activation Date</label>
          <input
            type="date"
            value={activationInput}
            onChange={e => setActivationInput(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
        <button
          onClick={() => handleSaveActivation(activationInput)}
          disabled={savingActivation || !activationInput}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {savingActivation ? 'Saving...' : detail.activatedAt ? 'Update' : 'Activate'}
        </button>
        {detail.activatedAt && (
          <button
            onClick={() => { setActivationInput(''); handleSaveActivation(''); }}
            disabled={savingActivation}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Clear
          </button>
        )}
      </div>

      {!detail.activatedAt ? (
        <div className="bg-white rounded-lg border py-16 text-center text-gray-400 text-sm">
          Set an activation date above to start the monthly payment checklist.
        </div>
      ) : (
        <div className="bg-white rounded-lg border divide-y">
          {detail.months.slice().reverse().map(m => (
            <div key={m.month} className="px-5 py-4 flex items-center gap-4">
              <button
                onClick={() => handleTogglePaid(m.month, m.paid)}
                disabled={savingMonth === m.month}
                className={`w-6 h-6 rounded flex items-center justify-center shrink-0 border transition-colors ${
                  m.paid ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300 text-transparent'
                }`}
              >
                <Check className="w-4 h-4" />
              </button>
              <div className="w-28 shrink-0">
                <p className="text-sm font-medium text-gray-900">{m.month}</p>
                {m.paid && m.paidAt && (
                  <p className="text-xs text-gray-400">Paid {new Date(m.paidAt).toLocaleDateString()}</p>
                )}
              </div>
              <input
                type="text"
                placeholder="Note (optional)"
                value={noteDrafts[m.month] ?? ''}
                onChange={e => setNoteDrafts(prev => ({ ...prev, [m.month]: e.target.value }))}
                onBlur={() => handleSaveNote(m.month, m.paid)}
                className="flex-1 px-3 py-1.5 border border-gray-200 rounded-md text-sm"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
