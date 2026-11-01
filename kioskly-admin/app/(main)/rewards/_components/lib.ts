import { api } from '@/lib/api';
import { distinctNames } from '@/components/rewards/loyalty-card';
import type { RewardCatalog, RewardProgram } from '@/components/rewards/types';

/**
 * Distinct product, category and size names on this store's menu, offered as
 * NamePicker suggestions. Programs store names (not ids) because menus are
 * cloned with fresh ids; the store endpoints resolve the store's own menu.
 */
export async function loadRewardCatalog(): Promise<RewardCatalog> {
  try {
    const [categories, products, sizes] = await Promise.all([api.getCategories(), api.getProducts(), api.getSizes()]);
    return {
      categoryNames: distinctNames(categories.map(c => c.name)),
      productNames: distinctNames(products.map(p => p.name)),
      sizeNames: distinctNames(sizes.map(s => s.name)),
    };
  } catch {
    return { categoryNames: [], productNames: [], sizeNames: [], failed: true };
  }
}

/** API error text; 400s from class-validator / the type handler arrive as string arrays. */
export function rewardErrorText(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(message)) return message.join('\n');
  return message || fallback;
}

/** Link to a transaction's detail modal on the Transactions page. */
export function transactionHref(transactionId: string): string {
  return `/transactions?transaction=${encodeURIComponent(transactionId)}`;
}

/** Company programs (and anything the API marks non-editable) are read-only for store users. */
export function isReadOnlyProgram(p: Pick<RewardProgram, 'editable' | 'scope'>): boolean {
  return p.editable === false || p.scope === 'COMPANY';
}
