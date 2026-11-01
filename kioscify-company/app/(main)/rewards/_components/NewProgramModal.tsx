'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import type { Brand } from '@/types';
import type { RewardProgramType } from '@/components/rewards/types';
import { REWARD_TYPES } from '@/components/rewards/registry';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface NewProgramDetails {
  type: RewardProgramType;
  brandId: string;
  name: string;
  description: string;
}

interface Props {
  brands: Brand[];
  defaultBrandId?: string;
  primaryColor: string;
  onClose: () => void;
  onNext: (details: NewProgramDetails) => void;
}

const INPUT =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent bg-white';

/** Two steps: choose a reward type, then brand + name + description. */
export function NewProgramModal({ brands, defaultBrandId, primaryColor, onClose, onNext }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [type, setType] = useState<RewardProgramType>('LOYALTY_CARD');
  const [brandId, setBrandId] = useState(defaultBrandId ?? (brands.length === 1 ? brands[0].id : ''));
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ring = { '--tw-ring-color': primaryColor } as React.CSSProperties;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandId) return setError('Choose a brand.');
    if (!name.trim()) return setError('Give the program a name.');
    onNext({ type, brandId, name: name.trim(), description: description.trim() });
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="new-program-title">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white">
          <h3 id="new-program-title" className="font-semibold text-gray-900">
            New program
          </h3>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 1 ? (
          <div className="p-5 space-y-4">
            <p className="text-sm font-medium text-gray-700">Choose a reward type</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Reward type">
              {REWARD_TYPES.map(t => {
                const Icon = t.icon;
                const selected = t.available && type === t.type;
                return (
                  <button
                    key={t.type}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={!t.available}
                    onClick={() => setType(t.type)}
                    className={`text-left p-4 rounded-xl border-2 transition ${
                      t.available ? 'hover:border-gray-300' : 'opacity-50 cursor-not-allowed'
                    } ${selected ? '' : 'border-gray-200'}`}
                    style={selected ? { borderColor: primaryColor, backgroundColor: `${primaryColor}0d` } : undefined}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" style={{ color: t.available ? primaryColor : undefined }} />
                      <span className="text-sm font-semibold text-gray-900">{t.label}</span>
                    </div>
                    {t.available ? (
                      <p className="text-xs text-gray-500 mt-1.5">{t.description}</p>
                    ) : (
                      <span className="inline-block mt-2 text-[10px] uppercase font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                        Coming soon
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-white rounded-lg text-sm font-medium hover:brightness-90"
                style={{ backgroundColor: primaryColor }}
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="p-5 space-y-4">
            <p className="text-sm font-medium text-gray-700">Program details</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Brand<span className="text-red-500">*</span>
              </label>
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger className="h-[38px]">
                  <SelectValue placeholder="Choose a brand" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map(b => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="new-program-name" className="block text-sm font-medium text-gray-700 mb-1">
                Name<span className="text-red-500">*</span>
              </label>
              <input
                id="new-program-name"
                autoFocus
                value={name}
                maxLength={60}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Loyalty Club Card"
                className={INPUT}
                style={ring}
              />
            </div>
            <div>
              <label htmlFor="new-program-description" className="block text-sm font-medium text-gray-700 mb-1">
                Description <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                id="new-program-description"
                rows={2}
                value={description}
                maxLength={500}
                onChange={e => setDescription(e.target.value)}
                className={`${INPUT} resize-none`}
                style={ring}
              />
            </div>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">{error}</div>}
            <div className="flex justify-between gap-3 pt-2">
              <button type="button" onClick={() => setStep(1)} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                type="submit"
                disabled={!name.trim() || !brandId}
                className="px-4 py-2 text-white rounded-lg text-sm font-medium hover:brightness-90 disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}
              >
                Design the card
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
