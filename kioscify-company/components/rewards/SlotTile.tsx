'use client';

import { forwardRef } from 'react';
import { Cloud } from 'lucide-react';
import type { LoyaltyCardSlot } from './types';
import { conditionHint, rewardHint } from './loyalty-card';

interface Props {
  slot: LoyaltyCardSlot;
  selected: boolean;
  hasError: boolean;
  primaryColor: string;
  /** Replaces the stamp's condition hint (ONE_PER_VISIT shows "Visit 3"). */
  stampHint?: string;
  onClick: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  tabIndex?: number;
}

/** A stamp circle or a milestone cloud. Always clickable (read-only shows the definition). */
export const SlotTile = forwardRef<HTMLButtonElement, Props>(function SlotTile(
  { slot, selected, hasError, primaryColor, stampHint, onClick, onKeyDown, tabIndex },
  ref,
) {
  const label = slot.label.trim();
  const isStamp = slot.kind === 'STAMP';
  const hint = isStamp ? (stampHint ?? conditionHint(slot.condition)) : rewardHint(slot.reward);
  const aria = `Row ${slot.row + 1}, slot ${slot.position + 1}: ${isStamp ? 'Stamp' : 'Milestone'}, ${label || 'Untitled'}${hint ? `, ${hint}` : ''}`;

  const ring = hasError
    ? 'ring-2 ring-red-500 ring-offset-2'
    : selected
      ? 'ring-2 ring-offset-2 shadow-md'
      : '';
  const style = {
    borderColor: isStamp ? `${primaryColor}60` : `${primaryColor}80`,
    '--tw-ring-color': hasError ? undefined : primaryColor,
  } as React.CSSProperties;

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      onKeyDown={onKeyDown}
      tabIndex={tabIndex}
      aria-label={aria}
      aria-pressed={selected}
      style={style}
      className={
        isStamp
          ? `relative w-24 h-24 shrink-0 rounded-full bg-white border-2 flex flex-col items-center justify-center text-center px-2 transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${ring}`
          : `relative w-44 h-24 shrink-0 rounded-[2.5rem] bg-white border-2 border-dashed flex flex-col items-center justify-center px-4 text-center transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${ring}`
      }
    >
      {isStamp ? (
        <>
          <span className={`text-[11px] leading-tight font-semibold line-clamp-3 ${label ? 'text-gray-800' : 'italic text-gray-400 font-normal'}`}>
            {label || 'Untitled'}
          </span>
          {hint && <span className="text-[10px] text-gray-500 mt-0.5">{hint}</span>}
        </>
      ) : (
        <>
          <Cloud className="w-4 h-4 mb-0.5" style={{ color: primaryColor }} />
          <span
            className={`text-xs uppercase tracking-wide line-clamp-2 ${label ? 'font-extrabold text-gray-900' : 'italic text-gray-400 font-normal normal-case'}`}
          >
            {label || 'Untitled'}
          </span>
          {hint && <span className="text-[11px] text-gray-600 mt-0.5">{hint}</span>}
        </>
      )}
      {hasError && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 border-2 border-white" />}
    </button>
  );
});
