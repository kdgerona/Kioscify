'use client';

import { useMemo, useRef, useState } from 'react';
import type { LoyaltyCardConfig, LoyaltyCardSlot, RewardCatalog, SlotErrors, StampMode } from './types';
import { CardCanvas } from './CardCanvas';
import { SlotEditorPanel } from './SlotEditorPanel';
import { MAX_SLOTS_PER_ROW, STAMP_MODE_OPTIONS, blankSlot, normalizeSlots, slotsByRow, starterCard } from './loyalty-card';

export interface LoyaltyCardBuilderProps {
  config: LoyaltyCardConfig;
  onChange: (config: LoyaltyCardConfig) => void;
  catalog: RewardCatalog;
  readOnly?: boolean;
  errors?: SlotErrors;
  primaryColor: string;
  /** Optional control of the selected slot (e.g. "jump to issue"). Uncontrolled when omitted. */
  selectedKey?: string | null;
  onSelectedKeyChange?: (key: string | null) => void;
  /** Shows the "This card is live" banner (ACTIVE program with events). */
  live?: boolean;
  /** Read-only banner: "Managed by {managedBy}…". Shown only when readOnly. */
  managedBy?: string;
  /** Skeleton while the program/catalog loads. */
  loading?: boolean;
}

/**
 * Loyalty card designer: a canvas of stamp circles and milestone clouds plus
 * an editor panel for the selected slot. Self-contained (no app/ or lib/
 * imports) so it can be copied verbatim between portals.
 */
export function LoyaltyCardBuilder({
  config,
  onChange,
  catalog,
  readOnly,
  errors = {},
  primaryColor,
  selectedKey: controlledKey,
  onSelectedKeyChange,
  live,
  managedBy,
  loading,
}: LoyaltyCardBuilderProps) {
  const [ownKey, setOwnKey] = useState<string | null>(null);
  const selectedKey = controlledKey !== undefined ? controlledKey : ownKey;
  const select = (key: string | null) => {
    setOwnKey(key);
    onSelectedKeyChange?.(key);
  };

  const slots = config.slots;
  const usedRows = useMemo(() => slots.reduce((m, s) => Math.max(m, s.row + 1), 0), [slots]);
  const [rowState, setRowState] = useState(usedRows);
  const rowCount = Math.max(rowState, usedRows);
  const panelRef = useRef<HTMLDivElement>(null);

  const selected = slots.find(s => s.key === selectedKey) ?? null;
  const rows = slotsByRow(slots);
  const rowSlots = selected ? (rows[selected.row] ?? []) : [];

  const commit = (next: LoyaltyCardSlot[], keepRows = rowCount) => {
    onChange({ ...config, slots: normalizeSlots(next, keepRows) });
  };

  const addSlot = (row: number, kind: LoyaltyCardSlot['kind']) => {
    const inRow = slots.filter(s => s.row === row).length;
    if (inRow >= MAX_SLOTS_PER_ROW) return;
    const slot = blankSlot(kind, row, inRow, slots.map(s => s.key));
    commit([...slots, slot]);
    select(slot.key);
  };

  const addRow = () => setRowState(rowCount + 1);

  const deleteRow = (row: number) => {
    const inRow = slots.filter(s => s.row === row);
    if (inRow.length && !confirm(`Delete row ${row + 1} and its ${inRow.length} slot${inRow.length === 1 ? '' : 's'}?`)) return;
    const next = slots.filter(s => s.row !== row).map(s => (s.row > row ? { ...s, row: s.row - 1 } : s));
    if (selected?.row === row) select(null);
    setRowState(rowCount - 1);
    commit(next, rowCount - 1);
  };

  const start = (template: 'starter' | 'blank') => {
    if (template === 'starter') {
      const card = starterCard();
      setRowState(3);
      onChange({ ...config, slots: card.slots });
      select(card.slots[0]?.key ?? null);
    } else {
      const slot = blankSlot('STAMP', 0, 0, []);
      setRowState(1);
      onChange({ ...config, slots: [slot] });
      select(slot.key);
    }
  };

  const stampMode: StampMode = config.stampMode ?? 'MATCH_CONDITIONS';
  // Conditions stay in state when switching, so switching back restores them.
  const setStampMode = (mode: StampMode) => onChange({ ...config, stampMode: mode });

  const updateSlot = (slot: LoyaltyCardSlot) => commit(slots.map(s => (s.key === slot.key ? slot : s)));

  const move = (dir: -1 | 1) => {
    if (!selected) return;
    const swap = rowSlots[selected.position + dir];
    if (!swap) return;
    commit(
      slots.map(s =>
        s.key === selected.key ? { ...s, position: swap.position } : s.key === swap.key ? { ...s, position: selected.position } : s,
      ),
    );
  };

  const moveToRow = (row: number) => {
    if (!selected || row === selected.row) return;
    const inTarget = slots.filter(s => s.row === row).length;
    if (inTarget >= MAX_SLOTS_PER_ROW) {
      alert(`A row holds up to ${MAX_SLOTS_PER_ROW} slots`);
      return;
    }
    commit(slots.map(s => (s.key === selected.key ? { ...s, row, position: inTarget } : s)));
  };

  const remove = () => {
    if (!selected) return;
    commit(slots.filter(s => s.key !== selected.key));
    select(null);
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="bg-white rounded-lg border border-gray-200 p-6 animate-pulse space-y-4">
          {[0, 1, 2].map(r => (
            <div key={r} className="flex items-center gap-3">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="w-24 h-24 rounded-full bg-gray-200 shrink-0" />
              ))}
              <div className="w-44 h-24 rounded-[2.5rem] bg-gray-200 shrink-0" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-lg border border-gray-200 h-64 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {readOnly && managedBy && (
        <div className="bg-violet-50 border border-violet-200 text-violet-800 text-sm p-3 rounded-lg">
          Managed by {managedBy}. Contact your company admin to change this program.
        </div>
      )}
      {!readOnly && live && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm p-3 rounded-lg">
          This card is live. Changes apply to new sales only; past stamps and redemptions keep their original labels.
        </div>
      )}
      <fieldset className="bg-white rounded-lg border border-gray-200 p-4">
        <legend className="px-1 text-sm font-medium text-gray-700">How are stamps earned?</legend>
        {readOnly ? (
          <p className="text-sm text-gray-900">
            {STAMP_MODE_OPTIONS.find(o => o.value === stampMode)?.label}
            <span className="block text-xs text-gray-500 mt-0.5">{STAMP_MODE_OPTIONS.find(o => o.value === stampMode)?.description}</span>
          </p>
        ) : (
          <div role="radiogroup" aria-label="How are stamps earned?" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {STAMP_MODE_OPTIONS.map(o => {
              const active = stampMode === o.value;
              return (
                <label
                  key={o.value}
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer text-sm ${active ? 'bg-gray-50' : 'border-gray-200 hover:border-gray-300'}`}
                  style={active ? { borderColor: primaryColor } : undefined}
                >
                  <input
                    type="radio"
                    name="stamp-mode"
                    value={o.value}
                    checked={active}
                    onChange={() => setStampMode(o.value)}
                    className="mt-1"
                    style={{ accentColor: primaryColor }}
                  />
                  <span>
                    <span className="block font-medium text-gray-900">{o.label}</span>
                    <span className="block text-xs text-gray-500 mt-0.5">{o.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </fieldset>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
        <CardCanvas
          slots={slots}
          rowCount={rowCount}
          selectedKey={selectedKey}
          onSelect={select}
          onAddSlot={addSlot}
          onAddRow={addRow}
          onDeleteRow={deleteRow}
          onStart={start}
          onFocusPanel={() => panelRef.current?.focus()}
          readOnly={readOnly}
          errors={errors}
          primaryColor={primaryColor}
          stampMode={stampMode}
        />
        <SlotEditorPanel
          ref={panelRef}
          slot={selected}
          rowSlots={rowSlots}
          rowCount={rowCount}
          catalog={catalog}
          onChange={updateSlot}
          onMove={move}
          onMoveToRow={moveToRow}
          onDelete={remove}
          readOnly={readOnly}
          errors={selected ? errors[selected.key] : undefined}
          primaryColor={primaryColor}
          stampMode={stampMode}
        />
      </div>
    </div>
  );
}
