import type { PrivilegeLevel, PrivilegeSection } from '@/types';

const RANK: Record<PrivilegeLevel, number> = {
  no_access: 0,
  read: 1,
  write: 2,
  all: 3,
};

function getUser(): { companyPrivileges?: Record<string, string> | null } | null {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getPrivilege(section: PrivilegeSection): PrivilegeLevel {
  const user = getUser();
  if (!user) return 'no_access';
  if (!user.companyPrivileges) return 'all'; // null = owner
  return (user.companyPrivileges[section] as PrivilegeLevel) ?? 'no_access';
}

export function hasPrivilege(section: PrivilegeSection, required: PrivilegeLevel): boolean {
  return RANK[getPrivilege(section)] >= RANK[required];
}
