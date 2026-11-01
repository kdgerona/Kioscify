'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronLeft, Pause, Play } from 'lucide-react';
import { api } from '@/lib/api';
import { hasPrivilege } from '@/lib/privileges';
import { useCompany } from '@/contexts/CompanyContext';
import type { Brand, Store } from '@/types';
import type {
  LoyaltyCardConfig,
  ProgramHeaderErrors,
  ProgramHeaderValue,
  RewardCatalog,
  RewardProgram,
  RewardProgramStatus,
  RewardProgramType,
  SlotErrors,
  UpdateRewardProgramPayload,
} from '@/components/rewards/types';
import { LoyaltyCardBuilder } from '@/components/rewards/LoyaltyCardBuilder';
import { ProgramHeaderForm } from '@/components/rewards/ProgramHeaderForm';
import { BuilderSaveBar } from '@/components/rewards/BuilderSaveBar';
import { StatusBadge } from '@/components/rewards/badges';
import { getRewardType } from '@/components/rewards/registry';
import {
  asLoyaltyConfig,
  countKinds,
  dateInputToIso,
  formatShortDate,
  isoToDateInput,
  toApiConfig,
  validateLoyaltyConfig,
  validateProgramHeader,
} from '@/components/rewards/loyalty-card';
import { loadRewardCatalog, rewardErrorText } from '../_components/lib';
import { ProgramStoresTab } from '../_components/ProgramStoresTab';
import { ProgramActivityTab } from '../_components/ProgramActivityTab';

type Tab = 'card' | 'stores' | 'activity';
const TABS: Tab[] = ['card', 'stores', 'activity'];
const EMPTY_CATALOG: RewardCatalog = { productNames: [], categoryNames: [], sizeNames: [] };

function headerFrom(p: Pick<RewardProgram, 'name' | 'description' | 'status' | 'startsAt' | 'endsAt'>): ProgramHeaderValue {
  return {
    name: p.name,
    description: p.description ?? '',
    status: p.status,
    startsAt: isoToDateInput(p.startsAt),
    endsAt: isoToDateInput(p.endsAt),
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export default function RewardProgramPage() {
  return (
    <Suspense fallback={null}>
      <RewardProgramPageContent />
    </Suspense>
  );
}

function RewardProgramPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const programId = params.programId as string;
  const isNew = programId === 'new';
  const { company } = useCompany();
  const primaryColor = company?.themeColors?.primary ?? '#ea580c';
  const canWrite = hasPrivilege('rewards', 'write');

  // New programs aren't persisted until the first save: the API validates the
  // full card config on create, so an empty draft can't exist server-side.
  const newType = (searchParams.get('type') as RewardProgramType | null) ?? 'LOYALTY_CARD';
  const newBrandId = searchParams.get('brandId') ?? '';

  const [program, setProgram] = useState<RewardProgram | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [catalog, setCatalog] = useState<RewardCatalog>(EMPTY_CATALOG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventCount, setEventCount] = useState(0);

  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get('tab') as Tab | null;
    return t && TABS.includes(t) ? t : 'card';
  });

  // Card-tab drafts and their saved baselines.
  const [header, setHeader] = useState<ProgramHeaderValue>({ name: '', description: '', status: 'DRAFT', startsAt: '', endsAt: '' });
  const [savedHeader, setSavedHeader] = useState<ProgramHeaderValue>(header);
  const [config, setConfig] = useState<LoyaltyCardConfig>({ slots: [] });
  const [savedConfig, setSavedConfig] = useState<LoyaltyCardConfig>({ slots: [] });
  const [builderKey, setBuilderKey] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [quickBusy, setQuickBusy] = useState(false);

  useEffect(() => {
    if (!hasPrivilege('rewards', 'read')) router.replace('/dashboard');
    else if (isNew && !canWrite) router.replace('/rewards');
  }, [router, isNew, canWrite]);

  const applyProgram = useCallback((p: RewardProgram) => {
    const h = headerFrom(p);
    const c = asLoyaltyConfig(p.config);
    setProgram(p);
    setHeader(h);
    setSavedHeader(h);
    setConfig(c);
    setSavedConfig(c);
    setTouched(new Set());
    setAttempted(false);
    setServerError(null);
  }, []);

  // Load program (or the new-program seed), brand, catalog and stores.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        let brandId = newBrandId;
        if (isNew) {
          const h: ProgramHeaderValue = {
            name: searchParams.get('name') ?? '',
            description: searchParams.get('description') ?? '',
            status: 'DRAFT',
            startsAt: '',
            endsAt: '',
          };
          setProgram(null);
          setHeader(h);
          setSavedHeader({ ...h, name: '' }); // dirty from the start: nothing is saved yet
          setConfig({ slots: [] });
          setSavedConfig({ slots: [] });
          setTab('card');
          if (!brandId) throw new Error('Choose a brand first.');
        } else {
          const p = await api.getRewardProgram(programId);
          if (cancelled) return;
          applyProgram(p);
          brandId = p.brandId;
          api
            .getRewardSummary({ programId })
            .then(s => !cancelled && setEventCount(s.totalEvents))
            .catch(() => {});
        }
        const b = await api.getBrandById(brandId);
        if (cancelled) return;
        setBrand(b);
        setLoading(false);
        loadRewardCatalog(brandId).then(c => !cancelled && setCatalog(c));
        if (!isNew) {
          setStoresLoading(true);
          api
            .getStores(brandId)
            .then(s => !cancelled && setStores(s))
            .catch(() => !cancelled && setStores([]))
            .finally(() => !cancelled && setStoresLoading(false));
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error && !('response' in err) ? err.message : rewardErrorText(err, 'Failed to load program'));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // searchParams is read once per program; tab changes must not reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId, isNew, applyProgram]);

  const changeTab = (t: Tab) => {
    setTab(t);
    const next = new URLSearchParams(searchParams.toString());
    next.set('tab', t);
    router.replace(`/rewards/${programId}?${next.toString()}`, { scroll: false });
  };

  const readOnly = !canWrite || (!!program && !program.editable);
  const configDirty = !same(config, savedConfig);
  const headerDirty = !same(header, savedHeader);
  const dirty = !readOnly && (configDirty || headerDirty);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // Validation. The API validates the whole config on every save that sends
  // it (DRAFT included), so the card must be complete whenever it changed.
  const headerErrors: ProgramHeaderErrors = useMemo(() => validateProgramHeader(header, config), [header, config]);
  const slotErrors: SlotErrors = useMemo(() => validateLoyaltyConfig(config), [config]);
  const configMustBeValid = isNew || configDirty;
  const emptyCardError = configMustBeValid && config.slots.length === 0 ? 'Add at least one slot to the card.' : null;
  const issueCount =
    Object.keys(headerErrors).length + (configMustBeValid ? Object.keys(slotErrors).length : 0) + (emptyCardError ? 1 : 0);
  const shownSlotErrors = useMemo(() => {
    if (attempted) return slotErrors;
    return Object.fromEntries(Object.entries(slotErrors).filter(([k]) => touched.has(k)));
  }, [attempted, slotErrors, touched]);

  const onSelectSlot = (key: string | null) => {
    if (selectedKey && selectedKey !== key) setTouched(prev => new Set(prev).add(selectedKey));
    setSelectedKey(key);
  };

  const jumpToIssue = () => {
    setAttempted(true);
    const order = [...config.slots].sort((a, b) => a.row - b.row || a.position - b.position);
    const first = order.find(s => slotErrors[s.key]);
    if (configMustBeValid && first) {
      setSelectedKey(first.key);
      return;
    }
    const field = headerErrors.name ? 'program-name' : headerErrors.status ? 'program-status' : headerErrors.endsAt ? 'program-ends' : null;
    if (field) document.getElementById(field)?.focus();
  };

  const discard = () => {
    if (isNew) {
      router.push('/rewards');
      return;
    }
    setHeader(savedHeader);
    setConfig(savedConfig);
    setSelectedKey(null);
    setTouched(new Set());
    setAttempted(false);
    setServerError(null);
    setBuilderKey(k => k + 1);
  };

  const save = async () => {
    setAttempted(true);
    setServerError(null);
    if (issueCount > 0) {
      if (emptyCardError && !Object.keys(headerErrors).length) setServerError(emptyCardError);
      jumpToIssue();
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const created = await api.createRewardProgram({
          name: header.name.trim(),
          description: header.description.trim() || undefined,
          type: newType,
          status: 'DRAFT',
          startsAt: dateInputToIso(header.startsAt, 'start') ?? undefined,
          endsAt: dateInputToIso(header.endsAt, 'end') ?? undefined,
          config: toApiConfig(config),
          brandId: newBrandId,
        });
        toast.success('Draft created');
        setSavedHeader(header);
        setSavedConfig(config);
        router.replace(`/rewards/${created.id}?tab=card`);
        return;
      }
      if (!program) return;
      const payload: UpdateRewardProgramPayload = {};
      if (header.name !== savedHeader.name) payload.name = header.name.trim();
      if (header.description !== savedHeader.description) payload.description = header.description.trim() || null;
      if (header.status !== savedHeader.status) payload.status = header.status;
      if (header.startsAt !== savedHeader.startsAt) payload.startsAt = dateInputToIso(header.startsAt, 'start');
      if (header.endsAt !== savedHeader.endsAt) payload.endsAt = dateInputToIso(header.endsAt, 'end');
      if (configDirty) payload.config = toApiConfig(config);
      const updated = await api.updateRewardProgram(program.id, payload);
      applyProgram(updated);
      setBuilderKey(k => k + 1);
      toast.success('Changes saved');
    } catch (err) {
      setServerError(rewardErrorText(err, 'Failed to save changes'));
    } finally {
      setSaving(false);
    }
  };

  const quickStatus = async (status: RewardProgramStatus) => {
    if (!program) return;
    if (status === 'ACTIVE' && countKinds(asLoyaltyConfig(program.config).slots).stamps === 0) {
      toast.error('Add at least one stamp before activating.');
      return;
    }
    setQuickBusy(true);
    try {
      applyProgram(await api.updateRewardProgram(program.id, { status }));
      toast.success(status === 'ACTIVE' ? 'Program activated' : 'Program paused');
    } catch (err) {
      toast.error(rewardErrorText(err, 'Failed to update program'));
    } finally {
      setQuickBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderBottomColor: primaryColor }} />
      </div>
    );
  }

  if (error || (!isNew && !program)) {
    return (
      <div className="p-8 space-y-4">
        <Link href="/rewards" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ChevronLeft className="w-4 h-4" /> Rewards
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm">{error || 'Program not found'}</div>
      </div>
    );
  }

  const typeMeta = getRewardType(program?.type ?? newType);
  const tabs: { id: Tab; label: string }[] = isNew
    ? [{ id: 'card', label: 'Card' }]
    : [
        { id: 'card', label: 'Card' },
        { id: 'stores', label: `Stores (${program?.storeCount ?? 0})` },
        { id: 'activity', label: 'Activity' },
      ];
  const canQuick = !readOnly && program && program.status !== 'ARCHIVED';

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/rewards" aria-label="Back to rewards" className="text-gray-400 hover:text-gray-600">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 truncate">{program?.name ?? (header.name || 'New program')}</h1>
              {program ? (
                <StatusBadge status={program.status} startsAt={program.startsAt} endsAt={program.endsAt} />
              ) : (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border bg-gray-100 text-gray-600 border-gray-200">
                  Not saved
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500">
              {brand?.name ?? '—'} · {typeMeta?.label ?? program?.type}
              {program && ` · Updated ${formatShortDate(program.updatedAt)}`}
            </p>
          </div>
        </div>
        {canQuick &&
          (program.status === 'ACTIVE' ? (
            <button
              onClick={() => quickStatus('PAUSED')}
              disabled={quickBusy || dirty}
              title={dirty ? 'Save or discard your changes first' : undefined}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              <Pause className="w-4 h-4" /> Pause
            </button>
          ) : (
            <button
              onClick={() => quickStatus('ACTIVE')}
              disabled={quickBusy || dirty}
              title={dirty ? 'Save or discard your changes first' : undefined}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-white rounded-lg text-sm font-medium hover:brightness-90 disabled:opacity-50"
              style={{ backgroundColor: primaryColor }}
            >
              <Play className="w-4 h-4" /> Activate
            </button>
          ))}
      </div>

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex gap-1 overflow-x-auto" role="tablist">
          {tabs.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => changeTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.id ? 'border-current' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              style={tab === t.id ? { color: primaryColor } : undefined}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'card' && (
        <>
          <ProgramHeaderForm
            value={header}
            onChange={v => {
              setHeader(v);
              setServerError(null);
            }}
            savedStatus={program?.status}
            readOnly={readOnly}
            errors={attempted || headerDirty ? headerErrors : {}}
            primaryColor={primaryColor}
            hideStatus={isNew}
          />
          {program?.type && program.type !== 'LOYALTY_CARD' ? (
            <div className="bg-white rounded-lg border border-gray-200 p-6 text-sm text-gray-500">This reward type can&apos;t be edited here yet.</div>
          ) : (
            <LoyaltyCardBuilder
              key={builderKey}
              config={config}
              onChange={c => {
                setConfig(c);
                setServerError(null);
              }}
              catalog={catalog}
              readOnly={readOnly}
              errors={configMustBeValid ? shownSlotErrors : {}}
              primaryColor={primaryColor}
              selectedKey={selectedKey}
              onSelectedKeyChange={onSelectSlot}
              live={program?.status === 'ACTIVE' && eventCount > 0}
            />
          )}
          {!readOnly && (
            <BuilderSaveBar
              dirty={dirty}
              saving={saving}
              issueCount={issueCount}
              onSave={save}
              onDiscard={discard}
              onJumpToIssue={jumpToIssue}
              primaryColor={primaryColor}
              serverError={serverError}
              saveLabel={isNew ? 'Create draft' : 'Save changes'}
            />
          )}
        </>
      )}

      {tab === 'stores' && program && (
        <ProgramStoresTab
          program={program}
          stores={stores}
          loading={storesLoading}
          canWrite={!readOnly}
          primaryColor={primaryColor}
          onSaved={p => {
            setProgram(prev => (prev ? { ...prev, storeIds: p.storeIds, storeCount: p.storeCount, updatedAt: p.updatedAt } : p));
          }}
        />
      )}

      {tab === 'activity' && program && (
        <ProgramActivityTab program={program} stores={stores} primaryColor={primaryColor} onGoToStores={() => changeTab('stores')} />
      )}
    </div>
  );
}
