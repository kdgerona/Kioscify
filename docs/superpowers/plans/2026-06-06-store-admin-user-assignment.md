# Store Admin User Management & Cross-Store Assignment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow STORE_ADMINs to see all users with access to their store (primary + assigned) and — when they manage multiple stores — assign existing users from their managed stores pool to other stores they control.

**Architecture:** A shared `getManagedStoreIds(userId)` private helper drives all scope enforcement across three service methods. Frontend detects multi-store status on page load and conditionally renders an `AssignUserModal` with debounced search calling a new scoped endpoint.

**Tech Stack:** NestJS + Prisma + MongoDB (backend), Jest + `@nestjs/testing` (backend tests), Next.js 15 App Router + Radix UI + Tailwind CSS (frontend)

**Spec:** `docs/superpowers/specs/2026-06-06-store-admin-user-assignment-design.md`

---

## File Map

**Backend — `kioskly-api/src/users/`**
- `users.service.ts` — add `getManagedStoreIds`, `upsertStoreAccess`; update `getStoreUsers`, `assignUserToStore`, `revokeStoreAccess`; add `getAssignablePool`
- `users.controller.ts` — update `getStoreAccess` (self-check + STORE_ADMIN role), add `getAssignablePool` route, add STORE_ADMIN to assign/revoke routes
- `users.service.spec.ts` (create) — unit tests for all modified/added service methods

**Frontend — `kioskly-admin/`**
- `types/index.ts` — extend `User` type, add `AssignableUser`, `StoreAccess`
- `lib/api.ts` — add `getMyStoreAccess`, `getAssignablePool`; update `getStoreUsers` return type
- `app/(main)/users/AssignUserModal.tsx` (create) — modal with debounced search + role picker
- `app/(main)/users/page.tsx` — multi-store detection, updated user list, assign button

---

## Task 1: Add `getManagedStoreIds` private helper

This is called by three service methods. It queries the database for the user's actual primary `tenantId` plus all active `UserStoreAccess` records, returning a deduplicated list of store IDs the user manages.

**Files:**
- Modify: `kioskly-api/src/users/users.service.ts`
- Create: `kioskly-api/src/users/users.service.spec.ts`

- [ ] **Step 1: Create the test file**

```ts
// kioskly-api/src/users/users.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';

const mockPrisma = {
  user: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  userStoreAccess: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  tenant: {
    findUnique: jest.fn(),
  },
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuthService, useValue: { generateSecurePassword: jest.fn().mockReturnValue('tmp-pw') } },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  describe('getManagedStoreIds', () => {
    it('returns primary tenantId plus UserStoreAccess store IDs', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ tenantId: 'store-a' });
      mockPrisma.userStoreAccess.findMany.mockResolvedValue([
        { tenantId: 'store-b' },
        { tenantId: 'store-c' },
      ]);

      const result = await (service as any).getManagedStoreIds('user-1');

      expect(result).toHaveLength(3);
      expect(result).toEqual(expect.arrayContaining(['store-a', 'store-b', 'store-c']));
    });

    it('deduplicates when primary tenantId appears in access records', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ tenantId: 'store-a' });
      mockPrisma.userStoreAccess.findMany.mockResolvedValue([{ tenantId: 'store-a' }]);

      const result = await (service as any).getManagedStoreIds('user-1');

      expect(result).toHaveLength(1);
      expect(result).toEqual(['store-a']);
    });

    it('returns empty array when user has no tenantId and no access records', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ tenantId: null });
      mockPrisma.userStoreAccess.findMany.mockResolvedValue([]);

      const result = await (service as any).getManagedStoreIds('user-1');

      expect(result).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd kioskly-api && npm test -- --testPathPattern=users.service.spec --no-coverage
```

Expected: FAIL — `getManagedStoreIds is not a function` (method doesn't exist yet).

- [ ] **Step 3: Add the helper to `users.service.ts`**

At the bottom of the class (before the closing `}`), add:

```ts
  private async getManagedStoreIds(userId: string): Promise<string[]> {
    const [user, accessRecords] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { tenantId: true } }),
      this.prisma.userStoreAccess.findMany({ where: { userId, isActive: true }, select: { tenantId: true } }),
    ]);
    const ids = accessRecords.map(r => r.tenantId);
    if (user?.tenantId) ids.push(user.tenantId);
    return [...new Set(ids)];
  }
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd kioskly-api && npm test -- --testPathPattern=users.service.spec --no-coverage
```

Expected: PASS — all 3 `getManagedStoreIds` tests green.

- [ ] **Step 5: Commit**

```bash
git add kioskly-api/src/users/users.service.ts kioskly-api/src/users/users.service.spec.ts
git commit -m "feat(users): add getManagedStoreIds helper + unit tests"
```

---

## Task 2: Update `getStoreUsers` — fix scope check + include assigned users

The current scope check (`storeId !== requestingTenantId`) blocks a STORE_ADMIN from viewing secondary stores they manage. The query currently returns only primary users — it needs to union `UserStoreAccess` users too. Each user in the response gains `isAssigned`, `assignedRole`, and `primaryStore` fields.

**Files:**
- Modify: `kioskly-api/src/users/users.service.ts`
- Modify: `kioskly-api/src/users/users.controller.ts`
- Modify: `kioskly-api/src/users/users.service.spec.ts`

- [ ] **Step 1: Add failing tests**

In `users.service.spec.ts`, add a new describe block after the `getManagedStoreIds` block:

```ts
  describe('getStoreUsers', () => {
    it('throws ForbiddenException when STORE_ADMIN does not manage the store', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ tenantId: 'store-x' });
      mockPrisma.userStoreAccess.findMany.mockResolvedValue([]);

      await expect(
        service.getStoreUsers('store-other', 'STORE_ADMIN', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('includes primary users with isAssigned=false', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ tenantId: 'store-a' });
      mockPrisma.userStoreAccess.findMany
        .mockResolvedValueOnce([])  // getManagedStoreIds call
        .mockResolvedValueOnce([]);  // assigned-users-in-store call

      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'u1', username: 'alice', firstName: 'Alice', lastName: 'A', email: 'a@a.com',
          role: 'CASHIER', isActive: true, isFirstLogin: false, createdAt: new Date(), tenant: null },
      ]);

      const result = await service.getStoreUsers('store-a', 'STORE_ADMIN', 'user-1');

      expect(result[0].isAssigned).toBe(false);
      expect(result[0].id).toBe('u1');
    });

    it('includes assigned users with isAssigned=true and assignedRole from UserStoreAccess', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ tenantId: 'store-a' });
      mockPrisma.userStoreAccess.findMany
        .mockResolvedValueOnce([{ tenantId: 'store-b' }])  // getManagedStoreIds
        .mockResolvedValueOnce([  // assigned users in store
          {
            userId: 'u2',
            role: 'STORE_ADMIN',
            user: { id: 'u2', username: 'bob', firstName: 'Bob', lastName: 'B', email: 'b@b.com',
                    role: 'CASHIER', isActive: true, isFirstLogin: false, createdAt: new Date(),
                    tenant: { id: 'store-b', name: 'Store B', slug: 'store-b' } },
          },
        ]);

      mockPrisma.user.findMany.mockResolvedValue([]);  // no primary users

      const result = await service.getStoreUsers('store-a', 'STORE_ADMIN', 'user-1');

      expect(result[0].isAssigned).toBe(true);
      expect(result[0].assignedRole).toBe('STORE_ADMIN');
      expect(result[0].primaryStore).toEqual({ id: 'store-b', name: 'Store B', slug: 'store-b' });
    });
  });
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd kioskly-api && npm test -- --testPathPattern=users.service.spec --no-coverage
```

Expected: FAIL — `getStoreUsers` signature mismatch and logic doesn't match.

- [ ] **Step 3: Replace `getStoreUsers` in `users.service.ts`**

Replace the entire existing `getStoreUsers` method (lines 22–41):

```ts
  async getStoreUsers(storeId: string, requestingRole: string, requestingUserId: string) {
    if (requestingRole !== 'PLATFORM_ADMIN') {
      const managedIds = await this.getManagedStoreIds(requestingUserId);
      if (!managedIds.includes(storeId)) throw new ForbiddenException('Access denied');
    }

    const userSelect = {
      id: true, username: true, firstName: true, lastName: true,
      email: true, role: true, isActive: true, isFirstLogin: true, createdAt: true,
      tenant: { select: { id: true, name: true, slug: true } },
    };

    const [primaryUsers, accessRecords] = await Promise.all([
      this.prisma.user.findMany({
        where: { tenantId: storeId },
        select: userSelect,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.userStoreAccess.findMany({
        where: { tenantId: storeId, isActive: true },
        include: { user: { select: userSelect } },
      }),
    ]);

    const primaryIds = new Set(primaryUsers.map(u => u.id));

    const assignedUsers = accessRecords
      .filter(a => !primaryIds.has(a.userId))
      .map(a => ({
        ...a.user,
        isAssigned: true as const,
        assignedRole: a.role,
        primaryStore: a.user.tenant,
      }));

    return [
      ...primaryUsers.map(u => ({ ...u, isAssigned: false as const, assignedRole: undefined, primaryStore: undefined })),
      ...assignedUsers,
    ];
  }
```

- [ ] **Step 4: Update the controller call to pass `req.user.id`**

In `users.controller.ts`, replace the `getStoreUsers` handler (lines 37–42):

```ts
  @Get('stores/:storeId')
  @UseGuards(RolesGuard)
  @Roles('STORE_ADMIN', 'PLATFORM_ADMIN')
  @ApiOperation({ summary: 'List users in a store' })
  getStoreUsers(@Param('storeId') storeId: string, @Request() req) {
    return this.usersService.getStoreUsers(storeId, req.user.role, req.user.id);
  }
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd kioskly-api && npm test -- --testPathPattern=users.service.spec --no-coverage
```

Expected: PASS — all tests green.

- [ ] **Step 6: Commit**

```bash
git add kioskly-api/src/users/users.service.ts kioskly-api/src/users/users.controller.ts kioskly-api/src/users/users.service.spec.ts
git commit -m "feat(users): update getStoreUsers to include assigned users and fix STORE_ADMIN scope"
```

---

## Task 3: Allow STORE_ADMIN to query their own store access

`GET /users/:userId/stores` is currently COMPANY_ADMIN / PLATFORM_ADMIN only. The frontend needs this to detect multi-store status. Allow STORE_ADMIN to call it only for their own `userId`.

**Files:**
- Modify: `kioskly-api/src/users/users.controller.ts`

- [ ] **Step 1: Update the `getStoreAccess` handler**

In `users.controller.ts`, replace the `getStoreAccess` handler (lines 131–137):

```ts
  @Get(':userId/stores')
  @UseGuards(RolesGuard)
  @Roles('STORE_ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiOperation({ summary: 'List all stores a user has access to' })
  getStoreAccess(@Param('userId') userId: string, @Request() req) {
    if (req.user.role === 'STORE_ADMIN' && userId !== req.user.id) {
      throw new ForbiddenException('STORE_ADMIN can only query their own store access');
    }
    return this.usersService.getStoreAccess(userId);
  }
```

Make sure `ForbiddenException` is imported at the top of the controller:

```ts
import { Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, Request, HttpCode, HttpStatus, ForbiddenException } from '@nestjs/common';
```

- [ ] **Step 2: Verify existing tests still pass**

```bash
cd kioskly-api && npm test -- --testPathPattern=users.service.spec --no-coverage
```

Expected: PASS — no regressions.

- [ ] **Step 3: Commit**

```bash
git add kioskly-api/src/users/users.controller.ts
git commit -m "feat(users): allow STORE_ADMIN to query their own store access"
```

---

## Task 4: Add `getAssignablePool` service method + endpoint

Returns users the requesting STORE_ADMIN can assign to a given store: users across all stores they manage, excluding anyone already in the target store, filtered by an optional search string.

**Files:**
- Modify: `kioskly-api/src/users/users.service.ts`
- Modify: `kioskly-api/src/users/users.controller.ts`
- Modify: `kioskly-api/src/users/users.service.spec.ts`

- [ ] **Step 1: Add failing tests**

In `users.service.spec.ts`, add after the `getStoreUsers` describe block:

```ts
  describe('getAssignablePool', () => {
    it('throws ForbiddenException when STORE_ADMIN does not manage the target store', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ tenantId: 'store-x' });
      mockPrisma.userStoreAccess.findMany.mockResolvedValue([]);

      await expect(
        service.getAssignablePool('store-other', 'user-1', 'STORE_ADMIN', ''),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns users from managed stores excluding those already in the target store', async () => {
      // getManagedStoreIds: user-1 manages store-a and store-b
      mockPrisma.user.findUnique.mockResolvedValue({ tenantId: 'store-a' });
      mockPrisma.userStoreAccess.findMany
        .mockResolvedValueOnce([{ tenantId: 'store-b' }])  // getManagedStoreIds
        .mockResolvedValueOnce([]);                          // assigned users in managed stores

      // Pool: user-2 in store-b
      mockPrisma.user.findMany
        .mockResolvedValueOnce([  // primary users in managed stores
          { id: 'u2', username: 'bob', firstName: 'Bob', lastName: 'B',
            role: 'CASHIER', tenant: { id: 'store-b', name: 'Store B', slug: 'store-b' } },
        ])
        .mockResolvedValueOnce([])  // existing primary users in target store-a
        .mockResolvedValueOnce([   // final filtered query
          { id: 'u2', username: 'bob', firstName: 'Bob', lastName: 'B',
            role: 'CASHIER', tenant: { id: 'store-b', name: 'Store B', slug: 'store-b' } },
        ]);

      // existing assigned in store-a: none
      mockPrisma.userStoreAccess.findMany
        .mockResolvedValueOnce([]);  // existing assigned in target store

      const result = await service.getAssignablePool('store-a', 'user-1', 'STORE_ADMIN', '');

      expect(result).toHaveLength(1);
      expect(result[0].username).toBe('bob');
    });
  });
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd kioskly-api && npm test -- --testPathPattern=users.service.spec --no-coverage
```

Expected: FAIL — `getAssignablePool is not a function`.

- [ ] **Step 3: Add `getAssignablePool` to `users.service.ts`**

Add after `getCompanyUsers` and before the `getCompanyAllUsers` method:

```ts
  async getAssignablePool(
    storeId: string,
    requestingUserId: string,
    requestingRole: string,
    query: string,
  ) {
    const managedIds = await this.getManagedStoreIds(requestingUserId);

    if (requestingRole !== 'PLATFORM_ADMIN' && !managedIds.includes(storeId)) {
      throw new ForbiddenException('Access denied');
    }

    // Collect all user IDs in the managed pool
    const [primaryInManaged, assignedInManaged] = await Promise.all([
      this.prisma.user.findMany({
        where: { tenantId: { in: managedIds } },
        select: { id: true },
      }),
      this.prisma.userStoreAccess.findMany({
        where: { tenantId: { in: managedIds }, isActive: true },
        select: { userId: true },
      }),
    ]);

    const poolIds = [...new Set([
      ...primaryInManaged.map(u => u.id),
      ...assignedInManaged.map(a => a.userId),
    ])];

    if (poolIds.length === 0) return [];

    // Collect user IDs already in the target store
    const [existingPrimary, existingAssigned] = await Promise.all([
      this.prisma.user.findMany({ where: { tenantId: storeId }, select: { id: true } }),
      this.prisma.userStoreAccess.findMany({ where: { tenantId: storeId, isActive: true }, select: { userId: true } }),
    ]);
    const excludedIds = new Set([
      ...existingPrimary.map(u => u.id),
      ...existingAssigned.map(a => a.userId),
    ]);

    const eligibleIds = poolIds.filter(id => !excludedIds.has(id));
    if (eligibleIds.length === 0) return [];

    return this.prisma.user.findMany({
      where: {
        id: { in: eligibleIds },
        isActive: true,
        ...(query ? {
          OR: [
            { username: { contains: query } },
            { firstName: { contains: query } },
            { lastName: { contains: query } },
          ],
        } : {}),
      },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        tenant: { select: { id: true, name: true, slug: true } },
      },
      take: 20,
    });
  }
```

- [ ] **Step 4: Add the controller route**

In `users.controller.ts`, add this route immediately after the `getStoreUsers` handler (after line 42, before `createStoreUser`). This must be declared before `PATCH stores/:storeId/:userId` to avoid NestJS route shadowing:

```ts
  @Get('stores/:storeId/assignable-pool')
  @UseGuards(RolesGuard)
  @Roles('STORE_ADMIN', 'PLATFORM_ADMIN')
  @ApiOperation({ summary: 'Get users assignable to a store (scoped to managed stores)' })
  getAssignablePool(
    @Param('storeId') storeId: string,
    @Query('q') query: string,
    @Request() req,
  ) {
    return this.usersService.getAssignablePool(storeId, req.user.id, req.user.role, query ?? '');
  }
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd kioskly-api && npm test -- --testPathPattern=users.service.spec --no-coverage
```

Expected: PASS — all tests green.

- [ ] **Step 6: Commit**

```bash
git add kioskly-api/src/users/users.service.ts kioskly-api/src/users/users.controller.ts kioskly-api/src/users/users.service.spec.ts
git commit -m "feat(users): add getAssignablePool endpoint for STORE_ADMIN cross-store assignment"
```

---

## Task 5: Extend `assignUserToStore` for STORE_ADMIN

Add STORE_ADMIN to the assign endpoint. Extract the existing upsert logic into a private `upsertStoreAccess` helper, then add a STORE_ADMIN-specific path that verifies the target store and user are both in the admin's managed pool.

**Files:**
- Modify: `kioskly-api/src/users/users.service.ts`
- Modify: `kioskly-api/src/users/users.controller.ts`
- Modify: `kioskly-api/src/users/users.service.spec.ts`

- [ ] **Step 1: Add failing tests**

In `users.service.spec.ts`, add after the `getAssignablePool` describe block:

```ts
  describe('assignUserToStore (STORE_ADMIN path)', () => {
    it('throws ForbiddenException when target store is not in managed stores', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'store-other', companyId: 'co-1' });
      mockPrisma.user.findUnique.mockResolvedValue({ tenantId: 'store-a' });
      mockPrisma.userStoreAccess.findMany.mockResolvedValue([]);

      await expect(
        service.assignUserToStore(
          'store-other',
          { username: 'bob', role: 'CASHIER' },
          'co-1',
          'STORE_ADMIN',
          'user-1',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when target user is not in managed pool', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'store-a', companyId: 'co-1' });
      mockPrisma.user.findUnique.mockResolvedValue({ tenantId: 'store-a' });
      mockPrisma.userStoreAccess.findMany
        .mockResolvedValueOnce([])  // getManagedStoreIds
        .mockResolvedValueOnce([]); // pool check via UserStoreAccess

      mockPrisma.user.findFirst.mockResolvedValue(
        { id: 'u-bob', username: 'bob', tenantId: 'store-z', isActive: true },
      );

      await expect(
        service.assignUserToStore(
          'store-a',
          { username: 'bob', role: 'CASHIER' },
          'co-1',
          'STORE_ADMIN',
          'user-1',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('creates a UserStoreAccess record when all checks pass', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'store-a', companyId: 'co-1' });
      // getManagedStoreIds: user-1 manages store-a and store-b
      mockPrisma.user.findUnique.mockResolvedValue({ tenantId: 'store-a' });
      mockPrisma.userStoreAccess.findMany
        .mockResolvedValueOnce([{ tenantId: 'store-b' }])  // getManagedStoreIds
        .mockResolvedValueOnce([]);                          // pool check (no existing access)

      mockPrisma.user.findFirst.mockResolvedValue(
        { id: 'u-bob', username: 'bob', tenantId: 'store-b', isActive: true },
      );

      mockPrisma.userStoreAccess.findFirst.mockResolvedValue(null);
      mockPrisma.userStoreAccess.create.mockResolvedValue({ id: 'access-1' });

      const result = await service.assignUserToStore(
        'store-a',
        { username: 'bob', role: 'CASHIER' },
        'co-1',
        'STORE_ADMIN',
        'user-1',
      );

      expect(mockPrisma.userStoreAccess.create).toHaveBeenCalledWith({
        data: { userId: 'u-bob', tenantId: 'store-a', role: 'CASHIER' },
      });
      expect(result).toEqual({ id: 'access-1' });
    });
  });
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd kioskly-api && npm test -- --testPathPattern=users.service.spec --no-coverage
```

Expected: FAIL — `assignUserToStore` signature mismatch.

- [ ] **Step 3: Replace `assignUserToStore` and add `upsertStoreAccess` in `users.service.ts`**

Replace the entire existing `assignUserToStore` method with:

```ts
  async assignUserToStore(
    storeId: string,
    dto: { username: string; role: 'STORE_ADMIN' | 'CASHIER' },
    requestingCompanyId: string,
    requestingRole: string,
    requestingUserId?: string,
  ) {
    const store = await this.prisma.tenant.findUnique({
      where: { id: storeId },
      select: { id: true, companyId: true },
    });
    if (!store) throw new NotFoundException('Store not found');

    if (requestingRole === 'STORE_ADMIN') {
      const managedIds = await this.getManagedStoreIds(requestingUserId!);
      if (!managedIds.includes(storeId)) throw new ForbiddenException('Access denied');

      const user = await this.prisma.user.findFirst({
        where: { username: dto.username, companyId: store.companyId, isActive: true },
      });
      if (!user) throw new NotFoundException(`User "${dto.username}" not found`);

      const inPool = managedIds.includes(user.tenantId ?? '') ||
        !!(await this.prisma.userStoreAccess.findFirst({
          where: { userId: user.id, tenantId: { in: managedIds }, isActive: true },
        }));
      if (!inPool) throw new ForbiddenException('User not in your managed stores');

      return this.upsertStoreAccess(user.id, storeId, dto.role);
    }

    // COMPANY_ADMIN / PLATFORM_ADMIN path (unchanged)
    if (requestingRole !== 'PLATFORM_ADMIN' && store.companyId !== requestingCompanyId) {
      throw new ForbiddenException('Access denied');
    }

    const user = await this.prisma.user.findFirst({
      where: { username: dto.username, companyId: store.companyId, isActive: true },
    });
    if (!user) throw new NotFoundException(`User "${dto.username}" not found in this company`);

    return this.upsertStoreAccess(user.id, storeId, dto.role);
  }

  private async upsertStoreAccess(userId: string, storeId: string, role: 'STORE_ADMIN' | 'CASHIER') {
    const existing = await this.prisma.userStoreAccess.findFirst({
      where: { userId, tenantId: storeId },
    });
    if (existing) {
      if (existing.isActive) throw new ConflictException('User already has access to this store');
      return this.prisma.userStoreAccess.update({
        where: { id: existing.id },
        data: { isActive: true, role: role as any },
      });
    }
    return this.prisma.userStoreAccess.create({
      data: { userId, tenantId: storeId, role: role as any },
    });
  }
```

- [ ] **Step 4: Update the controller to add STORE_ADMIN and pass `req.user.id`**

In `users.controller.ts`, replace the `assignUserToStore` handler (lines 139–150):

```ts
  @Post('stores/:storeId/assign')
  @UseGuards(RolesGuard)
  @Roles('STORE_ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiOperation({ summary: 'Link an existing user to a store' })
  assignUserToStore(
    @Param('storeId') storeId: string,
    @Body() dto: { username: string; role: 'STORE_ADMIN' | 'CASHIER' },
    @CompanyId() companyId: string,
    @Request() req,
  ) {
    return this.usersService.assignUserToStore(storeId, dto, companyId, req.user.role, req.user.id);
  }
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd kioskly-api && npm test -- --testPathPattern=users.service.spec --no-coverage
```

Expected: PASS — all tests green.

- [ ] **Step 6: Commit**

```bash
git add kioskly-api/src/users/users.service.ts kioskly-api/src/users/users.controller.ts kioskly-api/src/users/users.service.spec.ts
git commit -m "feat(users): allow STORE_ADMIN to assign users from managed stores"
```

---

## Task 6: Extend `revokeStoreAccess` for STORE_ADMIN

Allow STORE_ADMIN to revoke a cross-store assignment, with a guard preventing revocation of a user's primary store (they must deactivate the user instead).

**Files:**
- Modify: `kioskly-api/src/users/users.service.ts`
- Modify: `kioskly-api/src/users/users.controller.ts`
- Modify: `kioskly-api/src/users/users.service.spec.ts`

- [ ] **Step 1: Add failing tests**

In `users.service.spec.ts`, add after the `assignUserToStore` describe block:

```ts
  describe('revokeStoreAccess (STORE_ADMIN path)', () => {
    it('throws ForbiddenException when target store is not in managed stores', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ companyId: 'co-1' });
      mockPrisma.user.findUnique.mockResolvedValue({ tenantId: 'store-a' });
      mockPrisma.userStoreAccess.findMany.mockResolvedValue([]);

      await expect(
        service.revokeStoreAccess('store-other', 'u-bob', 'co-1', 'STORE_ADMIN', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when revoking primary store assignment', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ companyId: 'co-1' });
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ tenantId: 'store-a' })  // getManagedStoreIds primary
        .mockResolvedValueOnce({ tenantId: 'store-a' }); // target user's tenantId
      mockPrisma.userStoreAccess.findMany.mockResolvedValue([]);

      await expect(
        service.revokeStoreAccess('store-a', 'u-bob', 'co-1', 'STORE_ADMIN', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('deactivates the UserStoreAccess record when checks pass', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ companyId: 'co-1' });
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ tenantId: 'store-a' })   // getManagedStoreIds
        .mockResolvedValueOnce({ tenantId: 'store-b' });  // target user — primary is store-b not store-a
      mockPrisma.userStoreAccess.findMany.mockResolvedValue([]);
      mockPrisma.userStoreAccess.updateMany.mockResolvedValue({ count: 1 });

      await service.revokeStoreAccess('store-a', 'u-bob', 'co-1', 'STORE_ADMIN', 'user-1');

      expect(mockPrisma.userStoreAccess.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u-bob', tenantId: 'store-a' },
        data: { isActive: false },
      });
    });
  });
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd kioskly-api && npm test -- --testPathPattern=users.service.spec --no-coverage
```

Expected: FAIL — `revokeStoreAccess` signature mismatch.

- [ ] **Step 3: Replace `revokeStoreAccess` in `users.service.ts`**

Replace the entire existing `revokeStoreAccess` method:

```ts
  async revokeStoreAccess(
    storeId: string,
    userId: string,
    requestingCompanyId: string,
    requestingRole: string,
    requestingUserId?: string,
  ) {
    const store = await this.prisma.tenant.findUnique({
      where: { id: storeId },
      select: { companyId: true },
    });
    if (!store) throw new NotFoundException('Store not found');

    if (requestingRole === 'STORE_ADMIN') {
      const managedIds = await this.getManagedStoreIds(requestingUserId!);
      if (!managedIds.includes(storeId)) throw new ForbiddenException('Access denied');

      const targetUser = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { tenantId: true },
      });
      if (targetUser?.tenantId === storeId) {
        throw new BadRequestException(
          'Cannot revoke primary store assignment; deactivate the user instead',
        );
      }
    } else if (requestingRole !== 'PLATFORM_ADMIN' && store.companyId !== requestingCompanyId) {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.userStoreAccess.updateMany({
      where: { userId, tenantId: storeId },
      data: { isActive: false },
    });
  }
```

- [ ] **Step 4: Update the controller to add STORE_ADMIN and pass `req.user.id`**

In `users.controller.ts`, replace the `revokeStoreAccess` handler (lines 152–164):

```ts
  @Delete('stores/:storeId/:userId/access')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('STORE_ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiOperation({ summary: "Revoke a user's access to a store" })
  revokeStoreAccess(
    @Param('storeId') storeId: string,
    @Param('userId') userId: string,
    @CompanyId() companyId: string,
    @Request() req,
  ) {
    return this.usersService.revokeStoreAccess(storeId, userId, companyId, req.user.role, req.user.id);
  }
```

- [ ] **Step 5: Run all tests to confirm they pass**

```bash
cd kioskly-api && npm test -- --testPathPattern=users.service.spec --no-coverage
```

Expected: PASS — all tests in the spec file green.

- [ ] **Step 6: Commit**

```bash
git add kioskly-api/src/users/users.service.ts kioskly-api/src/users/users.controller.ts kioskly-api/src/users/users.service.spec.ts
git commit -m "feat(users): allow STORE_ADMIN to revoke cross-store access"
```

---

## Task 7: Update frontend types

**Files:**
- Modify: `kioskly-admin/types/index.ts`

- [ ] **Step 1: Extend the `User` interface and add `AssignableUser` and `StoreAccess`**

In `kioskly-admin/types/index.ts`, replace the existing `User` interface (line 41):

```ts
export interface User {
  id: string;
  tenantId?: string;
  companyId?: string;
  brandId?: string;
  username: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role: "STORE_ADMIN" | "CASHIER" | "ADMIN" | "COMPANY_ADMIN" | "PLATFORM_ADMIN";
  isActive?: boolean;
  isFirstLogin?: boolean;
  createdAt: string;
  updatedAt: string;
  // Multi-store fields (populated by getStoreUsers)
  isAssigned?: boolean;
  assignedRole?: "STORE_ADMIN" | "CASHIER";
  primaryStore?: { id: string; name: string; slug: string };
}
```

After the `User` interface, add:

```ts
export interface AssignableUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
  tenant: { id: string; name: string; slug: string } | null;
}

export interface StoreAccess {
  id: string;
  tenantId: string;
  role: string;
  isActive: boolean;
  tenant: { id: string; name: string; slug: string };
}
```

- [ ] **Step 2: Commit**

```bash
git add kioskly-admin/types/index.ts
git commit -m "feat(types): add AssignableUser, StoreAccess; extend User with multi-store fields"
```

---

## Task 8: Update frontend API client

**Files:**
- Modify: `kioskly-admin/lib/api.ts`

- [ ] **Step 1: Add `getMyStoreAccess` and `getAssignablePool` methods**

In `kioskly-admin/lib/api.ts`, add the following two methods inside the `ApiClient` class, in the `// ─── Store assignment (multi-store) ───` section (near line 635). Add them after `revokeStoreAccess`:

```ts
  async getMyStoreAccess(userId: string): Promise<StoreAccess[]> {
    const { data } = await this.client.get<StoreAccess[]>(`/users/${userId}/stores`);
    return data;
  }

  async getAssignablePool(storeId: string, q?: string): Promise<AssignableUser[]> {
    const { data } = await this.client.get<AssignableUser[]>(
      `/users/stores/${storeId}/assignable-pool`,
      { params: q ? { q } : {} },
    );
    return data;
  }
```

- [ ] **Step 2: Add `StoreAccess` and `AssignableUser` to the import from `@/types`**

Find the existing types import at the top of `lib/api.ts` and add `AssignableUser` and `StoreAccess`:

```ts
import type {
  AuthResponse,
  LoginCredentials,
  Transaction,
  Product,
  Category,
  Size,
  Addon,
  Tenant,
  ApiError,
  InventoryItem,
  InventoryRecord,
  LatestInventoryItem,
  InventoryStats,
  User,
  AssignableUser,
  StoreAccess,
  StoreUserCreatePayload,
  TimeOfDayData,
  SubmittedReport,
  Expense,
} from "@/types";
```

- [ ] **Step 3: Commit**

```bash
git add kioskly-admin/lib/api.ts
git commit -m "feat(api): add getMyStoreAccess and getAssignablePool client methods"
```

---

## Task 9: Create `AssignUserModal` component

A modal overlay with a debounced search input, results list showing name + current store + role badge, a role picker, and a confirm button.

**Files:**
- Create: `kioskly-admin/app/(main)/users/AssignUserModal.tsx`

- [ ] **Step 1: Create the component**

```tsx
// kioskly-admin/app/(main)/users/AssignUserModal.tsx
'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { formatRole } from '@/lib/utils';
import type { AssignableUser } from '@/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X, Search } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  storeId: string;
  primaryColor: string;
  onAssigned: () => void;
}

export default function AssignUserModal({ isOpen, onClose, storeId, primaryColor, onAssigned }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AssignableUser[]>([]);
  const [selected, setSelected] = useState<AssignableUser | null>(null);
  const [role, setRole] = useState<'CASHIER' | 'STORE_ADMIN'>('CASHIER');
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api.getAssignablePool(storeId, query || undefined);
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, storeId, isOpen]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setSelected(null);
      setRole('CASHIER');
      setError(null);
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.assignUserToStore(storeId, { username: selected.username, role });
      onAssigned();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to assign user');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Assign Existing User</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or username…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Results */}
        <div className="border border-gray-200 rounded-md overflow-hidden mb-4 max-h-52 overflow-y-auto">
          {searching && (
            <div className="px-3 py-4 text-center text-sm text-gray-400">Searching…</div>
          )}
          {!searching && results.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-gray-400">
              {query ? 'No users found.' : 'Start typing to search.'}
            </div>
          )}
          {!searching && results.map(user => (
            <button
              key={user.id}
              onClick={() => setSelected(user)}
              className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0 transition ${selected?.id === user.id ? 'bg-indigo-50' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    {user.firstName} {user.lastName}
                  </span>
                  <span className="ml-1.5 text-xs text-gray-400 font-mono">@{user.username}</span>
                </div>
                <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                  {formatRole(user.role)}
                </span>
              </div>
              {user.tenant && (
                <div className="text-xs text-gray-400 mt-0.5">{user.tenant.name}</div>
              )}
            </button>
          ))}
        </div>

        {/* Role picker */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Role in this store
          </label>
          <Select value={role} onValueChange={v => setRole(v as any)}>
            <SelectTrigger className="w-full" style={{ color: '#1f2937' }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CASHIER">Cashier</SelectItem>
              <SelectItem value="STORE_ADMIN">Store Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {error && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected || submitting}
            className="px-4 py-2 text-sm text-black rounded-lg hover:opacity-90 transition disabled:opacity-40"
            style={{ backgroundColor: primaryColor }}
          >
            {submitting ? 'Assigning…' : 'Assign User'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add kioskly-admin/app/(main)/users/AssignUserModal.tsx
git commit -m "feat(users): add AssignUserModal component with debounced search"
```

---

## Task 10: Update the users page

Adds multi-store detection on page load, updates the user list to display assigned users with an "Assigned" badge and a "Remove access" action, and renders the "Assign Existing User" button conditionally.

**Files:**
- Modify: `kioskly-admin/app/(main)/users/page.tsx`

- [ ] **Step 1: Replace the full page component**

Replace the entire contents of `kioskly-admin/app/(main)/users/page.tsx` with:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useTenant } from '@/contexts/TenantContext';
import { formatRole } from '@/lib/utils';
import type { User, StoreUserCreatePayload } from '@/types';
import { UserPlus, Eye, EyeOff, UserCheck, UserX, Users } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import AssignUserModal from './AssignUserModal';

export default function UsersPage() {
  const { tenant, brand } = useTenant();
  const primaryColor = brand?.themeColors?.primary ?? tenant?.themeColors?.primary ?? '#ea580c';
  const textColor = '#1f2937';

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMultiStoreAdmin, setIsMultiStoreAdmin] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const currentUser = typeof window !== 'undefined'
    ? (() => { try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; } })()
    : null;
  const isStoreAdmin = currentUser?.role === 'STORE_ADMIN' || currentUser?.role === 'ADMIN';

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState<StoreUserCreatePayload>({
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    role: 'CASHIER',
  });
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    try {
      const data = await api.getStoreUsers(tenant.id);
      setUsers(data);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  }, [tenant?.id]);

  // Detect multi-store admin on mount
  useEffect(() => {
    if (!currentUser?.id || !isStoreAdmin) return;
    api.getMyStoreAccess(currentUser.id)
      .then(stores => setIsMultiStoreAdmin(stores.length >= 2))
      .catch(() => setIsMultiStoreAdmin(false));
  }, [currentUser?.id, isStoreAdmin]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant?.id) return;
    setFormLoading(true);
    setError(null);
    try {
      const result = await api.createStoreUser(tenant.id, form);
      setCreatedPassword(result.temporaryPassword);
      setShowPassword(true);
      setShowCreateForm(false);
      setForm({ firstName: '', lastName: '', email: '', username: '', role: 'CASHIER' });
      await fetchUsers();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create user');
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleActive = async (user: User) => {
    if (!tenant?.id) return;
    try {
      await api.updateStoreUser(tenant.id, user.id, { isActive: !user.isActive });
      await fetchUsers();
    } catch (err) {
      console.error('Failed to update user:', err);
    }
  };

  const handleRevokeAccess = async (user: User) => {
    if (!tenant?.id) return;
    try {
      await api.revokeStoreAccess(tenant.id, user.id);
      await fetchUsers();
    } catch (err: any) {
      console.error('Failed to revoke access:', err?.response?.data?.message || err);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Store Users</h1>
          <p className="text-sm text-gray-500 mt-1">Manage staff accounts for this store</p>
        </div>
        {isStoreAdmin && (
          <div className="flex gap-2">
            {isMultiStoreAdmin && (
              <button
                onClick={() => setShowAssignModal(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                <Users className="h-4 w-4" />
                Assign Existing User
              </button>
            )}
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-2 px-4 py-2 text-black rounded-lg text-sm font-medium hover:opacity-90 transition"
              style={{ backgroundColor: primaryColor }}
            >
              <UserPlus className="h-4 w-4" />
              Add User
            </button>
          </div>
        )}
      </div>

      {/* New password display */}
      {createdPassword && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="font-semibold text-green-800 mb-1">User created successfully!</p>
          <p className="text-sm text-green-700 mb-2">
            Share this temporary password via a secure channel. The user must change it on first login.
          </p>
          <div className="flex items-center gap-2">
            <code className="bg-white border border-green-300 px-3 py-1 rounded text-sm font-mono text-gray-900 select-all">
              {showPassword ? createdPassword : '•'.repeat(createdPassword.length)}
            </code>
            <button onClick={() => setShowPassword((v) => !v)} className="text-green-700">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(createdPassword)}
              className="text-xs text-green-700 underline ml-2"
            >
              Copy
            </button>
          </div>
          <button onClick={() => setCreatedPassword(null)} className="mt-2 text-xs text-green-600 underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreateForm && isStoreAdmin && (
        <div className="mb-6 p-5 bg-white border border-gray-200 rounded-lg shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">Add New User</h2>
          {error && (
            <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <input
                type="text"
                required
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input
                type="text"
                required
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                type="text"
                required
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as any })}>
                <SelectTrigger className="w-full" style={{ color: textColor }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ '--select-hover-bg': `${primaryColor}20`, '--select-hover-text': textColor } as React.CSSProperties}>
                  <SelectItem value="CASHIER">Cashier</SelectItem>
                  <SelectItem value="STORE_ADMIN">Store Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={formLoading}
                className="px-4 py-2 text-sm text-black rounded-lg hover:opacity-90 transition disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}
              >
                {formLoading ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users table */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading users...</div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => {
                  const effectiveRole = user.isAssigned && user.assignedRole ? user.assignedRole : user.role;
                  return (
                    <tr key={user.id} className={!user.isActive ? 'opacity-50' : ''}>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="flex items-center gap-2">
                          {user.firstName} {user.lastName}
                          {user.isAssigned && (
                            <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full font-medium">
                              Assigned
                            </span>
                          )}
                          {user.isAssigned && user.primaryStore && (
                            <span className="text-xs text-gray-400">from {user.primaryStore.name}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-mono text-gray-700">{user.username}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className="inline-block whitespace-nowrap px-2 py-1 rounded-full text-xs font-medium"
                          style={
                            ['STORE_ADMIN', 'ADMIN'].includes(effectiveRole)
                              ? { backgroundColor: '#e0e7ff', color: '#3730a3' }
                              : { backgroundColor: '#f3f4f6', color: '#374151' }
                          }
                        >
                          {formatRole(effectiveRole)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {user.isActive ? (
                          <span className="text-green-600 font-medium">Active</span>
                        ) : (
                          <span className="text-red-500 font-medium">Inactive</span>
                        )}
                        {user.isFirstLogin && (
                          <span className="ml-2 text-xs text-amber-600 bg-amber-50 px-1 py-0.5 rounded">
                            Pending login
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {isStoreAdmin && currentUser?.id !== user.id && (
                          <div className="relative group inline-block">
                            {user.isAssigned ? (
                              <button
                                onClick={() => handleRevokeAccess(user)}
                                className="text-gray-400 hover:text-red-500 transition"
                                title="Remove access"
                              >
                                <UserX className="h-4 w-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleToggleActive(user)}
                                className="text-gray-400 hover:text-gray-600"
                              >
                                {user.isActive ? (
                                  <UserX className="h-4 w-4" />
                                ) : (
                                  <UserCheck className="h-4 w-4" />
                                )}
                              </button>
                            )}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                              {user.isAssigned ? 'Remove access' : user.isActive ? 'Disable account' : 'Enable account'}
                            </div>
                          </div>
                        )}
                        {currentUser?.id === user.id && (
                          <span className="text-xs text-gray-400">No action</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      No users found. Add the first user above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Assign existing user modal */}
      {tenant?.id && (
        <AssignUserModal
          isOpen={showAssignModal}
          onClose={() => setShowAssignModal(false)}
          storeId={tenant.id}
          primaryColor={primaryColor}
          onAssigned={fetchUsers}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add kioskly-admin/app/(main)/users/page.tsx
git commit -m "feat(users): update users page with multi-store detection and assign modal"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| `getStoreUsers` scope fix for multi-store STORE_ADMIN | Task 2 |
| `getStoreUsers` includes assigned users with `isAssigned` flag | Task 2 |
| Effective role display per store for assigned users | Task 2 (service) + Task 10 (frontend) |
| STORE_ADMIN self-query on `GET /users/:userId/stores` | Task 3 |
| `GET /users/stores/:storeId/assignable-pool` endpoint | Task 4 |
| `assignUserToStore` allows STORE_ADMIN with managed-pool scope | Task 5 |
| `revokeStoreAccess` allows STORE_ADMIN, blocks primary store revoke | Task 6 |
| `AssignableUser` and `StoreAccess` frontend types | Task 7 |
| `getMyStoreAccess` and `getAssignablePool` API client | Task 8 |
| `AssignUserModal` with debounced search + role picker | Task 9 |
| Users page: multi-store detection, assign button, assigned badge, revoke action | Task 10 |
| Error table from spec | Handled inline in service throws + frontend error display |

All spec requirements are covered.
