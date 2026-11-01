// Frontend reward-type registry. List pages, filters and the "New program"
// picker read from here, so a new type is one entry plus one editor.

import { Gift, Percent, Stamp, type LucideIcon } from 'lucide-react';
import type { LoyaltyCardConfig, RewardProgramType, SlotErrors } from './types';
import { asLoyaltyConfig, summarizeLoyaltyConfig, validateLoyaltyConfig } from './loyalty-card';

export interface RewardTypeMeta {
  type: RewardProgramType;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Only LOYALTY_CARD is available for now. */
  available: boolean;
  /** "12 stamps · 3 milestones", used in list rows. */
  summarize(config: unknown): string;
  emptyConfig(): unknown;
  validate(config: unknown): SlotErrors;
}

export const REWARD_TYPES: RewardTypeMeta[] = [
  {
    type: 'LOYALTY_CARD',
    label: 'Loyalty Card',
    description: 'Stamp circles and milestone rewards, like your paper card.',
    icon: Stamp,
    available: true,
    summarize: summarizeLoyaltyConfig,
    emptyConfig: (): LoyaltyCardConfig => ({ slots: [] }),
    validate: config => validateLoyaltyConfig(asLoyaltyConfig(config)),
  },
  {
    type: 'BUY_X_GET_Y',
    label: 'Buy X Get Y',
    description: 'Coming soon',
    icon: Gift,
    available: false,
    summarize: () => '',
    emptyConfig: () => ({}),
    validate: () => ({}),
  },
  {
    type: 'PERCENT_OFF',
    label: 'Percent off',
    description: 'Coming soon',
    icon: Percent,
    available: false,
    summarize: () => '',
    emptyConfig: () => ({}),
    validate: () => ({}),
  },
];

export function getRewardType(type: RewardProgramType | string): RewardTypeMeta | undefined {
  return REWARD_TYPES.find(t => t.type === type);
}
