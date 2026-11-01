'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import type { Store } from '@/types';
import type { Paginated, RewardEvent, RewardProgram, RewardSummary } from '@/components/rewards/types';
import { EventTypeBadge, EVENT_TYPE_LABELS, FlaggedBadge, VoidedBadge } from '@/components/rewards/badges';
import { formatDateTime, peso } from '@/components/rewards/loyalty-card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateRangePicker } from '../../analytics/components/DateRangePicker';
import { rewardErrorText } from './lib';

interface Props {
  program: RewardProgram;
  stores: Store[];
  primaryColor: string;
  onGoToStores: () => void;
}

const ALL = 'all';
const PAGE_SIZE = 20;

const TH = 'px-6 py-3 text-xs font-medium text-gray-500 uppercase';

export function ProgramActivityTab({ program, stores, primaryColor, onGoToStores }: Props) {
  const [storeId, setStoreId] = useState(ALL);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [includeVoided, setIncludeVoided] = useState(false);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<RewardSummary | null>(null);
  const [events, setEvents] = useState<Paginated<RewardEvent> | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slotsOpen, setSlotsOpen] = useState(false);

  const filters = useMemo(
    () =>
      range
        ? {
            programId: program.id,
            storeId: storeId === ALL ? undefined : storeId,
            startDate: range.start,
            endDate: range.end,
            includeVoided,
            onlyFlagged,
          }
        : null,
    [program.id, storeId, range, includeVoided, onlyFlagged],
  );

  useEffect(() => setPage(1), [filters]);

  useEffect(() => {
    if (!filters) return;
    let cancelled = false;
    setLoadingSummary(true);
    setError(null);
    api
      .getRewardSummary(filters)
      .then(s => !cancelled && setSummary(s))
      .catch(err => !cancelled && setError(rewardErrorText(err, 'Failed to load activity')))
      .finally(() => !cancelled && setLoadingSummary(false));
    return () => {
      cancelled = true;
    };
  }, [filters]);

  useEffect(() => {
    if (!filters) return;
    let cancelled = false;
    setLoadingEvents(true);
    api
      .getRewardEvents({ ...filters, page, limit: PAGE_SIZE })
      .then(e => !cancelled && setEvents(e))
      .catch(err => !cancelled && setError(rewardErrorText(err, 'Failed to load activity')))
      .finally(() => !cancelled && setLoadingEvents(false));
    return () => {
      cancelled = true;
    };
  }, [filters, page]);

  const enrolledStores = useMemo(() => {
    const ids = new Set(program.storeIds ?? []);
    // Offer enrolled stores first; past activity can come from since-unenrolled stores too.
    return [...stores].sort((a, b) => Number(ids.has(b.id)) - Number(ids.has(a.id)) || a.name.localeCompare(b.name));
  }, [stores, program.storeIds]);

  const tiles = [
    { label: 'Cards issued', value: summary?.totals.CARD_ISSUED.toLocaleString() },
    { label: 'Stamps', value: summary?.totals.STAMP_ADDED.toLocaleString() },
    { label: 'Redemptions', value: summary?.totals.REWARD_REDEEMED.toLocaleString() },
    { label: 'Reward discount', value: summary ? peso(summary.totalRewardDiscount) : undefined },
  ];
  const flagged = summary?.totals.flaggedEvents ?? 0;
  const rows = events?.data ?? [];
  const pg = events?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={storeId} onValueChange={setStoreId}>
          <SelectTrigger className="w-52 h-9 text-sm" aria-label="Store">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All stores</SelectItem>
            {enrolledStores.map(s => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DateRangePicker initialPreset="this_month" onChange={(start, end) => setRange({ start, end })} />
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={includeVoided}
            onChange={e => setIncludeVoided(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300"
            style={{ accentColor: primaryColor }}
          />
          Include voided
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyFlagged}
            onChange={e => setOnlyFlagged(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300"
            style={{ accentColor: primaryColor }}
          />
          Only flagged
        </label>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm">{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map(t => (
          <div key={t.label} className="bg-white rounded-lg border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase">{t.label}</p>
            {loadingSummary || t.value === undefined ? (
              <div className="h-8 w-20 bg-gray-200 rounded animate-pulse mt-1" />
            ) : (
              <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{t.value}</p>
            )}
          </div>
        ))}
      </div>

      {!loadingSummary && flagged > 0 && !onlyFlagged && (
        <button
          type="button"
          onClick={() => setOnlyFlagged(true)}
          className="inline-flex items-center gap-1.5 text-sm text-amber-700 hover:underline"
          title="Sales synced after the program changed (e.g. queued offline). Review them before trusting the totals."
        >
          <AlertTriangle className="w-4 h-4" />
          {flagged} flagged event{flagged === 1 ? '' : 's'} in this period. Show them
        </button>
      )}

      {/* By store */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">By store</h2>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className={`${TH} text-left`}>Store</th>
              <th className={`${TH} text-right`}>Cards</th>
              <th className={`${TH} text-right`}>Stamps</th>
              <th className={`${TH} text-right`}>Redemptions</th>
              <th className={`${TH} text-right`}>Discount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {!summary || summary.byStore.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-400">
                  {loadingSummary ? 'Loading…' : 'No activity in this period.'}
                </td>
              </tr>
            ) : (
              summary.byStore.map(s => (
                <tr key={s.tenantId}>
                  <td className="px-6 py-3 text-sm text-gray-900">{s.storeName ?? '—'}</td>
                  <td className="px-6 py-3 text-sm text-gray-700 text-right tabular-nums">{s.CARD_ISSUED.toLocaleString()}</td>
                  <td className="px-6 py-3 text-sm text-gray-700 text-right tabular-nums">{s.STAMP_ADDED.toLocaleString()}</td>
                  <td className="px-6 py-3 text-sm text-gray-700 text-right tabular-nums">{s.REWARD_REDEEMED.toLocaleString()}</td>
                  <td className="px-6 py-3 text-sm text-gray-700 text-right tabular-nums">{peso(s.totalRewardDiscount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* By slot */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <button
          type="button"
          aria-expanded={slotsOpen}
          onClick={() => setSlotsOpen(o => !o)}
          className="w-full px-6 py-4 flex items-center justify-between text-left"
        >
          <h2 className="font-semibold text-gray-900">By slot</h2>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${slotsOpen ? 'rotate-180' : ''}`} />
        </button>
        {slotsOpen && (
          <table className="min-w-full divide-y divide-gray-200 border-t">
            <thead className="bg-gray-50">
              <tr>
                <th className={`${TH} text-left`}>Slot</th>
                <th className={`${TH} text-left`}>Event</th>
                <th className={`${TH} text-right`}>Count</th>
                <th className={`${TH} text-right`}>Discount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {!summary || summary.bySlot.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-400">
                    No activity in this period.
                  </td>
                </tr>
              ) : (
                summary.bySlot.map(s => (
                  <tr key={`${s.programId}|${s.type}|${s.slotKey ?? ''}`}>
                    <td className="px-6 py-3 text-sm text-gray-900">{s.slotLabel ?? <span className="text-gray-400">—</span>}</td>
                    <td className="px-6 py-3 text-sm">
                      <EventTypeBadge type={s.type} />
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-700 text-right tabular-nums">{s.count.toLocaleString()}</td>
                    <td className="px-6 py-3 text-sm text-gray-700 text-right tabular-nums">
                      {s.discountTotal ? peso(s.discountTotal) : <span className="text-gray-400">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Events */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Recent events</h2>
        </div>
        <div className="relative overflow-x-auto">
          {loadingEvents && events && (
            <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2" style={{ borderBottomColor: primaryColor }} />
            </div>
          )}
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className={`${TH} text-left`}>Date &amp; time</th>
                <th className={`${TH} text-left`}>Store</th>
                <th className={`${TH} text-left`}>Event</th>
                <th className={`${TH} text-left`}>Slot</th>
                <th className={`${TH} text-left`}>Item</th>
                <th className={`${TH} text-right`}>Discount</th>
                <th className={`${TH} text-left`}>Cashier</th>
                <th className={`${TH} text-left`}>Txn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {!events && loadingEvents ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2" style={{ borderBottomColor: primaryColor }} />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-sm text-gray-400">
                    {program.storeCount === 0 ? (
                      <>
                        Enroll stores on the{' '}
                        <button type="button" onClick={onGoToStores} className="font-medium hover:underline" style={{ color: primaryColor }}>
                          Stores tab
                        </button>{' '}
                        to start collecting activity.
                      </>
                    ) : (
                      'No activity in this period.'
                    )}
                  </td>
                </tr>
              ) : (
                rows.map(e => {
                  const muted = e.isVoided ? 'line-through text-gray-400' : '';
                  const warnings = e.validationWarnings ?? [];
                  return (
                    <tr key={e.id} className={e.isVoided ? 'text-gray-400' : ''}>
                      <td className={`px-6 py-3 text-sm text-gray-600 whitespace-nowrap ${muted}`}>{formatDateTime(e.occurredAt)}</td>
                      <td className={`px-6 py-3 text-sm text-gray-900 ${muted}`}>{e.storeName ?? '—'}</td>
                      <td className="px-6 py-3 text-sm">
                        <span className="inline-flex items-center gap-1.5 flex-wrap" aria-label={EVENT_TYPE_LABELS[e.type]}>
                          <EventTypeBadge type={e.type} />
                          {e.isVoided && <VoidedBadge />}
                          {warnings.length > 0 && <FlaggedBadge warnings={warnings} />}
                        </span>
                      </td>
                      <td className={`px-6 py-3 text-sm text-gray-700 ${muted}`}>{e.slotLabel ?? <span className="text-gray-400">—</span>}</td>
                      <td className={`px-6 py-3 text-sm text-gray-700 ${muted}`}>{e.productName ?? <span className="text-gray-400">—</span>}</td>
                      <td className={`px-6 py-3 text-sm text-right tabular-nums ${muted}`}>
                        {e.type === 'REWARD_REDEEMED' && e.discountAmount ? (
                          <span className={e.isVoided ? '' : 'text-red-600 font-medium'}>-{peso(e.discountAmount)}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className={`px-6 py-3 text-sm text-gray-700 ${muted}`}>{e.cashierName ?? '—'}</td>
                      <td className={`px-6 py-3 font-mono text-xs text-gray-600 ${muted}`}>{e.transactionCode ?? '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {pg && pg.totalPages > 1 && (
          <div className="px-6 py-3 border-t flex items-center justify-between text-sm text-gray-600">
            <span className="tabular-nums">
              {(pg.page - 1) * pg.limit + 1}–{Math.min(pg.page * pg.limit, pg.total)} of {pg.total.toLocaleString()}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Previous page"
                disabled={page <= 1 || loadingEvents}
                onClick={() => setPage(p => p - 1)}
                className="p-1.5 rounded border border-gray-200 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="tabular-nums">
                Page {pg.page} of {pg.totalPages}
              </span>
              <button
                type="button"
                aria-label="Next page"
                disabled={page >= pg.totalPages || loadingEvents}
                onClick={() => setPage(p => p + 1)}
                className="p-1.5 rounded border border-gray-200 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
