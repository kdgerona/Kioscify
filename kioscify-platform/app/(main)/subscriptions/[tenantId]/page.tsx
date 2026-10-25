'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { formatManilaDate, formatPeso, toManilaDateInput } from '@/lib/money';
import type { StoreBillingDetail } from '@/types';
import { BillingStatusBadge } from '@/components/billing/BillingStatusBadge';
import { StoreBillingForm } from '@/components/billing/StoreBillingForm';
import { StoreViewPreview } from '@/components/billing/StoreViewPreview';
import { AuditLogList } from '@/components/billing/AuditLogList';
import { LegacyMonthsPanel } from '@/components/billing/LegacyMonthsPanel';
import { InvoicesPanel } from '@/components/billing/InvoicesPanel';
import { PaymentsPanel } from '@/components/billing/PaymentsPanel';
import { ClaimsQueue } from '@/components/billing/ClaimsQueue';
import { PrepaymentDialog } from '@/components/billing/PrepaymentDialog';
import { BillingScheduleSummary } from '@/components/billing/BillingScheduleSummary';
import { dayOfMonth } from '@/lib/billing-schedule';
import { toast } from 'sonner';
import { getErrorMessage } from '@/lib/utils';

type Tab = 'settings' | 'invoices' | 'payments' | 'claims' | 'audit' | 'months';

export default function SubscriptionDetailPage() {
  const params = useParams();
  const tenantId = params.tenantId as string;

  const [detail, setDetail] = useState<StoreBillingDetail | null>(null);
  const [defaults, setDefaults] = useState({ trialDays: 15, graceDays: 7, enforcement: false, reminderLeadDays: 7 });
  const [tab, setTab] = useState<Tab>('settings');
  const [reloadKey, setReloadKey] = useState(0);
  const [prepayOpen, setPrepayOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setDetail(await api.getStoreBilling(tenantId));
    setReloadKey(k => k + 1);
  }, [tenantId]);

  useEffect(() => {
    load();
    api.getBillingConfig()
      .then(c => setDefaults({ trialDays: c.defaultTrialDays, graceDays: c.defaultGraceDays, enforcement: c.enforcementEnabled, reminderLeadDays: c.invoiceLeadDays }))
      .catch(() => {});
  }, [load]);

  const handleChanged = (next?: StoreBillingDetail) => {
    if (next) {
      setDetail(next);
      setReloadKey(k => k + 1);
    } else {
      load();
    }
  };

  const generateNow = async () => {
    setGenerating(true);
    try {
      const invoice = await api.generateInvoiceNow(tenantId);
      toast.success(`Invoice ${invoice.number} is open`);
      await load();
      setTab('invoices');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not generate an invoice'));
    } finally {
      setGenerating(false);
    }
  };

  if (!detail) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  const shown = detail.globalBillingEnabled ? detail.status : detail.previewStatus;
  const listStatus = detail.settings.billingEnabled == null ? 'NOT_SET_UP' : shown.status;
  // Nothing shows today (trial / paid up): preview the next billing date instead.
  const nothingShown = detail.storeView.admin.variant === 'none' && detail.storeView.cashier.variant === 'none';
  const nextBillingDay = toManilaDateInput(shown.nextBillingAt);
  const showUpcoming =
    nothingShown && detail.settings.billingEnabled === true && (shown.status === 'TRIAL' || shown.status === 'ACTIVE') && !!nextBillingDay;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link href="/subscriptions" className="text-gray-400 hover:text-gray-600" aria-label="Back to subscriptions">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 truncate">{detail.storeName}</h1>
            <BillingStatusBadge status={listStatus} />
          </div>
          <p className="text-sm text-gray-500">{[detail.company?.name, detail.brand?.name].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            onClick={() => setPrepayOpen(true)}
            className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
          >
            Record prepayment
          </button>
          <button
            onClick={generateNow}
            disabled={generating || !detail.globalBillingEnabled || detail.settings.billingEnabled !== true}
            title={!detail.globalBillingEnabled ? 'Billing is OFF globally' : undefined}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40"
          >
            {generating ? 'Generating…' : 'Generate invoice now'}
          </button>
        </div>
      </div>

      {!detail.globalBillingEnabled && (
        <div className="rounded-lg bg-gray-100 border border-gray-200 px-4 py-3 text-sm text-gray-600">
          Billing is OFF globally — this store sees nothing today. Status and preview show what will apply once it&apos;s enabled.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Summary label="Amount due" value={shown.status === 'DUE' || shown.status === 'LOCKED' ? formatPeso(shown.amountCentavos) : '—'} />
        <Summary label="Due date" value={formatManilaDate(shown.dueAt)} />
        <Summary label="Grace ends" value={formatManilaDate(shown.graceEndsAt)} />
        <Summary label="Next billing" value={formatManilaDate(shown.nextBillingAt)} />
      </div>

      <div className="bg-white rounded-lg border p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">
          {detail.globalBillingEnabled ? 'What the store sees right now' : 'What the store will see once billing is on'}
        </h2>
        <StoreViewPreview admin={detail.storeView.admin} cashier={detail.storeView.cashier} />
        {showUpcoming && (
          <BillingScheduleSummary
            heading="Coming up"
            isFirst={detail.invoices.length === 0}
            priceCentavos={detail.settings.priceCentavos}
            firstInvoice={nextBillingDay}
            anchorDay={detail.settings.anchorDay ?? dayOfMonth(nextBillingDay)}
            graceDays={detail.settings.graceDaysOverride ?? defaults.graceDays}
            enforcement={defaults.enforcement}
            globalBillingEnabled={detail.globalBillingEnabled}
            reminderLeadDays={defaults.reminderLeadDays}
          />
        )}
      </div>

      <div className="bg-white rounded-lg border">
        <div className="flex border-b text-sm overflow-x-auto">
          {([
            ['settings', 'Settings'],
            ['invoices', `Invoices (${detail.invoices.length})`],
            ['payments', 'Payments'],
            ['claims', `Claims${detail.claims.some(c => c.status === 'PENDING') ? ' •' : ''}`],
            ['audit', 'Audit log'],
            ['months', 'Legacy months'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-5 py-3 font-medium border-b-2 -mb-px whitespace-nowrap ${
                tab === key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="p-5">
          {tab === 'settings' && (
            <StoreBillingForm
              key={reloadKey}
              detail={detail}
              defaultTrialDays={defaults.trialDays}
              defaultGraceDays={defaults.graceDays}
              enforcement={defaults.enforcement}
              reminderLeadDays={defaults.reminderLeadDays}
              onChanged={handleChanged}
            />
          )}
          {tab === 'invoices' && <InvoicesPanel invoices={detail.invoices} onChanged={load} />}
          {tab === 'payments' && <PaymentsPanel payments={detail.payments} attempts={detail.attempts} />}
          {tab === 'claims' && <ClaimsQueue claims={detail.claims} onChanged={load} />}
          {tab === 'audit' && <AuditLogList entries={detail.audit} />}
          {tab === 'months' && (
            <LegacyMonthsPanel tenantId={tenantId} readOnly={detail.globalBillingEnabled && detail.settings.billingEnabled === true} reloadKey={reloadKey} />
          )}
        </div>
      </div>

      {prepayOpen && (
        <PrepaymentDialog
          tenantId={tenantId}
          onClose={() => setPrepayOpen(false)}
          onDone={() => { setPrepayOpen(false); load(); }}
        />
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
