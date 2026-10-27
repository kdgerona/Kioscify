'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { formatManilaDate, formatPeso, pesoToCentavos } from '@/lib/money';
import { BillingStatusBadge, BILLING_STATUS_LABELS } from '@/components/billing/BillingStatusBadge';
import type { BillingClaim, BillingListStatus, BillingOverview, BillingStoreRow, Brand, Company, UpdateStoreBillingPayload } from '@/types';
import { PaymentsLog } from '@/components/billing/PaymentsLog';
import { ClaimsQueue } from '@/components/billing/ClaimsQueue';
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CheckCircle2,
  Clock,
  HelpCircle,
  Lock,
  LucideIcon,
  Sparkles,
  Wallet,
} from 'lucide-react';

const STATUS_OPTIONS: BillingListStatus[] = ['TRIAL', 'ACTIVE', 'DUE', 'LOCKED', 'EXEMPT', 'NOT_ACTIVATED', 'NOT_SET_UP'];

type BulkAction = { kind: 'price' } | { kind: 'enable' } | { kind: 'exempt' };
// 'inactive' is the same store table, limited to stores toggled off under Company → Stores
type View = 'stores' | 'inactive' | 'payments' | 'claims';

export default function SubscriptionsPage() {
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [rows, setRows] = useState<BillingStoreRow[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [status, setStatus] = useState<'' | BillingListStatus>('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<BulkAction | null>(null);
  const [view, setView] = useState<View>('stores');
  const [claims, setClaims] = useState<BillingClaim[]>([]);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const showingInactive = view === 'inactive';

  const loadList = useCallback(async () => {
    if (view !== 'stores' && view !== 'inactive') return;
    setLoading(true);
    try {
      const result = await api.getBillingStores({
        companyId: companyId || undefined,
        brandId: brandId || undefined,
        status: status || undefined,
        dueFrom: dueFrom || undefined,
        dueTo: dueTo || undefined,
        q: q.trim() || undefined,
        inactive: view === 'inactive' || undefined,
        page,
        limit: 20,
      });
      setRows(result.data);
      setTotalPages(result.pagination.totalPages);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not load stores'));
    } finally {
      setLoading(false);
    }
  }, [companyId, brandId, status, dueFrom, dueTo, q, page, view]);

  // Switching between active and inactive stores starts again from page 1
  const changeView = (next: View) => {
    if (next !== view) setPage(1);
    setView(next);
  };

  async function reactivate(row: BillingStoreRow) {
    if (!confirm(`Reactivate ${row.storeName}? Its staff can log in and use the store again right away.`)) return;
    setReactivatingId(row.tenantId);
    try {
      await api.reactivateStore(row.tenantId);
      toast.success(`${row.storeName} reactivated`);
      loadOverview();
      loadList();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not reactivate store'));
    } finally {
      setReactivatingId(null);
    }
  }

  const loadOverview = useCallback(() => {
    api.getBillingOverview().then(setOverview).catch(() => {});
  }, []);

  const loadClaims = useCallback(() => {
    api.getBillingClaims().then(setClaims).catch(() => {});
  }, []);

  useEffect(() => {
    if (view === 'claims') loadClaims();
  }, [view, loadClaims]);

  useEffect(() => {
    loadOverview();
    api.getCompanies().then(setCompanies).catch(() => {});
  }, [loadOverview]);

  useEffect(() => {
    setBrandId('');
    if (!companyId) {
      setBrands([]);
      return;
    }
    api.getBrandsByCompany(companyId).then(setBrands).catch(() => {});
  }, [companyId]);

  // A selection only covers rows the admin can see, so bulk actions never
  // touch stores hidden by a new filter or page.
  useEffect(() => {
    setSelected(new Set());
  }, [companyId, brandId, status, dueFrom, dueTo, q, page, view]);

  useEffect(() => {
    const t = setTimeout(loadList, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [loadList, q]);

  const toggleRow = (tenantId: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(tenantId)) next.delete(tenantId);
      else next.add(tenantId);
      return next;
    });

  const allOnPageSelected = rows.length > 0 && rows.every(r => selected.has(r.tenantId));
  const toggleAllOnPage = () =>
    setSelected(prev => {
      const next = new Set(prev);
      rows.forEach(r => (allOnPageSelected ? next.delete(r.tenantId) : next.add(r.tenantId)));
      return next;
    });

  async function runBulk(patch: UpdateStoreBillingPayload) {
    const ids = [...selected];
    try {
      const results = await api.bulkUpdateStoreBilling(ids, patch);
      const failed = results.filter(r => !r.ok);
      if (failed.length === 0) toast.success(`Updated ${results.length} store${results.length === 1 ? '' : 's'}`);
      else {
        const names = new Map(rows.map(r => [r.tenantId, r.storeName]));
        toast.error(
          `${failed.length} of ${results.length} failed: ` +
            failed.map(f => `${names.get(f.tenantId) ?? f.tenantId} — ${f.error}`).join('; '),
        );
      }
      setSelected(new Set(failed.map(f => f.tenantId)));
      setBulk(null);
      loadOverview();
      loadList();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Bulk update failed'));
    }
  }

  const counts = overview?.counts;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Subscriptions</h1>
        <p className="text-sm text-gray-500">Store billing status, prices and next invoices</p>
      </div>

      {overview && !overview.globalBillingEnabled && (
        <div className="rounded-lg bg-gray-100 border border-gray-200 px-4 py-3 text-sm text-gray-600">
          Billing is OFF globally — statuses below show what will apply once it&apos;s enabled. Turn it on in Settings → Billing.
        </div>
      )}

      {counts && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4">
          <StatCard label="Trial" value={counts.TRIAL} icon={Sparkles} tone="blue" />
          <StatCard label="Active" value={counts.ACTIVE} icon={CheckCircle2} tone="green" />
          <StatCard label="Due (grace)" value={counts.DUE} icon={AlertTriangle} tone="amber" />
          <StatCard label="Locked" value={counts.LOCKED} icon={Lock} tone="red" />
          <StatCard label="Exempt" value={counts.EXEMPT} icon={Ban} tone="gray" />
          <StatCard label="Not activated" value={counts.NOT_ACTIVATED} icon={Clock} tone="gray" />
          <StatCard label="Not set up" value={counts.NOT_SET_UP} icon={HelpCircle} tone="gray" />
          <StatCard label="Invoices next 7 days" value={overview.upcomingNext7Days} icon={CalendarClock} tone="indigo" />
        </div>
      )}

      {overview?.money && overview.money.limitPercent >= 100 ? (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          PayMongo limit reached:{' '}
          {overview.money.fallbackQrConfigured
            ? 'stores are being shown your bank QR.'
            : 'no bank QR is set up, so stores still get PayMongo, which may refuse payments. Upload a bank QR in Settings → Billing.'}{' '}
          {formatPeso(overview.money.qrphCollectedThisMonthCentavos)} of{' '}
          {formatPeso(overview.money.limitCentavos)} collected via QRPH this month.
        </div>
      ) : overview?.money?.limitWarn ? (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
          PayMongo collections are at {overview.money.limitPercent}% of your monthly limit ({formatPeso(overview.money.qrphCollectedThisMonthCentavos)} of{' '}
          {formatPeso(overview.money.limitCentavos)}). {overview.money.fallbackQrConfigured
            ? 'Past the limit, stores will be shown your fallback bank QR.'
            : 'No fallback bank QR is set up yet. Upload one in Settings → Billing before the limit is reached.'}
        </div>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MoneyCard label="Expected this month" value={overview?.money?.expectedThisMonthCentavos} />
        <MoneyCard label="Collected this month" value={overview?.money?.collectedThisMonthCentavos} />
        <MoneyCard label="Outstanding" value={overview?.money?.outstandingCentavos} />
        <button
          type="button"
          onClick={() => changeView('claims')}
          className="bg-white rounded-lg border p-4 text-left hover:border-indigo-300"
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2 text-amber-600 bg-amber-50">
            <Clock className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{overview?.money?.pendingClaims ?? 0}</p>
          <p className="text-xs text-gray-500">Pending payment claims</p>
        </button>
      </div>

      <div className="flex border-b text-sm">
        {([
          ['stores', 'Stores'],
          ['inactive', `Inactive stores${overview ? ` (${overview.inactive})` : ''}`],
          ['payments', 'Payments'],
          ['claims', 'Payment claims'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => changeView(key)}
            className={`px-4 py-2 font-medium border-b-2 -mb-px ${
              view === key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'payments' && <PaymentsLog />}
      {view === 'claims' && (
        <div className="bg-white rounded-lg border px-5">
          <ClaimsQueue claims={claims} showStore onChanged={() => { loadClaims(); loadOverview(); }} />
        </div>
      )}

      {showingInactive && (
        <p className="text-sm text-gray-500">
          Stores set to Inactive under Company → Stores. They are still invoiced and can still fall Due or Locked.
          Reactivate a store here once it has resubscribed.
        </p>
      )}

      {(view === 'stores' || showingInactive) && (<>

      <div className="flex flex-wrap gap-3 items-end">
        <input
          type="search"
          value={q}
          onChange={e => { setQ(e.target.value); setPage(1); }}
          placeholder="Search store, company or brand"
          className="px-3 py-2 border border-gray-300 rounded-md text-sm w-64"
        />
        <select
          value={companyId}
          onChange={e => { setCompanyId(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">All Companies</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={brandId}
          onChange={e => { setBrandId(e.target.value); setPage(1); }}
          disabled={!companyId}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="">All Brands</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select
          value={status}
          onChange={e => { setStatus(e.target.value as '' | BillingListStatus); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{BILLING_STATUS_LABELS[s]}</option>)}
        </select>
        <label className="text-xs text-gray-500">
          Due from
          <input type="date" value={dueFrom} onChange={e => { setDueFrom(e.target.value); setPage(1); }} className="block px-3 py-1.5 border border-gray-300 rounded-md text-sm" />
        </label>
        <label className="text-xs text-gray-500">
          Due to
          <input type="date" value={dueTo} onChange={e => { setDueTo(e.target.value); setPage(1); }} className="block px-3 py-1.5 border border-gray-300 rounded-md text-sm" />
        </label>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-indigo-50 border border-indigo-100 px-4 py-2 text-sm">
          <span className="font-medium text-indigo-900">{selected.size} selected</span>
          <button onClick={() => setBulk({ kind: 'price' })} className="px-3 py-1 rounded-md bg-white border text-gray-700 hover:bg-gray-50">Set price…</button>
          <button onClick={() => setBulk({ kind: 'enable' })} className="px-3 py-1 rounded-md bg-white border text-gray-700 hover:bg-gray-50">Enable billing</button>
          <button onClick={() => setBulk({ kind: 'exempt' })} className="px-3 py-1 rounded-md bg-white border text-gray-700 hover:bg-gray-50">Mark exempt…</button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-indigo-700 hover:underline">Clear</button>
        </div>
      )}

      <div className="bg-white rounded-lg border overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            {showingInactive ? 'No inactive stores match these filters' : 'No stores match these filters'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllOnPage} aria-label="Select all on page" />
                </th>
                <th className="px-4 py-3 text-left">Store</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Paid through</th>
                <th className="px-4 py-3 text-left">Next billing</th>
                <th className="px-4 py-3 text-right">Days overdue</th>
                <th className="px-4 py-3 text-left">Last payment</th>
                {showingInactive && <th className="px-4 py-3 text-left">Deactivated on</th>}
                {showingInactive && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(row => (
                <tr key={row.tenantId} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(row.tenantId)} onChange={() => toggleRow(row.tenantId)} aria-label={`Select ${row.storeName}`} />
                  </td>
                  <td className="px-4 py-3 min-w-48">
                    <Link href={`/subscriptions/${row.tenantId}`} className="font-medium text-gray-900 hover:text-indigo-600">
                      {row.storeName}
                    </Link>
                    <p className="text-xs text-gray-400">{[row.company?.name, row.brand?.name].filter(Boolean).join(' · ')}</p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatPeso(row.priceCentavos)}</td>
                  <td className="px-4 py-3" title={row.exemptReason ?? undefined}><BillingStatusBadge status={row.status} /></td>
                  <td className="px-4 py-3 text-gray-600">{formatManilaDate(row.paidThroughAt)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatManilaDate(row.nextBillingAt)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">{row.daysOverdue ? row.daysOverdue : '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{formatManilaDate(row.lastPaymentAt)}</td>
                  {showingInactive && <td className="px-4 py-3 text-gray-600">{formatManilaDate(row.deactivatedAt)}</td>}
                  {showingInactive && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => reactivate(row)}
                        disabled={reactivatingId === row.tenantId}
                        className="px-3 py-1 rounded-md border border-indigo-200 text-indigo-700 text-xs font-medium hover:bg-indigo-50 disabled:opacity-50 whitespace-nowrap"
                      >
                        {reactivatingId === row.tenantId ? 'Reactivating…' : 'Reactivate'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-3 py-1.5 text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      </>)}

      {bulk && <BulkDialog action={bulk} count={selected.size} onCancel={() => setBulk(null)} onSubmit={runBulk} />}
    </div>
  );
}

function BulkDialog({
  action,
  count,
  onCancel,
  onSubmit,
}: {
  action: BulkAction;
  count: number;
  onCancel: () => void;
  onSubmit: (patch: UpdateStoreBillingPayload) => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const title =
    action.kind === 'price' ? 'Set monthly price' : action.kind === 'enable' ? 'Enable billing' : 'Mark exempt';

  async function submit() {
    let patch: UpdateStoreBillingPayload;
    if (action.kind === 'price') {
      const priceCentavos = pesoToCentavos(value);
      if (!priceCentavos) { toast.error('Enter a price in pesos'); return; }
      patch = { priceCentavos };
    } else if (action.kind === 'exempt') {
      if (!value.trim()) { toast.error('An exemption reason is required'); return; }
      patch = { billingEnabled: false, exemptReason: value.trim() };
    } else {
      patch = { billingEnabled: true };
    }
    setBusy(true);
    try {
      await onSubmit(patch);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">{title} — {count} store{count === 1 ? '' : 's'}</h3>
        {action.kind === 'price' && (
          <input autoFocus inputMode="decimal" placeholder="1,500.00" value={value} onChange={e => setValue(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
        )}
        {action.kind === 'exempt' && (
          <textarea autoFocus rows={3} placeholder="Reason (e.g. owner's store, special agreement)" value={value} onChange={e => setValue(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
        )}
        {action.kind === 'enable' && (
          <p className="text-sm text-gray-600">
            Stores without a price or activation date are skipped and reported. Months already marked paid are honored, so no store is billed for them.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
          <button onClick={submit} disabled={busy} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {busy ? 'Applying...' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MoneyCard({ label, value }: { label: string; value?: number }) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2 text-indigo-600 bg-indigo-50">
        <Wallet className="w-4 h-4" />
      </div>
      <p className="text-2xl font-bold text-gray-900 tabular-nums">{value == null ? '—' : formatPeso(value)}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: 'indigo' | 'green' | 'gray' | 'red' | 'amber' | 'blue';
}) {
  const toneClasses: Record<string, string> = {
    indigo: 'text-indigo-600 bg-indigo-50',
    green: 'text-green-600 bg-green-50',
    gray: 'text-gray-500 bg-gray-100',
    red: 'text-red-600 bg-red-50',
    amber: 'text-amber-600 bg-amber-50',
    blue: 'text-blue-600 bg-blue-50',
  };
  return (
    <div className="bg-white rounded-lg border p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${toneClasses[tone]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
