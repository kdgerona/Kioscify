'use client';

import { useEffect, useRef, useState } from 'react';
import { Circle, Cloud, Plus, Stamp, Trash2 } from 'lucide-react';
import type { LoyaltyCardSlot, SlotErrors, StampMode } from './types';
import { SlotTile } from './SlotTile';
import { MAX_ROWS, MAX_SLOTS_PER_ROW, countKinds, isOnePerVisit, slotsByRow, stampOrdinals } from './loyalty-card';

interface Props {
  slots: LoyaltyCardSlot[];
  /** Rows to draw (≥ rows used by slots), so a freshly added empty row shows. */
  rowCount: number;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onAddSlot: (row: number, kind: LoyaltyCardSlot['kind']) => void;
  onAddRow: () => void;
  onDeleteRow: (row: number) => void;
  onStart: (template: 'starter' | 'blank') => void;
  /** Enter on a tile: move focus to the editor panel. */
  onFocusPanel?: () => void;
  readOnly?: boolean;
  errors?: SlotErrors;
  primaryColor: string;
  stampMode?: StampMode;
}

export function CardCanvas({
  slots,
  rowCount,
  selectedKey,
  onSelect,
  onAddSlot,
  onAddRow,
  onDeleteRow,
  onStart,
  onFocusPanel,
  readOnly,
  errors = {},
  primaryColor,
  stampMode,
}: Props) {
  const grouped = slotsByRow(slots);
  const ordinals = isOnePerVisit(stampMode) ? stampOrdinals(slots) : null;
  const rows = Array.from({ length: Math.max(rowCount, grouped.length) }, (_, i) => grouped[i] ?? []);
  const [menuRow, setMenuRow] = useState<number | null>(null);
  const tileRefs = useRef(new Map<string, HTMLButtonElement>());
  const menuRef = useRef<HTMLDivElement>(null);
  const { stamps, milestones } = countKinds(slots);

  useEffect(() => {
    if (menuRow === null) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuRow(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuRow]);

  const focusSlot = (slot: LoyaltyCardSlot | undefined) => {
    if (!slot) return;
    onSelect(slot.key);
    tileRefs.current.get(slot.key)?.focus();
  };

  const onTileKey = (slot: LoyaltyCardSlot) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const row = rows[slot.row] ?? [];
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        focusSlot(row[slot.position + 1]);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        focusSlot(row[slot.position - 1]);
        break;
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        for (let r = slot.row + step; r >= 0 && r < rows.length; r += step) {
          if (rows[r].length) {
            focusSlot(rows[r][Math.min(slot.position, rows[r].length - 1)]);
            break;
          }
        }
        break;
      }
      case 'Enter':
        if (selectedKey === slot.key && onFocusPanel) {
          e.preventDefault();
          onFocusPanel();
        }
        break;
    }
  };

  if (slots.length === 0 && rows.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="py-12 text-center">
          <Stamp className="w-10 h-10 text-gray-300 mx-auto" />
          <p className="font-semibold text-gray-900 mt-3">{readOnly ? 'This card has no slots yet' : 'Design your card'}</p>
          {!readOnly && (
            <>
              <p className="text-sm text-gray-500 mt-1">Add stamp circles and milestone rewards in rows, just like the printed card.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={() => onStart('starter')}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-black hover:brightness-90"
                  style={{ backgroundColor: primaryColor }}
                >
                  Start with 3 rows of 4 stamps + a reward
                </button>
                <button
                  type="button"
                  onClick={() => onStart('blank')}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Start blank
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="rounded-2xl p-5 space-y-4" style={{ backgroundColor: `${primaryColor}14` }}>
        {rows.map((row, rowIndex) => {
          const full = row.length >= MAX_SLOTS_PER_ROW;
          const isLast = rowIndex === rows.length - 1;
          return (
            <div key={rowIndex} className="group flex items-center gap-3">
              <div className="w-14 shrink-0 flex items-center gap-1">
                <span className="text-xs font-medium text-gray-500">Row {rowIndex + 1}</span>
                {!readOnly && (row.length === 0 || isLast) && rows.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Delete row ${rowIndex + 1}`}
                    title="Delete row"
                    onClick={() => onDeleteRow(rowIndex)}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-gray-300 hover:text-red-600 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3 overflow-x-auto p-2 -m-2 pb-3">
                {row.map(slot => (
                  <SlotTile
                    key={slot.key}
                    ref={el => {
                      if (el) tileRefs.current.set(slot.key, el);
                      else tileRefs.current.delete(slot.key);
                    }}
                    slot={slot}
                    selected={slot.key === selectedKey}
                    hasError={!!errors[slot.key]}
                    primaryColor={primaryColor}
                    stampHint={ordinals && slot.kind === 'STAMP' ? `Visit ${ordinals.get(slot.key)}` : undefined}
                    onClick={() => onSelect(slot.key)}
                    onKeyDown={onTileKey(slot)}
                  />
                ))}
                {row.length === 0 && readOnly && <span className="text-xs text-gray-400 italic">Empty row</span>}
              </div>
              {!readOnly && (
                <div className="relative shrink-0" ref={menuRow === rowIndex ? menuRef : undefined}>
                  <button
                    type="button"
                    disabled={full}
                    title={full ? `A row holds up to ${MAX_SLOTS_PER_ROW} slots` : 'Add a slot'}
                    aria-label={`Add a slot to row ${rowIndex + 1}`}
                    aria-haspopup="menu"
                    aria-expanded={menuRow === rowIndex}
                    onClick={() => setMenuRow(menuRow === rowIndex ? null : rowIndex)}
                    className="w-12 h-12 shrink-0 rounded-full border-2 border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                  {menuRow === rowIndex && (
                    <div role="menu" className="absolute z-20 right-0 mt-1 w-48 bg-white rounded-lg border border-gray-200 shadow-lg py-1">
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          setMenuRow(null);
                          onAddSlot(rowIndex, 'STAMP');
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Circle className="w-4 h-4 text-gray-400" /> Stamp circle
                      </button>
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          setMenuRow(null);
                          onAddSlot(rowIndex, 'MILESTONE');
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Cloud className="w-4 h-4 text-gray-400" /> Milestone reward
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!readOnly && (
          <button
            type="button"
            onClick={onAddRow}
            disabled={rows.length >= MAX_ROWS}
            title={rows.length >= MAX_ROWS ? `A card holds up to ${MAX_ROWS} rows` : undefined}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-dashed border-gray-300 text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" /> Add row
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-3">
        {stamps} stamp{stamps === 1 ? '' : 's'} · {milestones} milestone{milestones === 1 ? '' : 's'}
      </p>
    </div>
  );
}
