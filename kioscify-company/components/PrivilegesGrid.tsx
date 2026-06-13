'use client';

import type { PrivilegeLevel } from '@/types';

type Section = 'brands' | 'analytics' | 'users' | 'settings';

type Privileges = Record<Section, PrivilegeLevel>;

interface Props {
  value: Privileges;
  onChange: (updated: Privileges) => void;
  disabled?: boolean;
}

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'brands', label: 'Brands' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'users', label: 'Users' },
  { key: 'settings', label: 'Settings' },
];

const LEVELS: { value: PrivilegeLevel; label: string }[] = [
  { value: 'no_access', label: 'No Access' },
  { value: 'read', label: 'Read' },
  { value: 'write', label: 'Write' },
  { value: 'all', label: 'All' },
];

export function PrivilegesGrid({ value, onChange, disabled }: Props) {
  const handleChange = (section: Section, level: PrivilegeLevel) => {
    if (disabled) return;
    onChange({ ...value, [section]: level });
  };

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="grid grid-cols-[120px_1fr] gap-2 text-xs font-medium text-gray-400 pb-1 border-b border-gray-100">
        <span>Section</span>
        <div className="grid grid-cols-4 gap-1">
          {LEVELS.map((l) => (
            <span key={l.value} className="text-center">
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {/* Section rows */}
      {SECTIONS.map(({ key, label }) => (
        <div key={key} className="grid grid-cols-[120px_1fr] gap-2 items-center">
          <span className="text-sm text-gray-700 font-medium">{label}</span>
          <div className="grid grid-cols-4 gap-1">
            {LEVELS.map(({ value: level, label: levelLabel }) => {
              const isActive = value[key] === level;
              return (
                <button
                  key={level}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleChange(key, level)}
                  className={[
                    'text-xs py-1.5 px-1 rounded transition-colors text-center',
                    isActive
                      ? 'bg-orange-500 text-white font-medium'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                    disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                  ].join(' ')}
                >
                  {levelLabel}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
