'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Gift, MoreHorizontal, Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { hasPrivilege } from '@/lib/privileges';
import { useCompany } from '@/contexts/CompanyContext';
import type { Brand } from '@/types';
import type { RewardProgram, RewardProgramStatus } from '@/components/rewards/types';
import { REWARD_TYPES, getRewardType } from '@/components/rewards/registry';
import { NotLiveBadge, STATUS_LABELS, StatusBadge } from '@/components/rewards/badges';
import { asLoyaltyConfig, countKinds, formatShortDate } from '@/components/rewards/loyalty-card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NewProgramModal, type NewProgramDetails } from './_components/NewProgramModal';
import { rewardErrorText } from './_components/lib';

const ALL = 'all';

export default function RewardsPage() {
  const router = useRouter();
  const { company } = useCompany();
  const primaryColor = company?.themeColors?.primary ?? '#ea580c';
  const canWrite = hasPrivilege('rewards', 'write');
  const canDelete = hasPrivilege('rewards', 'all');

  const [programs, setPrograms] = useState<RewardProgram[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState(ALL);
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [search, setSearch] = useState('');
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
      const [p, b] = await Promise.all([api.getRewardPrograms(), api.getBrands()]);
      setPrograms(p);
      setBrands(b);
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

  const brandById = useMemo(() => new Map(brands.map(b => [b.id, b])), [brands]);
  const availableTypes = REWARD_TYPES.filter(t => t.available);
  const filtersActive = brandFilter !== ALL || typeFilter !== ALL || statusFilter !== ALL || search.trim() !== '';

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return programs.filter(
      p =>
        (brandFilter === ALL || p.brandId === brandFilter) &&
        (typeFilter === ALL || p.type === typeFilter) &&
        (statusFilter === ALL || p.status === statusFilter) &&
        (!q || p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q)),
    );
  }, [programs, brandFilter, typeFilter, statusFilter, search]);

  const clearFilters = () => {
    setBrandFilter(ALL);
    setTypeFilter(ALL);
    setStatusFilter(ALL);
    setSearch('');
  };

  const replace = (updated: RewardProgram) => setPrograms(prev => prev.map(p => (p.id === updated.id ? updated : p)));

  const setStatus = async (p: RewardProgram, status: RewardProgramStatus) => {
    setMenuFor(null);
    if (status === 'ACTIVE' && p.type === 'LOYALTY_CARD' && countKinds(asLoyaltyConfig(p.config).slots).stamps === 0) {
      toast.error('Add at least one stamp before activating.');
      return;
    }
    if (status === 'ARCHIVED' && !confirm(`Archive “${p.name}”? Stores stop seeing it on the kiosk. Past activity is kept.`)) return;
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

  const duplicate = async (p: RewardProgram) => {
    setMenuFor(null);
    setBusyId(p.id);
    try {
      const copy = await api.createRewardProgram({
        name: `Copy of ${p.name}`.slice(0, 60),
        description: p.description ?? undefined,
        type: p.type,
        status: 'DRAFT',
        config: p.config,
        brandId: p.brandId,
      });
      setPrograms(prev => [copy, ...prev]);
      toast.success('Program duplicated as a draft');
    } catch (err) {
      toast.error(rewardErrorText(err, 'Failed to duplicate program'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (p: RewardProgram) => {
    setMenuFor(null);
    if (!confirm(`Delete “${p.name}”? It disappears from every store. Past activity is kept.`)) return;
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

  const startNew = (d: NewProgramDetails) => {
    const params = new URLSearchParams({ type: d.type, brandId: d.brandId, name: d.name });
    if (d.description) params.set('description', d.description);
    router.push(`/rewards/new?${params.toString()}`);
  };

  const newButton = canWrite && (
    <button
      onClick={() => setShowNew(true)}
      className="inline-flex items-center gap-1.5 px-4 py-2 text-white rounded-lg text-sm font-medium hover:brightness-90"
      style={{ backgroundColor: primaryColor }}
    >
      <Plus className="w-4 h-4" /> New program
    </button>
  );

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rewards</h1>
          <p className="text-sm text-gray-500 mt-1">Loyalty cards and promos for your brands&apos; stores.</p>
        </div>
        {newButton}
      </div>

      {loading ? (
        <div className="p-8 flex items-center justify-center min-h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderBottomColor: primaryColor }} />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm flex items-center justify-between gap-4">
          <span>{error}</span>
          <button onClick={load} className="font-medium hover:underline">
            Retry
          </button>
        </div>
      ) : programs.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 py-16 text-center">
          <Gift className="w-12 h-12 text-gray-300 mx-auto" />
          <p className="font-semibold text-gray-900 mt-4">No reward programs yet</p>
          <p className="text-sm text-gray-500 mt-1">Create a loyalty card that matches the paper cards your stores hand out.</p>
          {canWrite && <div className="mt-5 flex justify-center">{newButton}</div>}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger className="w-44 h-9 text-sm" aria-label="Brand">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All brands</SelectItem>
                {brands.map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-44 h-9 text-sm" aria-label="Type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All types</SelectItem>
                {availableTypes.map(t => (
                  <SelectItem key={t.type} value={t.type}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44 h-9 text-sm" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {(Object.keys(STATUS_LABELS) as RewardProgramStatus[]).map(s => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search programs"
                aria-label="Search programs"
                className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm w-64 outline-none focus:ring-2 focus:border-transparent"
                style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
              />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Program</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Brand</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stores</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Updated</th>
                  <th className="px-6 py-3" aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500">
                      No programs match these filters.{' '}
                      {filtersActive && (
                        <button onClick={clearFilters} className="font-medium hover:underline" style={{ color: primaryColor }}>
                          Clear filters
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  visible.map(p => {
                    const meta = getRewardType(p.type);
                    const Icon = meta?.icon;
                    const brand = brandById.get(p.brandId);
                    const canActivate = p.status === 'DRAFT' || p.status === 'PAUSED';
                    return (
                      <tr
                        key={p.id}
                        onClick={() => router.push(`/rewards/${p.id}`)}
                        className={`hover:bg-gray-50 cursor-pointer ${busyId === p.id ? 'opacity-60' : ''}`}
                      >
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-gray-900">{p.name}</p>
                          <p className="text-xs text-gray-400">{meta?.summarize(p.config) || p.summary}</p>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">{brand?.name ?? '—'}</td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            {Icon && <Icon className="w-4 h-4 text-gray-400" />}
                            {meta?.label ?? p.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={p.status} startsAt={p.startsAt} endsAt={p.endsAt} />
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">
                          <span className="inline-flex items-center gap-2">
                            {p.storeCount}
                            {brand?.storeCount !== undefined ? ` of ${brand.storeCount}` : ''}
                            {p.storeCount === 0 && p.status === 'ACTIVE' && <NotLiveBadge />}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">{formatShortDate(p.updatedAt)}</td>
                        <td className="px-6 py-4 text-right" onClick={e => e.stopPropagation()}>
                          {canWrite && p.status !== 'ARCHIVED' ? (
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
                                  <button role="menuitem" onClick={() => duplicate(p)} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                                    Duplicate
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
                          ) : canWrite ? (
                            <button
                              onClick={() => duplicate(p)}
                              disabled={busyId === p.id}
                              className="text-xs font-medium text-gray-500 hover:text-gray-800"
                            >
                              Duplicate
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showNew && (
        <NewProgramModal
          brands={brands}
          defaultBrandId={brandFilter !== ALL ? brandFilter : undefined}
          primaryColor={primaryColor}
          onClose={() => setShowNew(false)}
          onNext={startNew}
        />
      )}
    </div>
  );
}
