'use client';

import { forwardRef, useEffect, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import type { LoyaltyCardSlot, MilestoneReward, RewardCatalog, SlotFieldErrors, StampCondition, StampMode } from './types';
import { NamePicker } from './NamePicker';
import {
  CONDITION_OPTIONS,
  MAX_SLOT_LABEL,
  REWARD_OPTIONS,
  defaultCondition,
  defaultReward,
  isOnePerVisit,
  peso,
  rewardPreview,
} from './loyalty-card';

interface Props {
  slot: LoyaltyCardSlot | null;
  /** Slots in the selected slot's row, in order. */
  rowSlots: LoyaltyCardSlot[];
  rowCount: number;
  catalog: RewardCatalog;
  onChange: (slot: LoyaltyCardSlot) => void;
  onMove: (dir: -1 | 1) => void;
  onMoveToRow: (row: number) => void;
  onDelete: () => void;
  readOnly?: boolean;
  errors?: SlotFieldErrors;
  primaryColor: string;
  stampMode?: StampMode;
}

const INPUT =
  'w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:border-transparent outline-none bg-white';

/** Number field that keeps the typed text (so "49." isn't eaten) and reports a number (0 when blank). */
function NumberInput({
  value,
  onChange,
  step,
  min,
  max,
  invalid,
  ariaLabel,
  ringColor,
}: {
  value: number;
  onChange: (n: number) => void;
  step: string;
  min?: number;
  max?: number;
  invalid?: boolean;
  ariaLabel: string;
  ringColor: string;
}) {
  const [text, setText] = useState(value ? String(value) : '');
  useEffect(() => {
    if ((parseFloat(text) || 0) !== value) setText(value ? String(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={text}
      step={step}
      min={min}
      max={max}
      onChange={e => {
        setText(e.target.value);
        onChange(parseFloat(e.target.value) || 0);
      }}
      className={`${INPUT} ${invalid ? 'border-red-400' : 'border-gray-300'}`}
      style={{ '--tw-ring-color': ringColor } as React.CSSProperties}
    />
  );
}

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="text-xs text-red-600 mt-1">{msg}</p> : null;
}

function conditionText(c?: StampCondition): string {
  if (!c) return 'Not set';
  switch (c.type) {
    case 'ITEM_MIN_PRICE':
      return `Base price of ${peso(c.minPrice)} or more${c.categoryNames?.length ? ` in ${c.categoryNames.join(', ')}` : ''}`;
    case 'ITEM_PRODUCT_NAMES':
      return `Buys ${c.names.join(', ') || '—'}`;
    case 'ITEM_CATEGORY_NAMES':
      return `Buys from ${c.names.join(', ') || '—'}`;
    case 'TRANSACTION_MIN_TOTAL':
      return `Order total of ${peso(c.minTotal)} or more`;
  }
}

export const SlotEditorPanel = forwardRef<HTMLDivElement, Props>(function SlotEditorPanel(
  { slot, rowSlots, rowCount, catalog, onChange, onMove, onMoveToRow, onDelete, readOnly, errors = {}, primaryColor, stampMode },
  ref,
) {
  const [confirmKind, setConfirmKind] = useState<LoyaltyCardSlot['kind'] | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const ring = { '--tw-ring-color': primaryColor } as React.CSSProperties;

  useEffect(() => {
    setConfirmKind(null);
    setFiltersOpen(!!(slot?.reward?.categoryNames?.length || slot?.reward?.sizeNames?.length));
    // Reset per slot only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot?.key]);

  const shell = (title: React.ReactNode, body: React.ReactNode) => (
    <div ref={ref} tabIndex={-1} className="bg-white rounded-lg border border-gray-200 lg:sticky lg:top-6 outline-none focus:ring-2" style={ring}>
      <div className="px-5 py-4 border-b flex items-center justify-between gap-2">{title}</div>
      <div className="p-5 space-y-4">{body}</div>
    </div>
  );

  if (!slot) {
    return shell(
      <h3 className="font-semibold text-gray-900 text-sm">Slot</h3>,
      <p className="text-sm text-gray-400 text-center py-10">Select a stamp or reward to edit it.</p>,
    );
  }

  const isStamp = slot.kind === 'STAMP';
  const onePerVisit = isOnePerVisit(stampMode);
  const kindBadge = (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
      {isStamp ? 'Stamp' : 'Milestone'}
    </span>
  );
  const title = (
    <>
      <h3 className="font-semibold text-gray-900 text-sm">
        Slot {slot.position + 1} · Row {slot.row + 1}
      </h3>
      {kindBadge}
    </>
  );

  // ─── Read-only definition ───────────────────────────────────────────────
  if (readOnly) {
    const r = slot.reward;
    return shell(
      title,
      <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
        <dt className="text-gray-500">Label</dt>
        <dd className="text-gray-900">{slot.label || '—'}</dd>
        {isStamp ? (
          <>
            <dt className="text-gray-500">Stamp when</dt>
            <dd className="text-gray-900">{onePerVisit ? 'Any purchase (one stamp per visit)' : conditionText(slot.condition)}</dd>
          </>
        ) : (
          <>
            <dt className="text-gray-500">Reward</dt>
            <dd className="text-gray-900">{rewardPreview(r) || 'Not set'}</dd>
            {!!r?.categoryNames?.length && (
              <>
                <dt className="text-gray-500">Categories</dt>
                <dd className="text-gray-900">{r.categoryNames.join(', ')}</dd>
              </>
            )}
            {!!r?.sizeNames?.length && (
              <>
                <dt className="text-gray-500">Sizes</dt>
                <dd className="text-gray-900">{r.sizeNames.join(', ')}</dd>
              </>
            )}
          </>
        )}
      </dl>,
    );
  }

  // ─── Editable ───────────────────────────────────────────────────────────
  const switchKind = (kind: LoyaltyCardSlot['kind']) => {
    if (kind === slot.kind) return;
    if ((slot.condition || slot.reward) && confirmKind !== kind) {
      setConfirmKind(kind);
      return;
    }
    setConfirmKind(null);
    onChange({ ...slot, kind, condition: undefined, reward: undefined });
  };

  const setCondition = (condition: StampCondition) => onChange({ ...slot, condition });
  const setReward = (reward: MilestoneReward) => onChange({ ...slot, reward });
  const c = slot.condition;
  const r = slot.reward;

  return shell(
    title,
    <>
      {/* Type */}
      <div>
        <p className="block text-sm font-medium text-gray-700 mb-1">Type</p>
        <div role="radiogroup" aria-label="Slot type" className="inline-flex rounded-lg border border-gray-200 p-0.5">
          {(['STAMP', 'MILESTONE'] as const).map(k => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={slot.kind === k}
              onClick={() => switchKind(k)}
              className={`px-3 py-1.5 text-sm rounded-md ${slot.kind === k ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {k === 'STAMP' ? 'Stamp' : 'Milestone'}
            </button>
          ))}
        </div>
        {confirmKind && (
          <div className="mt-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-2 flex items-center justify-between gap-2">
            <span>Switching type clears this slot&apos;s {isStamp ? 'condition' : 'reward'}. Continue?</span>
            <span className="flex gap-2 shrink-0">
              <button type="button" className="font-medium hover:underline" onClick={() => switchKind(confirmKind)}>
                Switch
              </button>
              <button type="button" className="hover:underline" onClick={() => setConfirmKind(null)}>
                Cancel
              </button>
            </span>
          </div>
        )}
      </div>

      {/* Label */}
      <div>
        <label htmlFor={`label-${slot.key}`} className="block text-sm font-medium text-gray-700 mb-1">
          Label<span className="text-red-500">*</span>
        </label>
        <input
          id={`label-${slot.key}`}
          value={slot.label}
          maxLength={MAX_SLOT_LABEL}
          onChange={e => onChange({ ...slot, label: e.target.value })}
          placeholder={isStamp ? 'e.g. Any drink ₱49+' : 'e.g. 50% off 1 item'}
          className={`${INPUT} ${errors.label ? 'border-red-400' : 'border-gray-300'}`}
          style={ring}
        />
        {errors.label ? <FieldError msg={errors.label} /> : <p className="text-xs text-gray-400 mt-1">Printed text on the card, shown to cashiers.</p>}
      </div>

      {isStamp && onePerVisit ? null : isStamp ? (
        <>
          <div>
            <label htmlFor={`cond-${slot.key}`} className="block text-sm font-medium text-gray-700 mb-1">
              Stamp when…
            </label>
            <select
              id={`cond-${slot.key}`}
              value={c?.type ?? ''}
              onChange={e => setCondition(defaultCondition(e.target.value as StampCondition['type']))}
              className={`${INPUT} ${errors.condition ? 'border-red-400' : 'border-gray-300'}`}
              style={ring}
            >
              <option value="" disabled>
                Choose a condition
              </option>
              {CONDITION_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <FieldError msg={errors.condition} />
          </div>

          {c?.type === 'ITEM_MIN_PRICE' && (
            <>
              <div>
                <p className="block text-sm font-medium text-gray-700 mb-1">Min price (₱)</p>
                <NumberInput
                  ariaLabel="Minimum base price"
                  value={c.minPrice}
                  step="0.01"
                  min={0}
                  invalid={!!errors.minPrice}
                  ringColor={primaryColor}
                  onChange={n => setCondition({ ...c, minPrice: n })}
                />
                {errors.minPrice ? (
                  <FieldError msg={errors.minPrice} />
                ) : (
                  <p className="text-xs text-gray-400 mt-1">
                    {c.minPrice > 0 ? `Base price of ${peso(c.minPrice)} or more` : 'Base price'}, before size and add-ons.
                  </p>
                )}
              </div>
              <NamePicker
                label="Categories (optional)"
                options={catalog.categoryNames}
                value={c.categoryNames ?? []}
                onChange={names => setCondition({ ...c, categoryNames: names })}
                catalogFailed={catalog.failed}
                helper="Leave empty to count any category."
              />
            </>
          )}

          {c?.type === 'ITEM_PRODUCT_NAMES' && (
            <NamePicker
              label="Products"
              options={catalog.productNames}
              value={c.names}
              onChange={names => setCondition({ ...c, names })}
              catalogFailed={catalog.failed}
              error={errors.names}
              helper="Names match case-insensitively across menus."
            />
          )}

          {c?.type === 'ITEM_CATEGORY_NAMES' && (
            <NamePicker
              label="Categories"
              options={catalog.categoryNames}
              value={c.names}
              onChange={names => setCondition({ ...c, names })}
              catalogFailed={catalog.failed}
              error={errors.names}
              helper="Names match case-insensitively across menus."
            />
          )}

          {c?.type === 'TRANSACTION_MIN_TOTAL' && (
            <div>
              <p className="block text-sm font-medium text-gray-700 mb-1">Min order total (₱)</p>
              <NumberInput
                ariaLabel="Minimum order total"
                value={c.minTotal}
                step="0.01"
                min={0}
                invalid={!!errors.minTotal}
                ringColor={primaryColor}
                onChange={n => setCondition({ ...c, minTotal: n })}
              />
              {errors.minTotal ? (
                <FieldError msg={errors.minTotal} />
              ) : (
                <p className="text-xs text-gray-400 mt-1">The final total, after all discounts.</p>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div>
            <label htmlFor={`reward-${slot.key}`} className="block text-sm font-medium text-gray-700 mb-1">
              Reward
            </label>
            <select
              id={`reward-${slot.key}`}
              value={r?.type ?? ''}
              onChange={e => setReward(defaultReward(e.target.value as MilestoneReward['type'], r))}
              className={`${INPUT} ${errors.reward ? 'border-red-400' : 'border-gray-300'}`}
              style={ring}
            >
              <option value="" disabled>
                Choose a reward
              </option>
              {REWARD_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <FieldError msg={errors.reward} />
          </div>

          {r?.type === 'PERCENT_OFF_ITEM' && (
            <div>
              <p className="block text-sm font-medium text-gray-700 mb-1">Percent off (%)</p>
              <NumberInput
                ariaLabel="Percent off"
                value={r.percent}
                step="1"
                min={1}
                max={100}
                invalid={!!errors.percent}
                ringColor={primaryColor}
                onChange={n => setReward({ ...r, percent: n })}
              />
              <FieldError msg={errors.percent} />
            </div>
          )}

          {r?.type === 'AMOUNT_OFF_ITEM' && (
            <div>
              <p className="block text-sm font-medium text-gray-700 mb-1">Amount off (₱)</p>
              <NumberInput
                ariaLabel="Amount off"
                value={r.amount}
                step="0.01"
                min={0}
                invalid={!!errors.amount}
                ringColor={primaryColor}
                onChange={n => setReward({ ...r, amount: n })}
              />
              <FieldError msg={errors.amount} />
            </div>
          )}

          {r && (
            <div>
              <button
                type="button"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen(o => !o)}
                className="inline-flex items-center gap-1 text-sm font-medium text-gray-700"
              >
                Limit to…
                <ChevronDown className={`w-4 h-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
              </button>
              {filtersOpen && (
                <div className="mt-3 space-y-4">
                  <NamePicker
                    label="Categories"
                    options={catalog.categoryNames}
                    value={r.categoryNames ?? []}
                    onChange={names => setReward({ ...r, categoryNames: names })}
                    catalogFailed={catalog.failed}
                  />
                  <NamePicker
                    label="Sizes"
                    options={catalog.sizeNames}
                    value={r.sizeNames ?? []}
                    onChange={names => setReward({ ...r, sizeNames: names })}
                    catalogFailed={catalog.failed}
                  />
                </div>
              )}
            </div>
          )}

          {rewardPreview(r) && <p className="bg-green-50 text-green-700 text-xs rounded-lg px-3 py-2">{rewardPreview(r)}</p>}
        </>
      )}

      {/* Position */}
      <div className="flex flex-wrap items-end gap-4 pt-1">
        <div>
          <p className="block text-sm font-medium text-gray-700 mb-1">Position</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Move left"
              disabled={slot.position === 0}
              onClick={() => onMove(-1)}
              className="p-1.5 rounded border border-gray-200 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-gray-700 tabular-nums">
              {slot.position + 1} of {rowSlots.length}
            </span>
            <button
              type="button"
              aria-label="Move right"
              disabled={slot.position >= rowSlots.length - 1}
              onClick={() => onMove(1)}
              className="p-1.5 rounded border border-gray-200 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        {rowCount > 1 && (
          <div>
            <label htmlFor={`row-${slot.key}`} className="block text-sm font-medium text-gray-700 mb-1">
              Row
            </label>
            <select
              id={`row-${slot.key}`}
              value={slot.row}
              onChange={e => onMoveToRow(Number(e.target.value))}
              className={`${INPUT} border-gray-300 w-28`}
              style={ring}
            >
              {Array.from({ length: rowCount }, (_, i) => (
                <option key={i} value={i}>
                  Row {i + 1}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          const name = slot.label.trim() || (isStamp ? 'this stamp' : 'this milestone');
          if (confirm(`Remove “${name}”? Past redemptions keep their record.`)) onDelete();
        }}
        className="text-sm text-red-600 hover:text-red-700 inline-flex items-center gap-1.5"
      >
        <Trash2 className="w-4 h-4" /> Remove slot
      </button>
    </>,
  );
});
