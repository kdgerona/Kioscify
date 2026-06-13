import type { StorePrivilegeLevel, StorePrivilegeSection } from '@/types';

const RANK: Record<StorePrivilegeLevel, number> = { no_access: 0, read: 1, write: 2, all: 3 };

function getUser() {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getPrivilege(section: StorePrivilegeSection): StorePrivilegeLevel {
  const user = getUser();
  if (!user) return 'no_access';
  if (!user.storePrivileges) return 'all'; // null = owner
  return (user.storePrivileges[section] as StorePrivilegeLevel) ?? 'no_access';
}

export function hasPrivilege(section: StorePrivilegeSection, required: StorePrivilegeLevel): boolean {
  return RANK[getPrivilege(section)] >= RANK[required];
}
