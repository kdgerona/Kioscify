export type PrivilegeLevel = 'no_access' | 'read' | 'write' | 'all';
export type PrivilegeSection = 'brands' | 'analytics' | 'users' | 'settings' | 'rewards';
export type StorePrivilegeSection =
  | 'transactions'
  | 'expenses'
  | 'inventory'
  | 'users'
  | 'settings'
  | 'rewards';

const LEVEL_RANK: Record<PrivilegeLevel, number> = {
  no_access: 0,
  read: 1,
  write: 2,
  all: 3,
};

export function hasPrivilege(
  companyPrivileges: Record<string, string> | null,
  section: PrivilegeSection | StorePrivilegeSection | string,
  required: PrivilegeLevel,
): boolean {
  if (companyPrivileges === null) return true;
  const actual = (companyPrivileges[section] ?? 'no_access') as PrivilegeLevel;
  return LEVEL_RANK[actual] >= LEVEL_RANK[required];
}

export const DEFAULT_PRIVILEGES: Record<PrivilegeSection, PrivilegeLevel> = {
  brands: 'read',
  analytics: 'read',
  users: 'read',
  settings: 'read',
  rewards: 'read',
};

export const DEFAULT_STORE_PRIVILEGES: Record<StorePrivilegeSection, PrivilegeLevel> = {
  transactions: 'read',
  expenses: 'read',
  inventory: 'read',
  users: 'read',
  settings: 'read',
  rewards: 'read',
};
