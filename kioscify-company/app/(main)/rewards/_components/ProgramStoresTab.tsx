'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import type { Store } from '@/types';
import type { RewardProgram } from '@/components/rewards/types';
import { BuilderSaveBar } from '@/components/rewards/BuilderSaveBar';
import { STATUS_LABELS } from '@/components/rewards/badges';
import { rewardErrorText } from './lib';

interface Props {
  program: RewardProgram;
  stores: Store[];
  loading: boolean;
  canWrite: boolean;
  primaryColor: string;
  onSaved: (program: RewardProgram) => void;
}

export function ProgramStoresTab({ program, stores, loading, canWrite, primaryColor, onSaved }: Props) {
  const initial = useMemo(() => new Set(program.storeIds ?? []), [program.storeIds]);
  const [selected, setSelected] = useState<Set<string>>(initial);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const headerBox = useRef<HTMLInputElement>(null);

  useEffect(() => setSelected(new Set(initial)), [initial]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? stores.filter(s => s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q)) : stores;
  }, [stores, query]);

  const changes = useMemo(() => {
    let n = 0;
    for (const id of selected) if (!initial.has(id)) n++;
    for (const id of initial) if (!selected.has(id)) n++;
    return n;
  }, [selected, initial]);

  const filteredChecked = filtered.filter(s => selected.has(s.id)).length;
  const allChecked = filtered.length > 0 && filteredChecked === filtered.length;
  const someChecked = filteredChecked > 0 && !allChecked;

  useEffect(() => {
    if (headerBox.current) headerBox.current.indeterminate = someChecked;
  }, [someChecked]);

  const toggle = (id: string) => {
    if (!canWrite) return;
    setServerError(null);
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setFiltered = (on: boolean) => {
    setServerError(null);
    setSelected(prev => {
      const next = new Set(prev);
      filtered.forEach(s => (on ? next.add(s.id) : next.delete(s.id)));
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setServerError(null);
    try {
      const updated = await api.setRewardProgramStores(program.id, Array.from(selected));
      onSaved(updated);
      toast.success('Stores updated.');
    } catch (err) {
      setServerError(rewardErrorText(err, 'Failed to update stores'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2" style={{ borderBottomColor: primaryColor }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Choose which stores run this program. Stores not checked won&apos;t see it on the kiosk.</p>

      {program.status !== 'ACTIVE' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 rounded-lg">
          This program is {STATUS_LABELS[program.status]}. Enrolled stores will see it once you activate it.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search stores"
            aria-label="Search stores"
            className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm w-64 outline-none focus:ring-2 focus:border-transparent"
            style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
          />
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-500 tabular-nums">
            {selected.size} of {stores.length} selected
          </span>
          {canWrite && stores.length > 0 && (
            <button type="button" onClick={() => setFiltered(!allChecked)} className="font-medium" style={{ color: primaryColor }}>
              {allChecked ? 'Clear' : 'Select all'}
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 w-12">
                <input
                  ref={headerBox}
                  type="checkbox"
                  aria-label="Select all shown stores"
                  checked={allChecked}
                  disabled={!canWrite || filtered.length === 0}
                  onChange={() => setFiltered(!allChecked)}
                  className="w-4 h-4 rounded border-gray-300"
                  style={{ accentColor: primaryColor }}
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Store name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Slug</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {stores.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-sm text-gray-400">
                  This brand has no stores yet.
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-sm text-gray-400">
                  No stores match “{query}”.
                </td>
              </tr>
            ) : (
              filtered.map(s => (
                <tr
                  key={s.id}
                  onClick={() => toggle(s.id)}
                  className={`${canWrite ? 'cursor-pointer hover:bg-gray-50' : ''} ${s.isActive ? '' : 'text-gray-400'}`}
                >
                  <td className="px-6 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Enroll ${s.name}`}
                      checked={selected.has(s.id)}
                      disabled={!canWrite}
                      onChange={() => toggle(s.id)}
                      onClick={e => e.stopPropagation()}
                      className="w-4 h-4 rounded border-gray-300"
                      style={{ accentColor: primaryColor }}
                    />
                  </td>
                  <td className={`px-6 py-3 text-sm font-medium ${s.isActive ? 'text-gray-900' : 'text-gray-400'}`}>{s.name}</td>
                  <td className="px-6 py-3 text-sm text-gray-500 font-mono">{s.slug}</td>
                  <td className="px-6 py-3 text-sm">{s.isActive ? <span className="text-gray-700">Active</span> : <span className="text-gray-400">Suspended</span>}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {canWrite && (
        <BuilderSaveBar
          dirty={changes > 0}
          saving={saving}
          issueCount={0}
          onSave={save}
          onDiscard={() => {
            setSelected(new Set(initial));
            setServerError(null);
          }}
          onJumpToIssue={() => {}}
          primaryColor={primaryColor}
          serverError={serverError}
          saveLabel="Save stores"
          statusText={`${changes} unsaved change${changes === 1 ? '' : 's'}`}
        />
      )}
    </div>
  );
}
