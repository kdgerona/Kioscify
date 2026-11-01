import { api } from '@/lib/api';
import { distinctNames } from '@/components/rewards/loyalty-card';
import type { RewardCatalog } from '@/components/rewards/types';

/**
 * Distinct product, category and size names across every menu of the brand.
 * Programs store names (not ids) because menus are cloned with fresh ids.
 */
export async function loadRewardCatalog(brandId: string): Promise<RewardCatalog> {
  try {
    const menus = await api.getMenus(brandId);
    const perMenu = await Promise.all(
      menus.map(m =>
        Promise.all([api.getCategories({ menuId: m.id }, 'PRODUCT'), api.getProducts(m.id), api.getSizes(m.id)]),
      ),
    );
    return {
      categoryNames: distinctNames(perMenu.flatMap(([cats]) => cats.map(c => c.name))),
      productNames: distinctNames(perMenu.flatMap(([, prods]) => prods.map(p => p.name))),
      sizeNames: distinctNames(perMenu.flatMap(([, , sizes]) => sizes.map(s => s.name))),
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
