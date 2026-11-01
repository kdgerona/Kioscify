'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Gift, MoreHorizontal, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { hasPrivilege } from '@/lib/privileges';
import { useTenant } from '@/contexts/TenantContext';
import type { RewardProgram, RewardProgramStatus } from '@/components/rewards/types';
import { getRewardType } from '@/components/rewards/registry';
import { ScopeBadge, StatusBadge } from '@/components/rewards/badges';
import { asLoyaltyConfig, countKinds, formatShortDate } from '@/components/rewards/loyalty-card';
import { NewProgramModal, type NewProgramDetails } from './_components/NewProgramModal';
import { RewardActivity } from './_components/RewardActivity';
import { isReadOnlyProgram, rewardErrorText } from './_components/lib';

type Tab = 'activity' | 'programs';
const TABS: Tab[] = ['activity', 'programs'];
const ACTIVE_TAB_COLOR = '#1f2937';
const TH = 'px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider';

function programDates(p: RewardProgram): string {
  if (p.startsAt && p.endsAt) return `${formatShortDate(p.startsAt)} – ${formatShortDate(p.endsAt)}`;
  if (p.endsAt) return `Until ${formatShortDate(p.endsAt)}`;
  if (p.startsAt) return `From ${formatShortDate(p.startsAt)}`;
  return '—';
}

export default function RewardsPage() {
  return (
    <Suspense fallback={null}>
      <RewardsPageContent />
    </Suspense>
  );
}

function RewardsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { tenant, brand, company } = useTenant();
  const primaryColor = brand?.themeColors?.primary ?? tenant?.themeColors?.primary ?? '#ea580c';
  const canWrite = hasPrivilege('rewards', 'write');
  const canDelete = hasPrivilege('rewards', 'all');

  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get('tab') as Tab | null;
    return t && TABS.includes(t) ? t : 'activity';
  });
  const [programs, setPrograms] = useState<RewardProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasPrivilege('rewards', 'read')) router.replace('/dashboard');
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPrograms(await api.getRewardPrograms());
    } catch (err) {
      setError(rewardErrorText(err, 'Failed to load reward programs'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!menuFor) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuFor(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuFor]);

  const changeTab = (t: Tab) => {
    setTab(t);
    router.replace(`/rewards?tab=${t}`, { scroll: false });
  };

  // Company programs first, then the store's own.
  const sorted = [...programs].sort((a, b) => Number(isReadOnlyProgram(b)) - Number(isReadOnlyProgram(a)) || a.name.localeCompare(b.name));

  const replace = (updated: RewardProgram) => setPrograms(prev => prev.map(p => (p.id === updated.id ? updated : p)));

  const setStatus = async (p: RewardProgram, status: RewardProgramStatus) => {
    setMenuFor(null);
    if (status === 'ACTIVE' && p.type === 'LOYALTY_CARD' && countKinds(asLoyaltyConfig(p.config).slots).stamps === 0) {
      toast.error('Add at least one stamp before activating.');
      return;
    }
    if (status === 'ARCHIVED' && !confirm(`Archive “${p.name}”? It stops showing on the kiosk. Past activity is kept.`)) return;
    setBusyId(p.id);
    try {
      replace(await api.updateRewardProgram(p.id, { status }));
      toast.success(status === 'ACTIVE' ? 'Program activated' : status === 'PAUSED' ? 'Program paused' : 'Program archived');
    } catch (err) {
      toast.error(rewardErrorText(err, 'Failed to update program'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (p: RewardProgram) => {
    setMenuFor(null);
    if (!confirm(`Delete “${p.name}”? It disappears from the kiosk. Past activity is kept.`)) return;
    setBusyId(p.id);
    try {
      await api.deleteRewardProgram(p.id);
      setPrograms(prev => prev.filter(x => x.id !== p.id));
      toast.success('Program deleted');
    } catch (err) {
      toast.error(rewardErrorText(err, 'Failed to delete program'));
    } finally {
      setBusyId(null);
    }
  };

  // Not persisted until the first save: the API validates the full card on create.
  const startNew = (d: NewProgramDetails) => {
    const params = new URLSearchParams({ type: d.type, name: d.name });
    if (d.description) params.set('description', d.description);
    router.push(`/rewards/new?${params.toString()}`);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'activity', label: 'Activity' },
    { id: 'programs', label: 'Programs' },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Rewards</h1>
        <p className="text-sm sm:text-base text-gray-600 mt-2">Loyalty card stamps and rewards recorded at this store.</p>
      </div>

      {/* Tabs (store tab style) */}
      <div className="mb-6 border-b border-gray-200">
        <div className="flex space-x-8" role="tablist">
          {tabs.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => changeTab(t.id)}
              className={`pb-4 px-2 border-b-2 font-medium transition-colors ${
                tab === t.id ? 'border-current' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              style={tab === t.id ? { color: ACTIVE_TAB_COLOR, borderColor: primaryColor } : undefined}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'activity' && <RewardActivity programs={programs} primaryColor={primaryColor} />}

      {tab === 'programs' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              Store programs are yours to edit. Company programs are set up by {company?.name ?? 'your company'}.
            </p>
            {canWrite && (
              <button
                onClick={() => setShowNew(true)}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-black rounded-lg text-sm font-medium hover:brightness-90 flex-shrink-0"
                style={{ backgroundColor: primaryColor }}
              >
                <Plus className="w-4 h-4" /> New program
              </button>
            )}
          </div>

          {loading ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderBottomColor: primaryColor }} />
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm flex items-center justify-between gap-4">
              <span>{error}</span>
              <button onClick={load} className="font-medium hover:underline">
                Retry
              </button>
            </div>
          ) : sorted.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 text-center py-12 px-4">
              <Gift className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">
                No programs yet. Create one for this store, or ask your company admin to enroll this store in theirs.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className={TH}>Program</th>
                    <th className={TH}>Source</th>
                    <th className={TH}>Type</th>
                    <th className={TH}>Status</th>
                    <th className={TH}>Dates</th>
                    <th className="px-6 py-4" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sorted.map(p => {
                    const meta = getRewardType(p.type);
                    const Icon = meta?.icon;
                    const readOnly = isReadOnlyProgram(p);
                    const canActivate = p.status === 'DRAFT' || p.status === 'PAUSED';
                    return (
                      <tr
                        key={p.id}
                        onClick={() => router.push(`/rewards/${p.id}`)}
                        className={`hover:bg-gray-50 cursor-pointer transition ${busyId === p.id ? 'opacity-60' : ''}`}
                      >
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-gray-900">{p.name}</p>
                          <p className="text-xs text-gray-400">{meta?.summarize(p.config) || p.summary}</p>
                        </td>
                        <td className="px-6 py-4">
                          <ScopeBadge scope={p.scope} />
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            {Icon && <Icon className="w-4 h-4 text-gray-400" />}
                            {meta?.label ?? p.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={p.status} startsAt={p.startsAt} endsAt={p.endsAt} />
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">{programDates(p)}</td>
                        <td className="px-6 py-4 text-right" onClick={e => e.stopPropagation()}>
                          {!readOnly && canWrite && p.status !== 'ARCHIVED' && (
                            <div className="relative inline-block" ref={menuFor === p.id ? menuRef : undefined}>
                              <button
                                aria-label={`Actions for ${p.name}`}
                                aria-haspopup="menu"
                                aria-expanded={menuFor === p.id}
                                disabled={busyId === p.id}
                                onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}
                                className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                              {menuFor === p.id && (
                                <div role="menu" className="absolute right-0 z-20 mt-1 w-40 bg-white rounded-lg border border-gray-200 shadow-lg py-1 text-left">
                                  <button
                                    role="menuitem"
                                    onClick={() => setStatus(p, canActivate ? 'ACTIVE' : 'PAUSED')}
                                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                  >
                                    {canActivate ? 'Activate' : 'Pause'}
                                  </button>
                                  <button role="menuitem" onClick={() => setStatus(p, 'ARCHIVED')} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                                    Archive
                                  </button>
                                  {canDelete && (
                                    <button role="menuitem" onClick={() => remove(p)} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                                      Delete
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          {!readOnly && canDelete && p.status === 'ARCHIVED' && (
                            <button
                              onClick={() => remove(p)}
                              disabled={busyId === p.id}
                              className="text-xs font-medium text-red-600 hover:text-red-700"
                            >
                              Delete
                            </button>
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
      )}

      {showNew && <NewProgramModal primaryColor={primaryColor} onClose={() => setShowNew(false)} onNext={startNew} />}
    </div>
  );
}
