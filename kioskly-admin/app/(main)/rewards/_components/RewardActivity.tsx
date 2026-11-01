'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { AlertTriangle, ChevronDown, Gift, Receipt, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { hasPrivilege } from '@/lib/privileges';
import { usePagination } from '@/lib/use-pagination';
import { Pagination } from '@/components/ui/pagination';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { RewardEvent, RewardEventType, RewardProgram, RewardSummary } from '@/components/rewards/types';
import { EventTypeBadge, EVENT_TYPE_LABELS, FlaggedBadge, ScopeBadge, VoidedBadge } from '@/components/rewards/badges';
import { formatDateTime, peso } from '@/components/rewards/loyalty-card';
import { rewardErrorText, transactionHref } from './lib';

interface Props {
  /** Programs offered in the Program filter and used for scope badges. */
  programs: RewardProgram[];
  /** Pins the activity to one program (program detail page): hides the Program filter. */
  programId?: string;
  primaryColor: string;
}

const ALL = 'ALL';
const TEXT_COLOR = '#1f2937';
const TH = 'px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider';
const TH_RIGHT = 'px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider';
const EVENT_TYPES: RewardEventType[] = ['CARD_ISSUED', 'STAMP_ADDED', 'REWARD_REDEEMED'];

/** Activity tab: summary tiles, filters, events table and by-slot breakdown. */
export function RewardActivity({ programs, programId: fixedProgramId, primaryColor }: Props) {
  const [programId, setProgramId] = useState<string>(fixedProgramId ?? ALL);
  const [eventType, setEventType] = useState<string>(ALL);
  const [range, setRange] = useState<DateRange | undefined>(() => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }));
  const [includeVoided, setIncludeVoided] = useState(false);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [summary, setSummary] = useState<RewardSummary | null>(null);
  const [events, setEvents] = useState<RewardEvent[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slotsOpen, setSlotsOpen] = useState(true);

  const canOpenTransactions = hasPrivilege('transactions', 'read');
  const programById = useMemo(() => new Map(programs.map(p => [p.id, p])), [programs]);
  const companyPrograms = programs.filter(p => p.scope === 'COMPANY');
  const storePrograms = programs.filter(p => p.scope === 'STORE');

  const filters = useMemo(
    () => ({
      programId: programId === ALL ? undefined : programId,
      type: eventType === ALL ? undefined : (eventType as RewardEventType),
      startDate: range?.from ? startOfDay(range.from).toISOString() : undefined,
      endDate: range?.to ? endOfDay(range.to).toISOString() : range?.from ? endOfDay(range.from).toISOString() : undefined,
      includeVoided,
      onlyFlagged,
    }),
    [programId, eventType, range, includeVoided, onlyFlagged],
  );

  const pager = usePagination(JSON.stringify(filters));
  const { page, pageSize, applyResult, beginRequest } = pager;

  useEffect(() => {
    let cancelled = false;
    setLoadingSummary(true);
    setError(null);
    api
      .getRewardSummary(filters)
      .then(s => !cancelled && setSummary(s))
      .catch(err => !cancelled && setError(rewardErrorText(err, 'Failed to load reward activity')))
      .finally(() => !cancelled && setLoadingSummary(false));
    return () => {
      cancelled = true;
    };
  }, [filters, refreshKey]);

  const loadEvents = useCallback(async () => {
    const isLatest = beginRequest();
    setLoadingEvents(true);
    try {
      const result = await api.getRewardEvents({ ...filters, page, limit: pageSize });
      if (!isLatest()) return;
      setEvents(result.data);
      applyResult(result.pagination);
    } catch (err) {
      if (isLatest()) setError(rewardErrorText(err, 'Failed to load reward activity'));
    } finally {
      if (isLatest()) {
        setLoadingEvents(false);
        setLoadedOnce(true);
      }
    }
  }, [filters, page, pageSize, applyResult, beginRequest]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents, refreshKey]);

  const tiles = [
    { label: 'Cards issued', value: summary?.totals.CARD_ISSUED.toLocaleString(), cls: 'text-gray-900' },
    { label: 'Stamps given', value: summary?.totals.STAMP_ADDED.toLocaleString(), cls: 'text-gray-900' },
    { label: 'Rewards redeemed', value: summary?.totals.REWARD_REDEEMED.toLocaleString(), cls: 'text-gray-900' },
    { label: 'Reward discounts', value: summary ? peso(summary.totalRewardDiscount) : undefined, cls: 'text-green-700' },
  ];
  const flagged = summary?.totals.flaggedEvents ?? 0;
  const hasActiveProgram = programs.some(p => p.status === 'ACTIVE');
  const selectHover = { '--select-hover-bg': `${primaryColor}20`, '--select-hover-text': TEXT_COLOR } as React.CSSProperties;
  const checkbox = 'w-4 h-4 rounded border-gray-300';

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 border border-gray-200">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-center">
          {!fixedProgramId && (
            <Select value={programId} onValueChange={setProgramId}>
              <SelectTrigger style={{ color: TEXT_COLOR }} aria-label="Program">
                <SelectValue />
              </SelectTrigger>
              <SelectContent style={selectHover}>
                <SelectItem value={ALL}>All programs</SelectItem>
                {companyPrograms.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Company programs</SelectLabel>
                    {companyPrograms.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {storePrograms.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Store programs</SelectLabel>
                    {storePrograms.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          )}
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger style={{ color: TEXT_COLOR }} aria-label="Event">
              <SelectValue />
            </SelectTrigger>
            <SelectContent style={selectHover}>
              <SelectItem value={ALL}>All events</SelectItem>
              {EVENT_TYPES.map(t => (
                <SelectItem key={t} value={t}>
                  {EVENT_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* No reward-type filter: spec 3.1 hides it while only LOYALTY_CARD exists. */}
          <DateRangePicker date={range} onDateChange={setRange} />
          <div className="flex items-center gap-4 flex-wrap">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyFlagged}
                onChange={e => setOnlyFlagged(e.target.checked)}
                className={checkbox}
                style={{ accentColor: primaryColor }}
              />
              Only flagged
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeVoided}
                onChange={e => setIncludeVoided(e.target.checked)}
                className={checkbox}
                style={{ accentColor: primaryColor }}
              />
              Include voided
            </label>
            <button
              type="button"
              onClick={() => setRefreshKey(k => k + 1)}
              className="ml-auto p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:text-gray-900 hover:border-gray-400 transition flex items-center justify-center"
              title="Refresh"
              aria-label="Refresh"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm whitespace-pre-line">{error}</div>}

      {/* Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map(t => (
          <div key={t.label} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase">{t.label}</p>
            {loadingSummary || t.value === undefined ? (
              <div className="h-8 w-20 bg-gray-200 rounded animate-pulse mt-1" />
            ) : (
              <p className={`text-2xl font-bold mt-1 tabular-nums ${t.cls}`}>{t.value}</p>
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

      {/* Events */}
      <div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
          {loadingEvents && loadedOnce && (
            <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderBottomColor: primaryColor }} />
            </div>
          )}
          {!loadedOnce ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderBottomColor: primaryColor }} />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12">
              <Gift className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No reward activity yet</p>
              {!hasActiveProgram && <p className="text-sm text-gray-500 mt-1">Programs appear on the kiosk once they&apos;re active.</p>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className={TH}>Date &amp; time</th>
                    {!fixedProgramId && <th className={TH}>Program</th>}
                    <th className={TH}>Event</th>
                    <th className={TH}>Slot</th>
                    <th className={TH}>Item</th>
                    <th className={TH_RIGHT}>Discount</th>
                    <th className={TH}>Cashier</th>
                    <th className={TH}>Transaction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {events.map(e => {
                    const muted = e.isVoided ? 'line-through text-gray-400' : '';
                    const warnings = e.validationWarnings ?? [];
                    const program = programById.get(e.programId);
                    const code = e.transactionCode ?? e.transactionId;
                    return (
                      <tr key={e.id} className={`hover:bg-gray-50 transition ${e.isVoided ? 'text-gray-400' : ''}`}>
                        <td className={`px-6 py-4 text-sm text-gray-600 whitespace-nowrap ${muted}`}>{formatDateTime(e.occurredAt)}</td>
                        {!fixedProgramId && (
                          <td className="px-6 py-4 text-sm">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-medium text-gray-900 ${muted}`}>{e.programName}</span>
                              {program && <ScopeBadge scope={program.scope} />}
                            </div>
                          </td>
                        )}
                        <td className="px-6 py-4 text-sm">
                          <span className="inline-flex items-center gap-1.5 flex-wrap" aria-label={EVENT_TYPE_LABELS[e.type]}>
                            <EventTypeBadge type={e.type} />
                            {e.isVoided && <VoidedBadge />}
                            {warnings.length > 0 && <FlaggedBadge warnings={warnings} />}
                          </span>
                        </td>
                        <td className={`px-6 py-4 text-sm text-gray-700 ${muted}`}>{e.slotLabel ?? <span className="text-gray-400">—</span>}</td>
                        <td className={`px-6 py-4 text-sm text-gray-700 ${muted}`}>{e.productName ?? <span className="text-gray-400">—</span>}</td>
                        <td className={`px-6 py-4 text-sm text-right tabular-nums whitespace-nowrap ${muted}`}>
                          {e.type === 'REWARD_REDEEMED' && e.discountAmount ? (
                            <span className={e.isVoided ? '' : 'text-red-600 font-medium'}>-{peso(e.discountAmount)}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className={`px-6 py-4 text-sm text-gray-700 ${muted}`}>{e.cashierName ?? '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {canOpenTransactions ? (
                            <Link
                              href={transactionHref(e.transactionId)}
                              className={`inline-flex items-center gap-1.5 font-mono text-sm text-gray-900 hover:underline ${muted}`}
                              title="Open transaction"
                            >
                              <Receipt className="w-4 h-4 text-gray-400" />
                              {code}
                            </Link>
                          ) : (
                            <span className={`inline-flex items-center gap-1.5 font-mono text-sm text-gray-700 ${muted}`}>
                              <Receipt className="w-4 h-4 text-gray-400" />
                              {code}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <Pagination
          page={pager.page}
          totalPages={pager.totalPages}
          total={pager.total}
          pageSize={pager.pageSize}
          onPageChange={pager.setPage}
          onPageSizeChange={pager.setPageSize}
          disabled={loadingEvents}
          primaryColor={primaryColor}
        />
      </div>

      {/* By slot */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
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
          <div className="overflow-x-auto border-t border-gray-200">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {!fixedProgramId && <th className={TH}>Program</th>}
                  <th className={TH}>Slot</th>
                  <th className={TH}>Event</th>
                  <th className={TH_RIGHT}>Count</th>
                  <th className={TH_RIGHT}>Discount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {!summary || summary.bySlot.length === 0 ? (
                  <tr>
                    <td colSpan={fixedProgramId ? 4 : 5} className="px-6 py-8 text-center text-sm text-gray-400">
                      {loadingSummary ? 'Loading…' : 'No activity in this period.'}
                    </td>
                  </tr>
                ) : (
                  summary.bySlot.map(s => (
                    <tr key={`${s.programId}|${s.type}|${s.slotKey ?? ''}`}>
                      {!fixedProgramId && <td className="px-6 py-4 text-sm text-gray-700">{s.programName ?? '—'}</td>}
                      <td className="px-6 py-4 text-sm text-gray-900">{s.slotLabel ?? <span className="text-gray-400">—</span>}</td>
                      <td className="px-6 py-4 text-sm">
                        <EventTypeBadge type={s.type} />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 text-right tabular-nums">{s.count.toLocaleString()}</td>
                      <td className="px-6 py-4 text-sm text-gray-700 text-right tabular-nums">
                        {s.discountTotal ? peso(s.discountTotal) : <span className="text-gray-400">—</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
