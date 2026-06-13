import { SetMetadata } from '@nestjs/common';
import type { PrivilegeSection, PrivilegeLevel } from '../utils/privileges';

export const PRIVILEGE_KEY = 'required_privilege';

export interface PrivilegeMetadata {
  section: PrivilegeSection;
  level: PrivilegeLevel;
}

export const RequirePrivilege = (section: PrivilegeSection, level: PrivilegeLevel) =>
  SetMetadata(PRIVILEGE_KEY, { section, level });
