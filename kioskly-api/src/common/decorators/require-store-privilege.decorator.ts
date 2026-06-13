import { SetMetadata } from '@nestjs/common';
import type { StorePrivilegeSection, PrivilegeLevel } from '../utils/privileges';

export const STORE_PRIVILEGE_KEY = 'required_store_privilege';

export interface StorePrivilegeMetadata {
  section: StorePrivilegeSection;
  level: PrivilegeLevel;
}

export const RequireStorePrivilege = (section: StorePrivilegeSection, level: PrivilegeLevel) =>
  SetMetadata(STORE_PRIVILEGE_KEY, { section, level });
