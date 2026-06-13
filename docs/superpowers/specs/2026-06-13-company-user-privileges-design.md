# Company User Privileges — Design Spec

**Date:** 2026-06-13  
**Branch:** feat/final-demo-enhancements  
**Portal:** kioscify-company (Company Portal)

---

## Overview

Add per-section privilege levels to company admin users in the Company Portal. Each `COMPANY_ADMIN` user gets a privilege level for each section of the portal. The primary (owner) admin retains unrestricted access. Enforcement happens on both the API (via JWT) and the frontend (via localStorage for UX gating).

---

## Privilege Model

### Levels

| Level | Meaning |
|---|---|
| `no_access` | Section is hidden; API rejects all requests |
| `read` | View-only; no create, edit, or delete |
| `write` | View + create + edit; no delete |
| `all` | Full access including delete |

Hierarchy for enforcement: `no_access < read < write < all`

### Sections

| Section | Gated? |
|---|---|
| Dashboard | No — always visible to all company admins |
| Brands | Yes |
| Analytics | Yes |
| Users | Yes |
| Settings | Yes |

### Owner vs. Restricted Admin

- `companyPrivileges: null` → owner; full access to everything, no checks applied
- `companyPrivileges: { ... }` → restricted admin; each section enforced independently

The primary company admin created during company setup has `null`. All subsequent admins created via the Company Portal get explicit privileges set by the creating admin.

**Migration behavior:** The `companyPrivileges` field is `Json?` with no default, so all existing `COMPANY_ADMIN` users will have `null` after the schema migration. They all become owners by default — no existing access is broken.

---

## Data Model

### Schema change (`kioskly-api/prisma/schema.prisma`)

Add one field to the `User` model:

```prisma
companyPrivileges  Json?  // null = owner; { brands, analytics, users, settings } when restricted
```

Shape when not null:

```ts
{
  brands:    'no_access' | 'read' | 'write' | 'all',
  analytics: 'no_access' | 'read' | 'write' | 'all',
  users:     'no_access' | 'read' | 'write' | 'all',
  settings:  'no_access' | 'read' | 'write' | 'all',
}
```

Default when an admin creates a new user without specifying privileges: `read` for all sections.

---

## API Changes

### 1. Shared privilege utility (`src/common/utils/privileges.ts`)

```ts
export type PrivilegeLevel = 'no_access' | 'read' | 'write' | 'all';
export type PrivilegeSection = 'brands' | 'analytics' | 'users' | 'settings';

const LEVEL_RANK: Record<PrivilegeLevel, number> = {
  no_access: 0, read: 1, write: 2, all: 3,
};

export function hasPrivilege(
  companyPrivileges: Record<string, string> | null,
  section: PrivilegeSection,
  required: PrivilegeLevel,
): boolean {
  if (companyPrivileges === null) return true; // owner — always passes
  const actual = (companyPrivileges[section] ?? 'no_access') as PrivilegeLevel;
  return LEVEL_RANK[actual] >= LEVEL_RANK[required];
}
```

### 2. Privilege guard/decorator

A `@RequirePrivilege(section, level)` decorator and matching `PrivilegeGuard` reads `req.user.companyPrivileges` from the decoded JWT. Short-circuits (passes) if `req.user.role !== 'COMPANY_ADMIN'` so platform admins are unaffected.

### 3. JWT payload

Include `companyPrivileges` in the JWT payload when a `COMPANY_ADMIN` logs in (company-login endpoint in `auth.service.ts`). No extra DB hit is needed per request — privileges are read from the signed token.

Privilege changes take effect on the user's next login (standard JWT behavior).

### 4. Controller enforcement

| Controller | Operation | Section | Minimum level |
|---|---|---|---|
| BrandsController | GET (list/detail) | brands | read |
| BrandsController | POST, PATCH | brands | write |
| BrandsController | DELETE | brands | all |
| AnalyticsController | GET (all endpoints) | analytics | read |
| UsersController | GET companies/:id | users | read |
| UsersController | POST companies/:id | users | write |
| UsersController | PATCH companies/:id/:userId | users | write |
| UsersController | DELETE companies/:id/:userId | users | all |
| UsersController | POST .../reset-password | users | write |
| CompaniesController | GET (settings) | settings | read |
| CompaniesController | PATCH, logo upload | settings | write |

### 5. DTO changes

`UpdateCompanyUserDto` gains an optional `companyPrivileges` field:

```ts
@ApiPropertyOptional()
@IsOptional()
companyPrivileges?: {
  brands: PrivilegeLevel;
  analytics: PrivilegeLevel;
  users: PrivilegeLevel;
  settings: PrivilegeLevel;
} | null;
```

`CreateCompanyUserDto` gains the same optional field. The `companyPrivileges` value in this field is only honored if the creating user has `users: all` (or is owner). If the creating user only has `users: write`, the field is silently ignored and the new user defaults to `read` for all sections.

Only a user whose own `companyPrivileges` is `null` or has `users: all` can set or change `companyPrivileges` on another user. The service enforces this on both create and update; attempting to set privileges without sufficient access returns `403`.

A user cannot change their own privileges (service checks `requestingUserId !== targetUserId` before allowing privilege updates).

---

## Frontend Changes (`kioscify-company`)

### 1. Privilege helper (`lib/privileges.ts`)

```ts
export type PrivilegeLevel = 'no_access' | 'read' | 'write' | 'all';
export type PrivilegeSection = 'brands' | 'analytics' | 'users' | 'settings';

const RANK = { no_access: 0, read: 1, write: 2, all: 3 };

export function getPrivilege(section: PrivilegeSection): PrivilegeLevel {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!user?.companyPrivileges) return 'all'; // owner
    return user.companyPrivileges[section] ?? 'no_access';
  } catch {
    return 'no_access';
  }
}

export function hasPrivilege(section: PrivilegeSection, required: PrivilegeLevel): boolean {
  return RANK[getPrivilege(section)] >= RANK[required];
}
```

### 2. Navigation gating

The sidebar hides links for sections where the user has `no_access`. Direct URL access to a blocked section redirects to `/dashboard`.

### 3. Page-level action gating

Each gated page reads its privilege level and:
- `no_access` → redirect to `/dashboard`
- `read` → renders data; hides all create/edit/delete buttons
- `write` → renders create + edit buttons; hides delete buttons
- `all` → renders all buttons

### 4. Privilege assignment UI (Users page)

**Create user modal** — gains a "Permissions" section below the existing fields. A grid with one row per section and four radio options per row (`no access / read / write / all`). Dashboard row is greyed out with "Always visible" label and no controls.

**Edit privileges modal** — a new modal triggered by a shield/edit icon on each user row. Contains the same permissions grid, pre-populated with the user's current privileges. The icon is only visible if the current admin can manage that user's privileges (own `companyPrivileges === null` or `users: all`), and is hidden on the current user's own row.

### 5. `User` type update (`types/index.ts`)

```ts
export interface User {
  // ...existing fields...
  companyPrivileges?: {
    brands: PrivilegeLevel;
    analytics: PrivilegeLevel;
    users: PrivilegeLevel;
    settings: PrivilegeLevel;
  } | null;
}
```

---

## Security Notes

- Frontend gating (localStorage) is UX-only. The real security boundary is the API.
- The API reads privileges from the signed JWT payload — a user cannot tamper with their own privileges without invalidating their token.
- Privilege changes take effect on next login; no mid-session invalidation needed.
