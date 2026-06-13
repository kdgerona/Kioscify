export type PrivilegeLevel = 'no_access' | 'read' | 'write' | 'all';
export type PrivilegeSection = 'brands' | 'analytics' | 'users' | 'settings';

const LEVEL_RANK: Record<PrivilegeLevel, number> = {
  no_access: 0,
  read: 1,
  write: 2,
  all: 3,
};

export function hasPrivilege(
  companyPrivileges: Record<string, string> | null,
  section: PrivilegeSection,
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
};
