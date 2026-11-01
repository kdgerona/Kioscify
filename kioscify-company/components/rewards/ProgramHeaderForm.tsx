'use client';

import type { ProgramHeaderErrors, ProgramHeaderValue, RewardProgramStatus } from './types';
import { STATUS_LABELS } from './badges';
import { MAX_PROGRAM_NAME, formatShortDate, dateInputToIso } from './loyalty-card';

interface Props {
  value: ProgramHeaderValue;
  onChange: (value: ProgramHeaderValue) => void;
  /** Status saved on the server: DRAFT is offered only while the program is still a draft. */
  savedStatus?: RewardProgramStatus;
  readOnly?: boolean;
  errors?: ProgramHeaderErrors;
  primaryColor: string;
  /** Hide the status select (e.g. for a program that hasn't been created yet). */
  hideStatus?: boolean;
}

const INPUT = 'w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:border-transparent outline-none bg-white';

export function ProgramHeaderForm({ value, onChange, savedStatus, readOnly, errors = {}, primaryColor, hideStatus }: Props) {
  const ring = { '--tw-ring-color': primaryColor } as React.CSSProperties;
  const set = <K extends keyof ProgramHeaderValue>(k: K, v: ProgramHeaderValue[K]) => onChange({ ...value, [k]: v });
  const statuses: RewardProgramStatus[] =
    savedStatus && savedStatus !== 'DRAFT' ? ['ACTIVE', 'PAUSED', 'ARCHIVED'] : ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'];
  const cls = (err?: string) => `${INPUT} ${err ? 'border-red-400' : 'border-gray-300'}`;

  if (readOnly) {
    const date = (d: string, edge: 'start' | 'end') => {
      const iso = d ? dateInputToIso(d, edge) : null;
      return iso ? formatShortDate(iso) : '—';
    };
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <dl className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-sm">
          <div className="sm:col-span-2">
            <dt className="text-gray-500">Name</dt>
            <dd className="text-gray-900 font-medium">{value.name}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Starts</dt>
            <dd className="text-gray-900">{date(value.startsAt, 'start')}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Ends</dt>
            <dd className="text-gray-900">{date(value.endsAt, 'end')}</dd>
          </div>
          <div className="sm:col-span-4">
            <dt className="text-gray-500">Description</dt>
            <dd className="text-gray-900">{value.description || '—'}</dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_160px_160px] gap-4">
        <div>
          <label htmlFor="program-name" className="block text-sm font-medium text-gray-700 mb-1">
            Name<span className="text-red-500">*</span>
          </label>
          <input
            id="program-name"
            value={value.name}
            maxLength={MAX_PROGRAM_NAME}
            onChange={e => set('name', e.target.value)}
            placeholder="e.g. Loyalty Club Card"
            className={cls(errors.name)}
            style={ring}
          />
          {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
        </div>
        {!hideStatus ? (
          <div>
            <label htmlFor="program-status" className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              id="program-status"
              value={value.status}
              onChange={e => set('status', e.target.value as RewardProgramStatus)}
              className={cls(errors.status)}
              style={ring}
            >
              {statuses.map(s => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            {errors.status && <p className="text-xs text-red-600 mt-1">{errors.status}</p>}
          </div>
        ) : (
          <div className="hidden md:block" />
        )}
        <div>
          <label htmlFor="program-starts" className="block text-sm font-medium text-gray-700 mb-1">
            Starts
          </label>
          <input id="program-starts" type="date" value={value.startsAt} onChange={e => set('startsAt', e.target.value)} className={cls()} style={ring} />
        </div>
        <div>
          <label htmlFor="program-ends" className="block text-sm font-medium text-gray-700 mb-1">
            Ends
          </label>
          <input
            id="program-ends"
            type="date"
            value={value.endsAt}
            min={value.startsAt || undefined}
            onChange={e => set('endsAt', e.target.value)}
            className={cls(errors.endsAt)}
            style={ring}
          />
          {errors.endsAt && <p className="text-xs text-red-600 mt-1">{errors.endsAt}</p>}
        </div>
      </div>
      <div>
        <label htmlFor="program-description" className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <input
          id="program-description"
          value={value.description}
          maxLength={500}
          onChange={e => set('description', e.target.value)}
          placeholder="e.g. Collect 12 stamps and unlock 3 rewards."
          className={cls()}
          style={ring}
        />
      </div>
    </div>
  );
}
