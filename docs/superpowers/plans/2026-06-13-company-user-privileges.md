# Company User Privileges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-section privilege levels (`no_access / read / write / all`) to company admin users in the Company Portal, enforced on both the API (JWT) and frontend (localStorage UX gating).

**Architecture:** A nullable JSON field `companyPrivileges` on the `User` model — `null` means owner (full access), a value object restricts per section. A `PrivilegeGuard` reads this from the signed JWT on the API side; the frontend reads it from localStorage to hide nav items and action buttons.

**Tech Stack:** NestJS (API), Prisma + MongoDB, Next.js 15, Tailwind CSS, Radix UI, TypeScript

---

## File Map

### New files
| File | Purpose |
|---|---|
| `kioskly-api/src/common/utils/privileges.ts` | `hasPrivilege` utility and shared types |
| `kioskly-api/src/common/decorators/require-privilege.decorator.ts` | `@RequirePrivilege` metadata decorator |
| `kioskly-api/src/common/guards/privilege.guard.ts` | `PrivilegeGuard` that reads JWT and checks metadata |
| `kioskly-api/src/common/utils/privileges.spec.ts` | Unit tests for `hasPrivilege` |
| `kioscify-company/lib/privileges.ts` | Frontend privilege helpers (`getPrivilege`, `hasPrivilege`) |
| `kioscify-company/app/(main)/users/components/PrivilegesGrid.tsx` | Reusable privilege assignment grid |
| `kioscify-company/app/(main)/users/components/EditPrivilegesModal.tsx` | Modal for editing an existing user's privileges |

### Modified files
| File | What changes |
|---|---|
| `kioskly-api/prisma/schema.prisma` | Add `companyPrivileges Json?` to `User` model |
| `kioskly-api/src/auth/auth.service.ts` | Include `companyPrivileges` in company-login JWT payload and user response |
| `kioskly-api/src/users/dto/user.dto.ts` | Add `companyPrivileges` field to `CreateCompanyUserDto` and `UpdateCompanyUserDto` |
| `kioskly-api/src/users/users.service.ts` | Update `createCompanyUser`, `updateCompanyUser`, `getCompanyUsers` |
| `kioskly-api/src/users/users.service.spec.ts` | Tests for new privilege logic |
| `kioskly-api/src/brands/brands.controller.ts` | Add `@RequirePrivilege` to COMPANY_ADMIN routes |
| `kioskly-api/src/analytics/analytics.controller.ts` | Add `PrivilegeGuard` + `@RequirePrivilege` at class level |
| `kioskly-api/src/users/users.controller.ts` | Add `@RequirePrivilege` to company user routes |
| `kioskly-api/src/companies/companies.controller.ts` | Add `@RequirePrivilege` to `me` and `PATCH` routes |
| `kioscify-company/types/index.ts` | Add `companyPrivileges` to `User` interface |
| `kioscify-company/lib/api.ts` | Add `updateCompanyUserPrivileges` method |
| `kioscify-company/app/(main)/layout.tsx` | Filter `navItems` based on privilege |
| `kioscify-company/app/(main)/brands/page.tsx` | Add `no_access` redirect + hide create button for `read` |
| `kioscify-company/app/(main)/brands/[brandId]/page.tsx` | Add `no_access` redirect + hide edit controls for `read` |
| `kioscify-company/app/(main)/analytics/page.tsx` | Add `no_access` redirect |
| `kioscify-company/app/(main)/settings/page.tsx` | Add `no_access` redirect + hide save button for `read` |
| `kioscify-company/app/(main)/users/page.tsx` | Add privilege gating + PrivilegesGrid in create modal + EditPrivilegesModal trigger |

---

## Task 1: Schema — Add `companyPrivileges` to User model

**Files:**
- Modify: `kioskly-api/prisma/schema.prisma`

- [ ] **Step 1: Add field to schema**

Open `kioskly-api/prisma/schema.prisma`. Find the `User` model (around line 156). Add one line after `isActive Boolean @default(true)`:

```prisma
companyPrivileges  Json?     // null = owner (full access); { brands, analytics, users, settings } for restricted admins
```

The User model block should now contain:
```prisma
isActive     Boolean   @default(true)
companyPrivileges  Json?     // null = owner (full access); { brands, analytics, users, settings } for restricted admins
createdAt    DateTime  @default(now())
```

- [ ] **Step 2: Regenerate Prisma client**

```bash
cd kioskly-api && npm run prisma:generate
```

Expected: `✔ Generated Prisma Client` with no errors. MongoDB with Prisma does not require migration files for `Json?` fields — the schema change is additive and backwards-compatible.

- [ ] **Step 3: Commit**

```bash
git add kioskly-api/prisma/schema.prisma
git commit -m "feat(schema): add companyPrivileges Json field to User model"
```

---

## Task 2: Privilege utility

**Files:**
- Create: `kioskly-api/src/common/utils/privileges.ts`
- Create: `kioskly-api/src/common/utils/privileges.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `kioskly-api/src/common/utils/privileges.spec.ts`:

```ts
import { hasPrivilege, PrivilegeLevel } from './privileges';

describe('hasPrivilege', () => {
  it('returns true for null (owner) regardless of required level', () => {
    expect(hasPrivilege(null, 'brands', 'all')).toBe(true);
    expect(hasPrivilege(null, 'analytics', 'read')).toBe(true);
  });

  it('returns true when actual level meets or exceeds required', () => {
    const privs = { brands: 'write', analytics: 'read', users: 'all', settings: 'no_access' };
    expect(hasPrivilege(privs, 'brands', 'read')).toBe(true);
    expect(hasPrivilege(privs, 'brands', 'write')).toBe(true);
    expect(hasPrivilege(privs, 'users', 'all')).toBe(true);
  });

  it('returns false when actual level is below required', () => {
    const privs = { brands: 'read', analytics: 'no_access', users: 'write', settings: 'read' };
    expect(hasPrivilege(privs, 'brands', 'write')).toBe(false);
    expect(hasPrivilege(privs, 'analytics', 'read')).toBe(false);
    expect(hasPrivilege(privs, 'users', 'all')).toBe(false);
  });

  it('defaults missing section to no_access', () => {
    expect(hasPrivilege({}, 'brands', 'read')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
cd kioskly-api && npx jest src/common/utils/privileges.spec.ts --no-coverage
```

Expected: FAIL — `Cannot find module './privileges'`

- [ ] **Step 3: Implement the utility**

Create `kioskly-api/src/common/utils/privileges.ts`:

```ts
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
```

- [ ] **Step 4: Run test to confirm pass**

```bash
cd kioskly-api && npx jest src/common/utils/privileges.spec.ts --no-coverage
```

Expected: PASS — 4 test cases green

- [ ] **Step 5: Commit**

```bash
git add kioskly-api/src/common/utils/privileges.ts kioskly-api/src/common/utils/privileges.spec.ts
git commit -m "feat(privileges): add hasPrivilege utility with tests"
```

---

## Task 3: Privilege guard and decorator

**Files:**
- Create: `kioskly-api/src/common/decorators/require-privilege.decorator.ts`
- Create: `kioskly-api/src/common/guards/privilege.guard.ts`

- [ ] **Step 1: Create the decorator**

Create `kioskly-api/src/common/decorators/require-privilege.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';
import type { PrivilegeSection, PrivilegeLevel } from '../utils/privileges';

export const PRIVILEGE_KEY = 'required_privilege';

export interface PrivilegeMetadata {
  section: PrivilegeSection;
  level: PrivilegeLevel;
}

export const RequirePrivilege = (section: PrivilegeSection, level: PrivilegeLevel) =>
  SetMetadata(PRIVILEGE_KEY, { section, level });
```

- [ ] **Step 2: Create the guard**

Create `kioskly-api/src/common/guards/privilege.guard.ts`:

```ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PRIVILEGE_KEY, PrivilegeMetadata } from '../decorators/require-privilege.decorator';
import { hasPrivilege } from '../utils/privileges';

@Injectable()
export class PrivilegeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const metadata = this.reflector.getAllAndOverride<PrivilegeMetadata | undefined>(
      PRIVILEGE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!metadata) return true;

    const { user } = context.switchToHttp().getRequest();

    // Only enforce for COMPANY_ADMIN — platform admins are unrestricted
    if (!user || user.role !== 'COMPANY_ADMIN') return true;

    const allowed = hasPrivilege(
      user.companyPrivileges ?? null,
      metadata.section,
      metadata.level,
    );

    if (!allowed) {
      throw new ForbiddenException(
        `Insufficient privilege: requires '${metadata.level}' on '${metadata.section}'`,
      );
    }

    return true;
  }
}
```

- [ ] **Step 3: Verify TypeScript compilation**

```bash
cd kioskly-api && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add kioskly-api/src/common/decorators/require-privilege.decorator.ts kioskly-api/src/common/guards/privilege.guard.ts
git commit -m "feat(privileges): add RequirePrivilege decorator and PrivilegeGuard"
```

---

## Task 4: Include `companyPrivileges` in company-login JWT

**Files:**
- Modify: `kioskly-api/src/auth/auth.service.ts`

- [ ] **Step 1: Update `loginCompany` to include `companyPrivileges` in payload and response**

In `kioskly-api/src/auth/auth.service.ts`, find the `loginCompany` method. The `findFirst` call (line ~317) currently does not select `companyPrivileges`. Update the user query and the returned payload:

Replace the `loginCompany` method body with:

```ts
async loginCompany(dto: CompanyLoginDto) {
  const company = await this.prisma.company.findFirst({
    where: { slug: dto.companySlug, isActive: true },
  });

  if (!company) {
    this.logger.warn(
      { companySlug: dto.companySlug, reason: 'company_not_found' },
      'Company login failed',
    );
    throw new UnauthorizedException('Invalid credentials');
  }

  const user = await this.prisma.user.findFirst({
    where: {
      companyId: company.id,
      username: dto.username,
      role: 'COMPANY_ADMIN',
      isActive: true,
    },
  });

  if (!user || !(await bcrypt.compare(dto.password, user.password))) {
    this.logger.warn(
      { companySlug: dto.companySlug, username: dto.username, reason: 'invalid_credentials' },
      'Company login failed',
    );
    throw new UnauthorizedException('Invalid credentials');
  }

  const companyPrivileges = (user.companyPrivileges as Record<string, string> | null) ?? null;

  const payload = {
    sub: user.id,
    username: user.username,
    role: user.role,
    companyId: user.companyId,
    mustChangePassword: user.isFirstLogin,
    companyPrivileges,
  };

  this.logger.info(
    { companyId: user.companyId, username: user.username, role: user.role },
    'Company login successful',
  );

  return {
    accessToken: this.buildJwt(payload),
    mustChangePassword: user.isFirstLogin,
    user: {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      mustChangePassword: user.isFirstLogin,
      companyPrivileges,
    },
  };
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd kioskly-api && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add kioskly-api/src/auth/auth.service.ts
git commit -m "feat(auth): include companyPrivileges in company-login JWT and response"
```

---

## Task 5: DTO updates

**Files:**
- Modify: `kioskly-api/src/users/dto/user.dto.ts`

- [ ] **Step 1: Add `companyPrivileges` to both company user DTOs**

In `kioskly-api/src/users/dto/user.dto.ts`, add the import and update both DTOs:

At the top of the file, add:
```ts
import { IsObject } from 'class-validator';
```

Replace the `CreateCompanyUserDto` class with:

```ts
export class CreateCompanyUserDto {
  @ApiProperty({ example: 'Jane' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'jane.doe@company.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'janedoe' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9_.-]+$/, { message: 'Username must be alphanumeric' })
  username: string;

  @ApiPropertyOptional({
    description: 'Privilege levels per section. Omit to default to read for all sections.',
    example: { brands: 'read', analytics: 'no_access', users: 'read', settings: 'read' },
  })
  @IsOptional()
  @IsObject()
  companyPrivileges?: {
    brands: string;
    analytics: string;
    users: string;
    settings: string;
  };
}
```

Replace the `UpdateCompanyUserDto` class with:

```ts
export class UpdateCompanyUserDto {
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Update privilege levels. Only admins with users:all can set this.',
    example: { brands: 'write', analytics: 'read', users: 'read', settings: 'no_access' },
  })
  @IsOptional()
  @IsObject()
  companyPrivileges?: {
    brands: string;
    analytics: string;
    users: string;
    settings: string;
  } | null;
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd kioskly-api && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add kioskly-api/src/users/dto/user.dto.ts
git commit -m "feat(users): add companyPrivileges field to company user DTOs"
```

---

## Task 6: Users service — privilege-aware create, update, and list

**Files:**
- Modify: `kioskly-api/src/users/users.service.ts`
- Modify: `kioskly-api/src/users/users.service.spec.ts`

- [ ] **Step 1: Write failing tests for new privilege logic**

In `kioskly-api/src/users/users.service.spec.ts`, add these test blocks after the existing describes:

```ts
describe('createCompanyUser', () => {
  it('uses provided companyPrivileges when requesting user is owner (null)', async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce(null); // no conflict
    mockPrisma.user.create.mockResolvedValue({ id: 'u1', username: 'jane', firstName: 'Jane', lastName: 'Doe', email: 'jane@co.com', role: 'COMPANY_ADMIN', isFirstLogin: true });

    const dto = { firstName: 'Jane', lastName: 'Doe', email: 'jane@co.com', username: 'jane', companyPrivileges: { brands: 'write', analytics: 'read', users: 'no_access', settings: 'read' } };
    await service.createCompanyUser('co1', 'co1', dto, null /* requestingPrivileges = owner */);

    expect(mockPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyPrivileges: { brands: 'write', analytics: 'read', users: 'no_access', settings: 'read' },
        }),
      }),
    );
  });

  it('ignores provided companyPrivileges when requester has users:write (not all)', async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce(null);
    mockPrisma.user.create.mockResolvedValue({ id: 'u2', username: 'bob', firstName: 'Bob', lastName: 'Smith', email: 'bob@co.com', role: 'COMPANY_ADMIN', isFirstLogin: true });

    const dto = { firstName: 'Bob', lastName: 'Smith', email: 'bob@co.com', username: 'bob', companyPrivileges: { brands: 'all', analytics: 'all', users: 'all', settings: 'all' } };
    const requestingPrivileges = { brands: 'write', analytics: 'read', users: 'write', settings: 'read' };
    await service.createCompanyUser('co1', 'co1', dto, requestingPrivileges);

    expect(mockPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyPrivileges: { brands: 'read', analytics: 'read', users: 'read', settings: 'read' },
        }),
      }),
    );
  });

  it('defaults to read for all sections when no companyPrivileges provided', async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce(null);
    mockPrisma.user.create.mockResolvedValue({ id: 'u3', username: 'carol', firstName: 'Carol', lastName: 'Lee', email: 'carol@co.com', role: 'COMPANY_ADMIN', isFirstLogin: true });

    await service.createCompanyUser('co1', 'co1', { firstName: 'Carol', lastName: 'Lee', email: 'carol@co.com', username: 'carol' }, null);

    expect(mockPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyPrivileges: { brands: 'read', analytics: 'read', users: 'read', settings: 'read' },
        }),
      }),
    );
  });
});

describe('updateCompanyUser', () => {
  it('throws ForbiddenException when requester lacks users:all and tries to set companyPrivileges', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'u2', companyId: 'co1' });

    const requestingPrivileges = { brands: 'read', analytics: 'read', users: 'write', settings: 'read' };
    await expect(
      service.updateCompanyUser('co1', 'u2', 'co1', 'COMPANY_ADMIN', 'req-user', { companyPrivileges: { brands: 'all', analytics: 'all', users: 'all', settings: 'all' } }, requestingPrivileges),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows companyPrivileges update when requester is owner (null)', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'u2', companyId: 'co1' });
    mockPrisma.user.update.mockResolvedValue({ id: 'u2', companyPrivileges: { brands: 'write', analytics: 'read', users: 'read', settings: 'read' } });

    await service.updateCompanyUser('co1', 'u2', 'co1', 'COMPANY_ADMIN', 'req-user', { companyPrivileges: { brands: 'write', analytics: 'read', users: 'read', settings: 'read' } }, null);

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyPrivileges: { brands: 'write', analytics: 'read', users: 'read', settings: 'read' } }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
cd kioskly-api && npx jest src/users/users.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `createCompanyUser` doesn't accept `requestingPrivileges` argument yet; `updateCompanyUser` signature mismatch

- [ ] **Step 3: Update `createCompanyUser` in users.service.ts**

In `kioskly-api/src/users/users.service.ts`, add the import at the top:

```ts
import { DEFAULT_PRIVILEGES, hasPrivilege } from '../common/utils/privileges';
```

Replace the `createCompanyUser` method:

```ts
async createCompanyUser(
  companyId: string,
  requestingCompanyId: string,
  dto: CreateCompanyUserDto,
  requestingPrivileges: Record<string, string> | null,
) {
  if (companyId !== requestingCompanyId) throw new ForbiddenException('Access denied');

  const existing = await this.prisma.user.findFirst({
    where: { companyId, username: dto.username, tenantId: null },
  });
  if (existing) throw new ConflictException('Username already exists in this company');

  const password = this.authService.generateSecurePassword();
  const hashed = await bcrypt.hash(password, 12);

  // Only honor provided privileges if requester has users:all (or is owner)
  const canSetPrivileges = hasPrivilege(requestingPrivileges, 'users', 'all');
  const companyPrivileges = canSetPrivileges && dto.companyPrivileges
    ? dto.companyPrivileges
    : { ...DEFAULT_PRIVILEGES };

  const user = await this.prisma.user.create({
    data: {
      companyId,
      firstName: dto.firstName,
      lastName: dto.lastName,
      username: dto.username,
      email: dto.email,
      password: hashed,
      role: 'COMPANY_ADMIN',
      isFirstLogin: true,
      isActive: true,
      companyPrivileges,
    },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      isFirstLogin: true,
      companyPrivileges: true,
    },
  });

  return {
    user,
    temporaryPassword: password,
    note: 'Share this password via a secure channel. User will be required to change it on first login.',
  };
}
```

- [ ] **Step 4: Update `updateCompanyUser` in users.service.ts**

Replace the `updateCompanyUser` method:

```ts
async updateCompanyUser(
  companyId: string,
  userId: string,
  requestingCompanyId: string,
  requestingRole: string,
  requestingUserId: string,
  dto: UpdateCompanyUserDto,
  requestingPrivileges: Record<string, string> | null = null,
) {
  if (requestingRole !== 'PLATFORM_ADMIN' && companyId !== requestingCompanyId) {
    throw new ForbiddenException('Access denied');
  }
  if (requestingUserId === userId) throw new ForbiddenException('Cannot modify your own account');

  const user = await this.prisma.user.findFirst({ where: { id: userId, companyId } });
  if (!user) throw new NotFoundException('User not found in this company');

  if (dto.companyPrivileges !== undefined) {
    const canSetPrivileges = hasPrivilege(requestingPrivileges, 'users', 'all');
    if (!canSetPrivileges) {
      throw new ForbiddenException("Requires 'all' privilege on 'users' to update companyPrivileges");
    }
  }

  const updateData: Record<string, unknown> = {};
  if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
  if (dto.companyPrivileges !== undefined) updateData.companyPrivileges = dto.companyPrivileges;

  return this.prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      isActive: true,
      isFirstLogin: true,
      companyPrivileges: true,
    },
  });
}
```

- [ ] **Step 5: Update `getCompanyUsers` to include `companyPrivileges` in select**

In `getCompanyUsers`, add `companyPrivileges: true` to the `select` object:

```ts
select: {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  isActive: true,
  isFirstLogin: true,
  createdAt: true,
  companyPrivileges: true,
},
```

- [ ] **Step 6: Run tests to confirm pass**

```bash
cd kioskly-api && npx jest src/users/users.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: PASS — all tests green (including the new ones)

- [ ] **Step 7: Commit**

```bash
git add kioskly-api/src/users/users.service.ts kioskly-api/src/users/users.service.spec.ts
git commit -m "feat(users): privilege-aware createCompanyUser and updateCompanyUser"
```

---

## Task 7: Wire `requestingPrivileges` through users controller

**Files:**
- Modify: `kioskly-api/src/users/users.controller.ts`

- [ ] **Step 1: Update `createCompanyUser` controller method to pass `companyPrivileges`**

In `kioskly-api/src/users/users.controller.ts`, add the guard import and update the two company user methods. First add the import:

```ts
import { PrivilegeGuard } from '../common/guards/privilege.guard';
import { RequirePrivilege } from '../common/decorators/require-privilege.decorator';
```

Update `getCompanyUsers` to add `@RequirePrivilege`:

```ts
@Get('companies/:companyId')
@UseGuards(RolesGuard, PrivilegeGuard)
@Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
@RequirePrivilege('users', 'read')
@ApiOperation({ summary: 'List COMPANY_ADMIN users for a company' })
getCompanyUsers(
  @Param('companyId') companyId: string,
  @CompanyId() requestingCompanyId: string,
  @Request() req,
) {
  return this.usersService.getCompanyUsers(companyId, requestingCompanyId, req.user.role);
}
```

Update `createCompanyUser` to pass `requestingPrivileges` and add `@RequirePrivilege`:

```ts
@Post('companies/:companyId')
@UseGuards(RolesGuard, PrivilegeGuard)
@Roles('COMPANY_ADMIN')
@RequirePrivilege('users', 'write')
@ApiOperation({ summary: 'Create additional COMPANY_ADMIN user (returns temporary password)' })
createCompanyUser(
  @Param('companyId') companyId: string,
  @Body() dto: CreateCompanyUserDto,
  @CompanyId() requestingCompanyId: string,
  @Request() req,
) {
  const requestingPrivileges = req.user.companyPrivileges ?? null;
  return this.usersService.createCompanyUser(companyId, requestingCompanyId, dto, requestingPrivileges);
}
```

Update `updateCompanyUser` to pass `requestingPrivileges` and add `@RequirePrivilege`:

```ts
@Patch('companies/:companyId/:userId')
@UseGuards(RolesGuard, PrivilegeGuard)
@Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
@RequirePrivilege('users', 'write')
@ApiOperation({ summary: 'Update a company user' })
updateCompanyUser(
  @Param('companyId') companyId: string,
  @Param('userId') userId: string,
  @Body() dto: UpdateCompanyUserDto,
  @CompanyId() requestingCompanyId: string,
  @Request() req,
) {
  const requestingPrivileges = req.user.companyPrivileges ?? null;
  return this.usersService.updateCompanyUser(companyId, userId, requestingCompanyId, req.user.role, req.user.id, dto, requestingPrivileges);
}
```

Update `deleteCompanyUser` to add `@RequirePrivilege`:

```ts
@Delete('companies/:companyId/:userId')
@HttpCode(HttpStatus.OK)
@UseGuards(RolesGuard, PrivilegeGuard)
@Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
@RequirePrivilege('users', 'all')
@ApiOperation({ summary: 'Remove a company user (soft delete)' })
deleteCompanyUser(
  @Param('companyId') companyId: string,
  @Param('userId') userId: string,
  @CompanyId() requestingCompanyId: string,
  @Request() req,
) {
  return this.usersService.deleteCompanyUser(companyId, userId, requestingCompanyId, req.user.role, req.user.id);
}
```

Update `resetCompanyUserPassword` to add `@RequirePrivilege`:

```ts
@Post('companies/:companyId/:userId/reset-password')
@UseGuards(RolesGuard, PrivilegeGuard)
@Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
@RequirePrivilege('users', 'write')
@ApiOperation({ summary: "Reset a company user's password" })
resetCompanyUserPassword(
  @Param('companyId') companyId: string,
  @Param('userId') userId: string,
  @CompanyId() requestingCompanyId: string,
  @Request() req,
) {
  return this.usersService.resetCompanyUserPassword(companyId, userId, requestingCompanyId, req.user.role, req.user.id);
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd kioskly-api && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add kioskly-api/src/users/users.controller.ts
git commit -m "feat(users): apply RequirePrivilege to company user controller endpoints"
```

---

## Task 8: Apply `@RequirePrivilege` to brands, analytics, and companies controllers

**Files:**
- Modify: `kioskly-api/src/brands/brands.controller.ts`
- Modify: `kioskly-api/src/analytics/analytics.controller.ts`
- Modify: `kioskly-api/src/companies/companies.controller.ts`

- [ ] **Step 1: Update brands controller**

In `kioskly-api/src/brands/brands.controller.ts`, add imports:

```ts
import { PrivilegeGuard } from '../common/guards/privilege.guard';
import { RequirePrivilege } from '../common/decorators/require-privilege.decorator';
```

Update `findAll` — add `PrivilegeGuard` to the `@UseGuards` list and add `@RequirePrivilege`:

```ts
@Get()
@UseGuards(JwtAuthGuard, RolesGuard, PrivilegeGuard)
@Roles('PLATFORM_ADMIN', 'COMPANY_ADMIN')
@RequirePrivilege('brands', 'read')
@ApiBearerAuth()
@ApiOperation({ summary: 'List all brands for the requesting company' })
findAll(/* existing params unchanged */)
```

Update `findOne`:

```ts
@Get(':id')
@UseGuards(JwtAuthGuard, RolesGuard, PrivilegeGuard)
@Roles('PLATFORM_ADMIN', 'COMPANY_ADMIN')
@RequirePrivilege('brands', 'read')
```

Update `create`:

```ts
@Post()
@UseGuards(JwtAuthGuard, RolesGuard, PrivilegeGuard)
@Roles('PLATFORM_ADMIN', 'COMPANY_ADMIN')
@RequirePrivilege('brands', 'write')
```

Update `update`:

```ts
@Patch(':id')
@UseGuards(JwtAuthGuard, RolesGuard, PrivilegeGuard)
@Roles('PLATFORM_ADMIN', 'COMPANY_ADMIN')
@RequirePrivilege('brands', 'write')
```

Update `uploadLogo`:

```ts
@Post(':id/upload-logo')
@UseGuards(JwtAuthGuard, RolesGuard, PrivilegeGuard)
@Roles('PLATFORM_ADMIN', 'COMPANY_ADMIN')
@RequirePrivilege('brands', 'write')
```

(`DELETE /brands/:id` is `PLATFORM_ADMIN` only — leave it unchanged, no privilege check needed.)

- [ ] **Step 2: Update analytics controller**

In `kioskly-api/src/analytics/analytics.controller.ts`, add imports and apply the guard at class level since all methods require `analytics: read`:

```ts
import { PrivilegeGuard } from '../common/guards/privilege.guard';
import { RequirePrivilege } from '../common/decorators/require-privilege.decorator';
```

Update the class-level decorators:

```ts
@ApiTags('analytics')
@Controller('analytics/company')
@UseGuards(JwtAuthGuard, RolesGuard, PrivilegeGuard)
@Roles('COMPANY_ADMIN')
@RequirePrivilege('analytics', 'read')
@ApiBearerAuth()
export class AnalyticsController {
```

(No method-level changes needed.)

- [ ] **Step 3: Update companies controller**

In `kioskly-api/src/companies/companies.controller.ts`, add imports:

```ts
import { PrivilegeGuard } from '../common/guards/privilege.guard';
import { RequirePrivilege } from '../common/decorators/require-privilege.decorator';
```

Update `findOwn` (`GET /companies/me`):

```ts
@Get('me')
@UseGuards(JwtAuthGuard, RolesGuard, PrivilegeGuard)
@Roles('COMPANY_ADMIN')
@RequirePrivilege('settings', 'read')
@ApiBearerAuth()
@ApiOperation({ summary: 'Get own company (COMPANY_ADMIN)' })
findOwn(@CompanyId() companyId: string) {
  return this.companiesService.findOne(companyId);
}
```

Update `update` (`PATCH /companies/:id`):

```ts
@Patch(':id')
@UseGuards(JwtAuthGuard, RolesGuard, PrivilegeGuard)
@Roles('PLATFORM_ADMIN', 'COMPANY_ADMIN')
@RequirePrivilege('settings', 'write')
@ApiBearerAuth()
@ApiOperation({ summary: 'Update company' })
update(
  @Param('id') id: string,
  @Body() dto: UpdateCompanyDto,
  @Request() req,
) {
  return this.companiesService.update(id, dto, req.user.role);
}
```

Update `uploadLogo` for company:

```ts
@Post(':id/upload-logo')
@UseGuards(JwtAuthGuard, RolesGuard, PrivilegeGuard)
@Roles('PLATFORM_ADMIN', 'COMPANY_ADMIN')
@RequirePrivilege('settings', 'write')
```

- [ ] **Step 4: Verify TypeScript compilation**

```bash
cd kioskly-api && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add kioskly-api/src/brands/brands.controller.ts kioskly-api/src/analytics/analytics.controller.ts kioskly-api/src/companies/companies.controller.ts
git commit -m "feat(api): apply RequirePrivilege to brands, analytics, and settings endpoints"
```

---

## Task 9: Frontend — types, privilege helper, and API client

**Files:**
- Modify: `kioscify-company/types/index.ts`
- Create: `kioscify-company/lib/privileges.ts`
- Modify: `kioscify-company/lib/api.ts`

- [ ] **Step 1: Update `User` type**

In `kioscify-company/types/index.ts`, update the `User` interface to add `companyPrivileges`:

```ts
export type PrivilegeLevel = 'no_access' | 'read' | 'write' | 'all';
export type PrivilegeSection = 'brands' | 'analytics' | 'users' | 'settings';

export interface CompanyPrivileges {
  brands: PrivilegeLevel;
  analytics: PrivilegeLevel;
  users: PrivilegeLevel;
  settings: PrivilegeLevel;
}

export interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  isFirstLogin: boolean;
  mustChangePassword: boolean;
  companyId?: string;
  brandId?: string;
  createdAt: string;
  updatedAt: string;
  companyPrivileges?: CompanyPrivileges | null;
}
```

Also add a type for the create payload with privileges in `CompanyUserCreatePayload` (find this interface around line 168 in the types file):

```ts
export interface CompanyUserCreatePayload {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  companyPrivileges?: CompanyPrivileges;
}
```

- [ ] **Step 2: Create the frontend privilege helper**

Create `kioscify-company/lib/privileges.ts`:

```ts
import type { PrivilegeLevel, PrivilegeSection, CompanyPrivileges } from '@/types';

const RANK: Record<PrivilegeLevel, number> = { no_access: 0, read: 1, write: 2, all: 3 };

export function getPrivilege(section: PrivilegeSection): PrivilegeLevel {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!user?.companyPrivileges) return 'all'; // owner — null companyPrivileges = full access
    return (user.companyPrivileges[section] as PrivilegeLevel) ?? 'no_access';
  } catch {
    return 'no_access';
  }
}

export function hasPrivilege(section: PrivilegeSection, required: PrivilegeLevel): boolean {
  return RANK[getPrivilege(section)] >= RANK[required];
}

export const SECTIONS: PrivilegeSection[] = ['brands', 'analytics', 'users', 'settings'];

export const DEFAULT_PRIVILEGES: CompanyPrivileges = {
  brands: 'read',
  analytics: 'read',
  users: 'read',
  settings: 'read',
};

export const PRIVILEGE_LEVELS: PrivilegeLevel[] = ['no_access', 'read', 'write', 'all'];

export const PRIVILEGE_LABELS: Record<PrivilegeLevel, string> = {
  no_access: 'No Access',
  read: 'Read',
  write: 'Write',
  all: 'All',
};

export const SECTION_LABELS: Record<PrivilegeSection, string> = {
  brands: 'Brands',
  analytics: 'Analytics',
  users: 'Users',
  settings: 'Settings',
};
```

- [ ] **Step 3: Add `updateCompanyUserPrivileges` to API client**

In `kioscify-company/lib/api.ts`, add to the Users section:

```ts
async updateCompanyUserPrivileges(
  companyId: string,
  userId: string,
  companyPrivileges: import('@/types').CompanyPrivileges | null,
): Promise<import('@/types').User> {
  const { data } = await this.client.patch<import('@/types').User>(
    `/users/companies/${companyId}/${userId}`,
    { companyPrivileges },
  );
  return data;
}
```

- [ ] **Step 4: Verify TypeScript compilation**

```bash
cd kioscify-company && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add kioscify-company/types/index.ts kioscify-company/lib/privileges.ts kioscify-company/lib/api.ts
git commit -m "feat(company-portal): add privilege types, helper, and API client method"
```

---

## Task 10: Frontend — sidebar navigation gating

**Files:**
- Modify: `kioscify-company/app/(main)/layout.tsx`

- [ ] **Step 1: Filter navItems based on privileges**

In `kioscify-company/app/(main)/layout.tsx`, add the import at the top:

```ts
import { getPrivilege } from '@/lib/privileges';
import type { PrivilegeSection } from '@/types';
```

The `navItems` array is currently static. Replace it with a computed list inside `MainLayoutInner`:

Remove the top-level `navItems` constant and add this inside `MainLayoutInner`, after the `primaryColor` line:

```ts
const GATED_SECTIONS: Partial<Record<string, PrivilegeSection>> = {
  '/brands': 'brands',
  '/analytics': 'analytics',
  '/users': 'users',
  '/settings': 'settings',
};

const allNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/brands', label: 'Brands', icon: BookOpen },
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/users', label: 'Users', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const navItems = allNavItems.filter(item => {
  const section = GATED_SECTIONS[item.href];
  if (!section) return true; // Dashboard — always show
  return getPrivilege(section) !== 'no_access';
});
```

The `navItems` variable in the JSX render loop is now the filtered one — no other changes needed in the render.

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd kioscify-company && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add kioscify-company/app/(main)/layout.tsx
git commit -m "feat(company-portal): hide nav items for no_access sections"
```

---

## Task 11: Frontend — page-level gating (brands, analytics, settings)

**Files:**
- Modify: `kioscify-company/app/(main)/brands/page.tsx`
- Modify: `kioscify-company/app/(main)/brands/[brandId]/page.tsx`
- Modify: `kioscify-company/app/(main)/analytics/page.tsx`
- Modify: `kioscify-company/app/(main)/settings/page.tsx`

### Brands list page

- [ ] **Step 1: Add privilege gating to brands/page.tsx**

In `kioscify-company/app/(main)/brands/page.tsx`, add these imports:

```ts
import { useRouter } from 'next/navigation';
import { hasPrivilege, getPrivilege } from '@/lib/privileges';
```

At the top of `BrandsPage`, add:

```ts
const router = useRouter();
const brandsPrivilege = getPrivilege('brands');

useEffect(() => {
  if (brandsPrivilege === 'no_access') router.replace('/dashboard');
}, [brandsPrivilege, router]);
```

Find the "New Brand" / create button and wrap it conditionally:

```tsx
{hasPrivilege('brands', 'write') && (
  <button onClick={() => setShowForm(true)} /* existing className/style */>
    <Plus className="w-4 h-4" />
    New Brand
  </button>
)}
```

Find any edit buttons inside the brand cards or list and wrap with `{hasPrivilege('brands', 'write') && ...}`.

- [ ] **Step 2: Gate brands/[brandId]/page.tsx**

In `kioscify-company/app/(main)/brands/[brandId]/page.tsx`, add the same redirect and hide edit/save controls:

```ts
import { useRouter } from 'next/navigation';
import { hasPrivilege, getPrivilege } from '@/lib/privileges';
```

```ts
const router = useRouter();
const brandsPrivilege = getPrivilege('brands');

useEffect(() => {
  if (brandsPrivilege === 'no_access') router.replace('/dashboard');
}, [brandsPrivilege, router]);
```

Wrap all save/update/edit buttons with `{hasPrivilege('brands', 'write') && ...}`.

### Analytics page

- [ ] **Step 3: Add privilege gating to analytics/page.tsx**

In `kioscify-company/app/(main)/analytics/page.tsx`, add:

```ts
import { useRouter } from 'next/navigation';
import { getPrivilege } from '@/lib/privileges';
```

```ts
const router = useRouter();
const analyticsPrivilege = getPrivilege('analytics');

useEffect(() => {
  if (analyticsPrivilege === 'no_access') router.replace('/dashboard');
}, [analyticsPrivilege, router]);
```

(Analytics is read-only — no action buttons to gate.)

### Settings page

- [ ] **Step 4: Add privilege gating to settings/page.tsx**

In `kioscify-company/app/(main)/settings/page.tsx`, add:

```ts
import { useRouter } from 'next/navigation';
import { hasPrivilege, getPrivilege } from '@/lib/privileges';
```

```ts
const router = useRouter();
const settingsPrivilege = getPrivilege('settings');

useEffect(() => {
  if (settingsPrivilege === 'no_access') router.replace('/dashboard');
}, [settingsPrivilege, router]);
```

Wrap all save/update buttons with `{hasPrivilege('settings', 'write') && ...}`.

- [ ] **Step 5: Commit**

```bash
git add kioscify-company/app/(main)/brands/page.tsx kioscify-company/app/(main)/brands kioscify-company/app/(main)/analytics/page.tsx kioscify-company/app/(main)/settings/page.tsx
git commit -m "feat(company-portal): add page-level privilege gating for brands, analytics, settings"
```

---

## Task 12: Frontend — `PrivilegesGrid` component

**Files:**
- Create: `kioscify-company/app/(main)/users/components/PrivilegesGrid.tsx`

- [ ] **Step 1: Create the component**

Create `kioscify-company/app/(main)/users/components/PrivilegesGrid.tsx`:

```tsx
'use client';

import type { CompanyPrivileges, PrivilegeLevel, PrivilegeSection } from '@/types';
import {
  SECTIONS,
  PRIVILEGE_LEVELS,
  PRIVILEGE_LABELS,
  SECTION_LABELS,
  DEFAULT_PRIVILEGES,
} from '@/lib/privileges';

interface Props {
  value: CompanyPrivileges;
  onChange: (updated: CompanyPrivileges) => void;
  primaryColor?: string;
}

export default function PrivilegesGrid({ value, onChange, primaryColor = '#ea580c' }: Props) {
  const handleChange = (section: PrivilegeSection, level: PrivilegeLevel) => {
    onChange({ ...value, [section]: level });
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-28">Section</th>
            {PRIVILEGE_LEVELS.map(level => (
              <th key={level} className="text-center px-2 py-2.5 font-medium text-gray-600">
                {PRIVILEGE_LABELS[level]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {/* Dashboard — always visible, not editable */}
          <tr className="bg-gray-50 opacity-60">
            <td className="px-4 py-2.5 text-gray-500 text-xs">Dashboard</td>
            <td colSpan={4} className="px-4 py-2.5 text-xs text-gray-400 text-center">Always visible</td>
          </tr>
          {SECTIONS.map(section => (
            <tr key={section}>
              <td className="px-4 py-2.5 text-gray-700 font-medium">
                {SECTION_LABELS[section]}
              </td>
              {PRIVILEGE_LEVELS.map(level => (
                <td key={level} className="text-center px-2 py-2.5">
                  <input
                    type="radio"
                    name={`privilege-${section}`}
                    value={level}
                    checked={value[section] === level}
                    onChange={() => handleChange(section, level)}
                    className="cursor-pointer"
                    style={{ accentColor: primaryColor }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { DEFAULT_PRIVILEGES };
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd kioscify-company && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add kioscify-company/app/(main)/users/components/PrivilegesGrid.tsx
git commit -m "feat(company-portal): add PrivilegesGrid component"
```

---

## Task 13: Frontend — `EditPrivilegesModal` component

**Files:**
- Create: `kioscify-company/app/(main)/users/components/EditPrivilegesModal.tsx`

- [ ] **Step 1: Create the modal**

Create `kioscify-company/app/(main)/users/components/EditPrivilegesModal.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { User, CompanyPrivileges } from '@/types';
import { DEFAULT_PRIVILEGES } from '@/lib/privileges';
import PrivilegesGrid from './PrivilegesGrid';

interface Props {
  user: User;
  companyId: string;
  primaryColor?: string;
  onClose: () => void;
  onSaved: (updated: User) => void;
  onSave: (companyId: string, userId: string, companyPrivileges: CompanyPrivileges | null) => Promise<User>;
}

export default function EditPrivilegesModal({ user, companyId, primaryColor = '#ea580c', onClose, onSaved, onSave }: Props) {
  const initial: CompanyPrivileges = user.companyPrivileges ?? { ...DEFAULT_PRIVILEGES };
  const [privileges, setPrivileges] = useState<CompanyPrivileges>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      const updated = await onSave(companyId, user.id, privileges);
      onSaved(updated);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message || 'Failed to update privileges');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="font-semibold text-gray-900">Edit Permissions</h2>
            <p className="text-xs text-gray-400 mt-0.5">{user.firstName} {user.lastName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
          <PrivilegesGrid value={privileges} onChange={setPrivileges} primaryColor={primaryColor} />
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading}
            className="flex-1 py-2 text-white rounded-lg text-sm font-medium hover:brightness-90 disabled:opacity-50"
            style={{ backgroundColor: primaryColor }}
          >
            {loading ? 'Saving...' : 'Save Permissions'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add kioscify-company/app/(main)/users/components/EditPrivilegesModal.tsx
git commit -m "feat(company-portal): add EditPrivilegesModal component"
```

---

## Task 14: Frontend — wire privileges into users page

**Files:**
- Modify: `kioscify-company/app/(main)/users/page.tsx`

- [ ] **Step 1: Add imports and state**

In `kioscify-company/app/(main)/users/page.tsx`, add these imports:

```ts
import { useRouter } from 'next/navigation';
import { hasPrivilege, getPrivilege, DEFAULT_PRIVILEGES } from '@/lib/privileges';
import type { CompanyPrivileges } from '@/types';
import PrivilegesGrid from './components/PrivilegesGrid';
import EditPrivilegesModal from './components/EditPrivilegesModal';
import { ShieldCheck } from 'lucide-react';
```

Inside `UsersPage`, add new state:

```ts
const router = useRouter();
const usersPrivilege = getPrivilege('users');
const [newUserPrivileges, setNewUserPrivileges] = useState<CompanyPrivileges>({ ...DEFAULT_PRIVILEGES });
const [editingUser, setEditingUser] = useState<User | null>(null);
```

- [ ] **Step 2: Add `no_access` redirect**

After the existing `currentUser` block, add:

```ts
useEffect(() => {
  if (usersPrivilege === 'no_access') router.replace('/dashboard');
}, [usersPrivilege, router]);
```

- [ ] **Step 3: Gate "New User" button**

Find the "New User" button (around line 134) and wrap it:

```tsx
{hasPrivilege('users', 'write') && (
  <button
    onClick={() => setShowForm(true)}
    className="flex items-center gap-2 px-4 py-2 text-white rounded-lg hover:brightness-90 text-sm font-medium transition-colors"
    style={{ backgroundColor: 'var(--company-primary, #ea580c)' }}
  >
    <Plus className="w-4 h-4" />
    New User
  </button>
)}
```

- [ ] **Step 4: Add PrivilegesGrid to create user modal**

In the create user modal form (after the username field and before the role note paragraph), add:

```tsx
<div>
  <label className="block text-sm font-medium text-gray-700 mb-2">Permissions</label>
  <PrivilegesGrid
    value={newUserPrivileges}
    onChange={setNewUserPrivileges}
    primaryColor="var(--company-primary, #ea580c)"
  />
</div>
```

Pass `newUserPrivileges` to the create call. In `handleCreate`, update the `api.createCompanyUser` call:

```ts
const result = await api.createCompanyUser(company!.id, {
  firstName,
  lastName,
  email,
  username,
  companyPrivileges: newUserPrivileges,
});
```

Reset `newUserPrivileges` after successful create:

```ts
setNewUserPrivileges({ ...DEFAULT_PRIVILEGES });
```

- [ ] **Step 5: Add edit privileges button and modal to user rows**

The current user row renders actions at the right. Find the actions block (around line 254, inside `currentUser?.id !== user.id` check). Add the edit privileges button — only visible when the current user can manage privileges (`users: all`):

```tsx
{hasPrivilege('users', 'all') && (
  <button
    onClick={() => setEditingUser(user)}
    title="Edit permissions"
    className="p-1.5 text-gray-400 hover:text-blue-500 rounded"
  >
    <ShieldCheck className="w-4 h-4" />
  </button>
)}
```

Also gate the existing destructive actions (reset password, disable, remove) based on privilege level. Wrap the reset-password and disable/enable buttons with `{hasPrivilege('users', 'write') && ...}`:

```tsx
{hasPrivilege('users', 'write') && (
  <button onClick={() => handleResetPassword(user)} title="Reset password" className="p-1.5 text-gray-400 hover:text-amber-500 rounded">
    <KeyRound className="w-4 h-4" />
  </button>
)}
{hasPrivilege('users', 'write') && !user.isFirstLogin && (
  <button onClick={() => handleToggleActive(user)} title="Disable account" className="p-1.5 text-gray-400 hover:text-gray-600 rounded">
    <UserX className="w-4 h-4" />
  </button>
)}
{hasPrivilege('users', 'all') && user.isFirstLogin && (
  <button onClick={() => handleRemoveUser(user)} title="Remove pending user" className="p-1.5 text-gray-400 hover:text-red-500 rounded">
    <Trash2 className="w-4 h-4" />
  </button>
)}
{!user.isActive && hasPrivilege('users', 'write') && (
  <button onClick={() => handleToggleActive(user)} title="Enable account" className="p-1.5 text-gray-400 hover:text-gray-600 rounded">
    <UserCheck className="w-4 h-4" />
  </button>
)}
```

(Remove the old ungated versions of these buttons.)

- [ ] **Step 6: Render EditPrivilegesModal**

Below the existing modals (after the create form modal closing `}`), add:

```tsx
{editingUser && (
  <EditPrivilegesModal
    user={editingUser}
    companyId={company!.id}
    primaryColor="var(--company-primary, #ea580c)"
    onClose={() => setEditingUser(null)}
    onSaved={(updated) => {
      setUsers(prev => prev.map(u => u.id === updated.id ? { ...u, companyPrivileges: updated.companyPrivileges } : u));
      setEditingUser(null);
    }}
    onSave={(companyId, userId, companyPrivileges) =>
      api.updateCompanyUserPrivileges(companyId, userId, companyPrivileges)
    }
  />
)}
```

- [ ] **Step 7: Verify TypeScript compilation**

```bash
cd kioscify-company && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add kioscify-company/app/(main)/users/page.tsx
git commit -m "feat(company-portal): privilege gating and assignment UI on users page"
```

---

## Task 15: Smoke test end-to-end

- [ ] **Step 1: Start API and company portal**

In two terminals:

```bash
# Terminal 1
npm run api:dev

# Terminal 2
npm run company:dev
```

- [ ] **Step 2: Log in as owner admin**

Go to `http://kioscify.localhost` (or your local URL), log in with an existing company admin. All nav items should appear. The Users page should show all users.

- [ ] **Step 3: Create a restricted user**

Click "New User", fill in the form, and in the Permissions grid set: Brands=read, Analytics=no_access, Users=no_access, Settings=read. Create the user and copy the temporary password.

- [ ] **Step 4: Log in as the restricted user**

In a new browser window (or incognito), log in as the restricted user after changing their password. Verify:
- Analytics and Users nav links are absent
- Navigating directly to `/analytics` or `/users` redirects to `/dashboard`
- On `/brands`, the "New Brand" button is absent (read-only)
- On `/settings`, the save button is absent (read-only)

- [ ] **Step 5: Verify API enforcement**

While logged in as the restricted user, open the browser console and try:

```js
fetch('/api/v1/analytics/company/overview?startDate=2026-01-01&endDate=2026-12-31', {
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
}).then(r => r.status).then(console.log)
```

Expected: `403` — the API enforces the privilege regardless of UI state.

- [ ] **Step 6: Test privilege editing**

Log back in as the owner admin. On the Users page, click the shield icon on the restricted user's row. Change Analytics to `read`. Save. Log in again as the restricted user — Analytics should now appear in the nav.

- [ ] **Step 7: Run API tests**

```bash
cd kioskly-api && npm run test
```

Expected: all tests pass
