# Store Subscription Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a PLATFORM_ADMIN track, per store, when its subscription was activated and which months have been paid (a manual checklist), plus a platform-wide subscription overview.

**Architecture:** Two new Prisma models (`StoreSubscription`, `SubscriptionPayment`) hang off `Tenant`. A sparse ledger — `SubscriptionPayment` rows exist only for months an admin has touched; missing months default to unpaid. A new `subscriptions` NestJS module exposes list/stats/detail/activation/payment endpoints under `PLATFORM_ADMIN`. A new `Subscriptions` page (list + detail) is added to `kioscify-platform`.

**Tech Stack:** NestJS + Prisma (MongoDB) on the API side; Next.js 15 + Tailwind + lucide-react + sonner on the platform admin frontend. Jest for backend unit tests (no frontend test suite exists in this repo — frontend tasks are verified manually via the dev server).

## Global Constraints

- All new API endpoints: `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles('PLATFORM_ADMIN')`, `@ApiBearerAuth()` — same as every other `platform` module route.
- Subscriptions are tracked per **Store (Tenant)**, not per Company.
- "Current month" comparisons must use store-local time via `getZonedMonthBounds`/`getZonedMonthKey` in `kioskly-api/src/common/utils/timezone.ts` — never raw server-timezone `Date` math (this is the same bug class fixed in commit `fe5bbab`).
- No cron jobs, no automated billing, no revenue/currency totals — payment status is a manual checklist only.
- A `SubscriptionPayment` row is only ever created when an admin explicitly marks a month; a month with no row is "unpaid" by default.
- Backend tests: run from `kioskly-api/` with `npm run test -- <path-relative-to-src>`.

---

### Task 1: Add `getZonedMonthKey` helper to the timezone util

**Files:**
- Modify: `kioskly-api/src/common/utils/timezone.ts`
- Test: `kioskly-api/src/common/utils/timezone.spec.ts`

**Interfaces:**
- Produces: `getZonedMonthKey(date: Date): string` — returns `'YYYY-MM'` for the store-local calendar month containing `date`. Later tasks (the subscription-months util) import this from `../common/utils/timezone`.

- [ ] **Step 1: Write the failing test**

Add to `kioskly-api/src/common/utils/timezone.spec.ts` (append inside the existing `describe` blocks structure, as a new top-level `describe`):

```ts
describe('getZonedMonthKey', () => {
  it('returns the store-local YYYY-MM, not the UTC one', () => {
    // 2026-07-01T01:00:00.000Z is 2026-07-01 09:00 in Asia/Manila (UTC+8) —
    // same calendar month as UTC here, so also check the actual boundary case below.
    expect(getZonedMonthKey(new Date('2026-07-01T01:00:00.000Z'))).toBe('2026-07');
  });

  it('rolls over to the next month before UTC midnight, due to the +8 offset', () => {
    // 2026-06-30T16:30:00.000Z is 2026-07-01 00:30 in Asia/Manila — July locally,
    // June in UTC. This is the exact class of bug fixed in commit fe5bbab.
    expect(getZonedMonthKey(new Date('2026-06-30T16:30:00.000Z'))).toBe('2026-07');
  });

  it('pads single-digit months', () => {
    expect(getZonedMonthKey(new Date('2026-01-15T04:00:00.000Z'))).toBe('2026-01');
  });
});
```

Add `getZonedMonthKey` to the existing `import { ... } from './timezone'` line at the top of the spec file.

- [ ] **Step 2: Run test to verify it fails**

Run (from `kioskly-api/`): `npm run test -- common/utils/timezone.spec.ts`
Expected: FAIL — `getZonedMonthKey is not a function` (or a TypeScript compile error naming it as missing).

- [ ] **Step 3: Write minimal implementation**

Add to `kioskly-api/src/common/utils/timezone.ts`, directly after `getZonedDateString`:

```ts
/** Calendar month (YYYY-MM) of `date` in the store's local timezone. */
export function getZonedMonthKey(date: Date): string {
  const zoned = toZoned(date);
  return `${zoned.getUTCFullYear()}-${String(zoned.getUTCMonth() + 1).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- common/utils/timezone.spec.ts`
Expected: PASS (all tests in the file, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add kioskly-api/src/common/utils/timezone.ts kioskly-api/src/common/utils/timezone.spec.ts
git commit -m "feat(api): add getZonedMonthKey timezone helper"
```

---

### Task 2: Add Prisma schema models for subscriptions

**Files:**
- Modify: `kioskly-api/prisma/schema.prisma`

**Interfaces:**
- Produces: `prisma.storeSubscription` and `prisma.subscriptionPayment` Prisma Client delegates, and `Tenant.subscription` relation. Later tasks (SubscriptionsService) depend on these exact model/field names.

- [ ] **Step 1: Add the two new models**

Add near the bottom of `kioskly-api/prisma/schema.prisma` (after the `Tenant` model's closing brace, before the next section comment):

```prisma
model StoreSubscription {
  id          String    @id @default(auto()) @map("_id") @db.ObjectId
  tenantId    String    @unique @db.ObjectId
  activatedAt DateTime? // null = pending activation, no billing yet
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  tenant      Tenant                @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  payments    SubscriptionPayment[]

  @@map("store_subscriptions")
}

model SubscriptionPayment {
  id             String    @id @default(auto()) @map("_id") @db.ObjectId
  subscriptionId String    @db.ObjectId
  month          DateTime  // store-local first-of-month, normalized via getZonedMonthBounds(...).start
  paid           Boolean   @default(true)
  paidAt         DateTime?
  note           String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  subscription   StoreSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)

  @@unique([subscriptionId, month])
  @@map("subscription_payments")
}
```

- [ ] **Step 2: Add the inverse relation on `Tenant`**

In the `Tenant` model (`kioskly-api/prisma/schema.prisma:76-119`), add one line inside the relations block (near `priceTier`):

```prisma
  subscription StoreSubscription?
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npm run prisma:generate --workspace=kioskly-api`
Expected: `Generated Prisma Client` success message, no errors. (MongoDB is schemaless — new collections/fields need no migration, only client regeneration, per this repo's documented workflow.)

- [ ] **Step 4: Verify the project still type-checks**

Run: `npm run build --workspace=kioskly-api`
Expected: build succeeds (confirms no other file references break from the schema change).

- [ ] **Step 5: Commit**

```bash
git add kioskly-api/prisma/schema.prisma
git commit -m "feat(api): add StoreSubscription and SubscriptionPayment models"
```

---

### Task 3: Build the pure `buildSubscriptionMonths` checklist util (TDD)

**Files:**
- Create: `kioskly-api/src/subscriptions/subscription-months.util.ts`
- Test: `kioskly-api/src/subscriptions/subscription-months.util.spec.ts`

**Interfaces:**
- Consumes: `getZonedMonthBounds`, `getZonedMonthKey` from `../common/utils/timezone` (Task 1 and pre-existing).
- Produces: `buildSubscriptionMonths(activatedAt: Date, now: Date, payments: SubscriptionPaymentRecord[]): SubscriptionMonthEntry[]`, and the `SubscriptionPaymentRecord`/`SubscriptionMonthEntry` interfaces. `SubscriptionsService` (Task 5/6) imports all three.

- [ ] **Step 1: Write the failing tests**

Create `kioskly-api/src/subscriptions/subscription-months.util.spec.ts`:

```ts
import { buildSubscriptionMonths } from './subscription-months.util';

describe('buildSubscriptionMonths', () => {
  it('returns a single month when activation and now are the same store-local month', () => {
    const activatedAt = new Date('2026-07-05T03:00:00.000Z');
    const now = new Date('2026-07-20T03:00:00.000Z');
    const result = buildSubscriptionMonths(activatedAt, now, []);
    expect(result).toEqual([{ month: '2026-07', paid: false, paidAt: null, note: null }]);
  });

  it('spans multiple months including a year boundary, defaulting to unpaid', () => {
    const activatedAt = new Date('2025-12-10T03:00:00.000Z');
    const now = new Date('2026-02-15T03:00:00.000Z');
    const result = buildSubscriptionMonths(activatedAt, now, []);
    expect(result.map(m => m.month)).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(result.every(m => m.paid === false && m.paidAt === null && m.note === null)).toBe(true);
  });

  it('applies a matching payment record onto its month', () => {
    const activatedAt = new Date('2026-01-10T03:00:00.000Z');
    const now = new Date('2026-03-10T03:00:00.000Z');
    const paidAt = new Date('2026-02-03T05:00:00.000Z');
    const payments = [
      {
        month: new Date('2026-02-01T00:00:00.000Z'), // any instant that store-local-resolves to Feb 2026
        paid: true,
        paidAt,
        note: 'Paid via bank transfer',
      },
    ];
    const result = buildSubscriptionMonths(activatedAt, now, payments);
    expect(result).toEqual([
      { month: '2026-01', paid: false, paidAt: null, note: null },
      { month: '2026-02', paid: true, paidAt, note: 'Paid via bank transfer' },
      { month: '2026-03', paid: false, paidAt: null, note: null },
    ]);
  });

  it('respects store-local zoning at the activation boundary, not raw UTC', () => {
    // 2026-06-30T16:30:00.000Z is 2026-07-01 00:30 in Asia/Manila (UTC+8) — the
    // checklist must start at July, not June, matching getZonedMonthKey.
    const activatedAt = new Date('2026-06-30T16:30:00.000Z');
    const now = new Date('2026-06-30T16:30:00.000Z');
    const result = buildSubscriptionMonths(activatedAt, now, []);
    expect(result).toEqual([{ month: '2026-07', paid: false, paidAt: null, note: null }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `kioskly-api/`): `npm run test -- subscriptions/subscription-months.util.spec.ts`
Expected: FAIL — cannot find module `./subscription-months.util`.

- [ ] **Step 3: Write minimal implementation**

Create `kioskly-api/src/subscriptions/subscription-months.util.ts`:

```ts
import { getZonedMonthBounds, getZonedMonthKey } from '../common/utils/timezone';

export interface SubscriptionPaymentRecord {
  month: Date;
  paid: boolean;
  paidAt: Date | null;
  note: string | null;
}

export interface SubscriptionMonthEntry {
  month: string; // 'YYYY-MM', store-local
  paid: boolean;
  paidAt: Date | null;
  note: string | null;
}

/**
 * Walks store-local calendar months from `activatedAt` to `now` (inclusive),
 * left-joining `payments` by month. A month with no matching payment record
 * defaults to unpaid — this is the sparse-ledger read path.
 */
export function buildSubscriptionMonths(
  activatedAt: Date,
  now: Date,
  payments: SubscriptionPaymentRecord[],
): SubscriptionMonthEntry[] {
  const paymentsByKey = new Map(payments.map(p => [getZonedMonthKey(p.month), p]));

  const months: SubscriptionMonthEntry[] = [];
  let cursorStart = getZonedMonthBounds(activatedAt).start;
  const endKey = getZonedMonthKey(now);

  // Safety cap: 100 years of months. Prevents any pathological infinite loop
  // from a bad activatedAt value from hanging the request.
  for (let i = 0; i < 1200; i++) {
    const key = getZonedMonthKey(cursorStart);
    const record = paymentsByKey.get(key);
    months.push({
      month: key,
      paid: record?.paid ?? false,
      paidAt: record?.paidAt ?? null,
      note: record?.note ?? null,
    });
    if (key === endKey) break;

    // Jump 32 days ahead (always lands in the next calendar month regardless
    // of month length), then re-derive that month's store-local start.
    const next = new Date(cursorStart.getTime() + 32 * 24 * 60 * 60 * 1000);
    cursorStart = getZonedMonthBounds(next).start;
  }

  return months;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- subscriptions/subscription-months.util.spec.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add kioskly-api/src/subscriptions/subscription-months.util.ts kioskly-api/src/subscriptions/subscription-months.util.spec.ts
git commit -m "feat(api): add sparse-ledger subscription checklist builder"
```

---

### Task 4: Add subscription DTOs

**Files:**
- Create: `kioskly-api/src/subscriptions/dto/set-activation.dto.ts`
- Create: `kioskly-api/src/subscriptions/dto/upsert-payment.dto.ts`

**Interfaces:**
- Produces: `SetActivationDto { activatedAt?: string | null }`, `UpsertPaymentDto { paid: boolean; note?: string }`. Consumed by `SubscriptionsController` (Task 7).

- [ ] **Step 1: Create `SetActivationDto`**

Create `kioskly-api/src/subscriptions/dto/set-activation.dto.ts`:

```ts
import { IsDateString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SetActivationDto {
  @ApiPropertyOptional({ example: '2026-01-15', nullable: true, description: 'ISO date string, or null to revert to Pending Activation' })
  @IsOptional()
  @IsDateString()
  activatedAt?: string | null;
}
```

- [ ] **Step 2: Create `UpsertPaymentDto`**

Create `kioskly-api/src/subscriptions/dto/upsert-payment.dto.ts`:

```ts
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertPaymentDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  paid: boolean;

  @ApiPropertyOptional({ example: 'Paid via bank transfer' })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;
}
```

- [ ] **Step 3: Verify the project type-checks**

Run: `npm run build --workspace=kioskly-api`
Expected: build succeeds (these DTOs aren't wired up yet, but must compile standalone).

- [ ] **Step 4: Commit**

```bash
git add kioskly-api/src/subscriptions/dto/set-activation.dto.ts kioskly-api/src/subscriptions/dto/upsert-payment.dto.ts
git commit -m "feat(api): add subscription activation and payment DTOs"
```

---

### Task 5: `SubscriptionsService` — `getStats` and `getList` (TDD)

**Files:**
- Create: `kioskly-api/src/subscriptions/subscriptions.service.ts`
- Test: `kioskly-api/src/subscriptions/subscriptions.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (`../prisma/prisma.service`), `getZonedMonthBounds` (`../common/utils/timezone`).
- Produces: `SubscriptionsService.getStats(): Promise<{ totalStores, activated, pendingActivation, paidThisMonth, overdue }>` and `SubscriptionsService.getList(filters): Promise<{ data: SubscriptionListRow[], pagination: {...} }>`. Task 6 adds more methods to this same class/file; Task 7 (controller) calls both.

- [ ] **Step 1: Write the failing tests**

Create `kioskly-api/src/subscriptions/subscriptions.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionsService } from './subscriptions.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  tenant: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
  storeSubscription: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
  subscriptionPayment: { upsert: jest.fn() },
};

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [SubscriptionsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<SubscriptionsService>(SubscriptionsService);
  });

  describe('getStats', () => {
    it('computes activated/pending/paid/overdue from tenant count and subscriptions', async () => {
      mockPrisma.tenant.count.mockResolvedValue(5);
      mockPrisma.storeSubscription.findMany.mockResolvedValue([
        { id: 'sub-1', payments: [{ paid: true }] }, // paid this month
        { id: 'sub-2', payments: [] }, // overdue
        { id: 'sub-3', payments: [] }, // overdue
      ]);

      const result = await service.getStats();

      expect(mockPrisma.tenant.count).toHaveBeenCalledWith();
      expect(mockPrisma.storeSubscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { activatedAt: { not: null } } }),
      );
      expect(result).toEqual({
        totalStores: 5,
        activated: 3,
        pendingActivation: 2,
        paidThisMonth: 1,
        overdue: 2,
      });
    });
  });

  describe('getList', () => {
    const baseTenant = {
      id: 't-1',
      name: 'Downtown',
      slug: 'downtown',
      company: { id: 'c-1', name: 'Acme Co' },
      brand: { id: 'b-1', name: 'Mango Cafe' },
      subscription: null as any,
    };

    it('marks a store with no subscription row as pending, paidThisMonth null', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([baseTenant]);

      const result = await service.getList({});

      expect(result.data).toEqual([
        {
          tenantId: 't-1',
          storeName: 'Downtown',
          storeSlug: 'downtown',
          company: { id: 'c-1', name: 'Acme Co' },
          brand: { id: 'b-1', name: 'Mango Cafe' },
          activatedAt: null,
          paidThisMonth: null,
        },
      ]);
      expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    });

    it('filters to only overdue stores when paid=overdue', async () => {
      const activatedAt = new Date('2026-01-01T00:00:00.000Z');
      mockPrisma.tenant.findMany.mockResolvedValue([
        { ...baseTenant, id: 't-1', subscription: { activatedAt, payments: [{ paid: true }] } },
        { ...baseTenant, id: 't-2', subscription: { activatedAt, payments: [] } },
      ]);

      const result = await service.getList({ paid: 'overdue' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].tenantId).toBe('t-2');
    });

    it('paginates the filtered result set', async () => {
      const activatedAt = new Date('2026-01-01T00:00:00.000Z');
      const tenants = Array.from({ length: 25 }, (_, i) => ({
        ...baseTenant,
        id: `t-${i}`,
        subscription: { activatedAt, payments: [] },
      }));
      mockPrisma.tenant.findMany.mockResolvedValue(tenants);

      const result = await service.getList({ page: 2, limit: 20 });

      expect(result.data).toHaveLength(5);
      expect(result.pagination).toEqual({ page: 2, limit: 20, total: 25, totalPages: 2 });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- subscriptions/subscriptions.service.spec.ts`
Expected: FAIL — cannot find module `./subscriptions.service`.

- [ ] **Step 3: Write minimal implementation**

Create `kioskly-api/src/subscriptions/subscriptions.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getZonedMonthBounds } from '../common/utils/timezone';

export interface SubscriptionListFilters {
  companyId?: string;
  brandId?: string;
  status?: 'activated' | 'pending';
  paid?: 'paid' | 'overdue';
  page?: number;
  limit?: number;
}

interface CompanyBrandRef {
  id: string;
  name: string;
}

export interface SubscriptionListRow {
  tenantId: string;
  storeName: string;
  storeSlug: string;
  company: CompanyBrandRef | null;
  brand: CompanyBrandRef | null;
  activatedAt: Date | null;
  paidThisMonth: boolean | null;
}

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService) {}

  async getStats() {
    const currentMonthStart = getZonedMonthBounds(new Date()).start;

    const [totalStores, subscriptions] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.storeSubscription.findMany({
        where: { activatedAt: { not: null } },
        select: { id: true, payments: { where: { month: currentMonthStart, paid: true } } },
      }),
    ]);

    const activated = subscriptions.length;
    const paidThisMonth = subscriptions.filter(s => s.payments.length > 0).length;

    return {
      totalStores,
      activated,
      pendingActivation: totalStores - activated,
      paidThisMonth,
      overdue: activated - paidThisMonth,
    };
  }

  async getList(filters: SubscriptionListFilters): Promise<{
    data: SubscriptionListRow[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const currentMonthStart = getZonedMonthBounds(new Date()).start;

    const tenants = await this.prisma.tenant.findMany({
      where: {
        ...(filters.companyId ? { companyId: filters.companyId } : {}),
        ...(filters.brandId ? { brandId: filters.brandId } : {}),
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        company: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
        subscription: {
          select: {
            activatedAt: true,
            payments: { where: { month: currentMonthStart } },
          },
        },
      },
    });

    const rows: SubscriptionListRow[] = tenants.map(t => {
      const activatedAt = t.subscription?.activatedAt ?? null;
      const paidThisMonth = activatedAt ? (t.subscription?.payments.some(p => p.paid) ?? false) : null;
      return {
        tenantId: t.id,
        storeName: t.name,
        storeSlug: t.slug,
        company: t.company,
        brand: t.brand,
        activatedAt,
        paidThisMonth,
      };
    });

    const filtered = rows.filter(r => {
      if (filters.status === 'activated' && !r.activatedAt) return false;
      if (filters.status === 'pending' && r.activatedAt) return false;
      if (filters.paid === 'paid' && r.paidThisMonth !== true) return false;
      if (filters.paid === 'overdue' && !(r.activatedAt && r.paidThisMonth === false)) return false;
      return true;
    });

    const total = filtered.length;
    const start = (page - 1) * limit;
    const data = filtered.slice(start, start + limit);

    return { data, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }
}
```

Note: filtering/pagination happen in application memory after fetching all matching-company/brand tenants. This is a deliberate trade-off — `paid`/`status` aren't cheaply expressible as a single Mongo/Prisma query given the sparse-ledger join, and the platform's store counts are in the dozens-to-low-hundreds range, not a scale where this matters.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- subscriptions/subscriptions.service.spec.ts`
Expected: PASS, all tests in `getStats` and `getList` describe blocks.

- [ ] **Step 5: Commit**

```bash
git add kioskly-api/src/subscriptions/subscriptions.service.ts kioskly-api/src/subscriptions/subscriptions.service.spec.ts
git commit -m "feat(api): add SubscriptionsService getStats and getList"
```

---

### Task 6: `SubscriptionsService` — `getDetail`, `setActivation`, `upsertPayment` (TDD)

**Files:**
- Modify: `kioskly-api/src/subscriptions/subscriptions.service.ts`
- Modify: `kioskly-api/src/subscriptions/subscriptions.service.spec.ts`

**Interfaces:**
- Consumes: `buildSubscriptionMonths` from `./subscription-months.util` (Task 3).
- Produces: `getDetail(tenantId): Promise<SubscriptionDetail>`, `setActivation(tenantId, activatedAt: string | null)`, `upsertPayment(tenantId, month: string, dto: UpsertPaymentDto)`. Task 7 (controller) calls all three.

- [ ] **Step 1: Write the failing tests**

Append to `kioskly-api/src/subscriptions/subscriptions.service.spec.ts` (add these imports at the top: `BadRequestException, NotFoundException` from `@nestjs/common`), and add these `describe` blocks inside the existing outer `describe('SubscriptionsService', ...)`:

```ts
  describe('getDetail', () => {
    it('throws NotFoundException when the tenant does not exist', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);
      await expect(service.getDetail('missing')).rejects.toThrow(NotFoundException);
    });

    it('returns an empty months list when the store has no subscription', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 't-1',
        name: 'Downtown',
        slug: 'downtown',
        company: { id: 'c-1', name: 'Acme Co' },
        brand: { id: 'b-1', name: 'Mango Cafe' },
        subscription: null,
      });

      const result = await service.getDetail('t-1');

      expect(result.activatedAt).toBeNull();
      expect(result.months).toEqual([]);
    });

    it('builds the rolling checklist when activated', async () => {
      const activatedAt = new Date('2026-06-01T00:00:00.000Z');
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 't-1',
        name: 'Downtown',
        slug: 'downtown',
        company: { id: 'c-1', name: 'Acme Co' },
        brand: { id: 'b-1', name: 'Mango Cafe' },
        subscription: { activatedAt, payments: [] },
      });

      const result = await service.getDetail('t-1');

      expect(result.activatedAt).toEqual(activatedAt);
      expect(result.months.length).toBeGreaterThan(0);
      expect(result.months[0].month).toBe('2026-06');
    });
  });

  describe('setActivation', () => {
    it('throws NotFoundException when the tenant does not exist', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);
      await expect(service.setActivation('missing', '2026-01-15')).rejects.toThrow(NotFoundException);
    });

    it('upserts the StoreSubscription with the parsed activation date', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 't-1' });
      const upserted = { id: 'sub-1', tenantId: 't-1', activatedAt: new Date('2026-01-15') };
      mockPrisma.storeSubscription.upsert.mockResolvedValue(upserted);

      const result = await service.setActivation('t-1', '2026-01-15');

      expect(mockPrisma.storeSubscription.upsert).toHaveBeenCalledWith({
        where: { tenantId: 't-1' },
        update: { activatedAt: new Date('2026-01-15') },
        create: { tenantId: 't-1', activatedAt: new Date('2026-01-15') },
      });
      expect(result).toEqual(upserted);
    });

    it('clears activation when passed null', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 't-1' });
      mockPrisma.storeSubscription.upsert.mockResolvedValue({ id: 'sub-1', tenantId: 't-1', activatedAt: null });

      await service.setActivation('t-1', null);

      expect(mockPrisma.storeSubscription.upsert).toHaveBeenCalledWith({
        where: { tenantId: 't-1' },
        update: { activatedAt: null },
        create: { tenantId: 't-1', activatedAt: null },
      });
    });
  });

  describe('upsertPayment', () => {
    it('throws BadRequestException for a malformed month', async () => {
      await expect(service.upsertPayment('t-1', '2026-13', { paid: true })).rejects.toThrow(BadRequestException);
      await expect(service.upsertPayment('t-1', 'not-a-month', { paid: true })).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when the store has no subscription yet', async () => {
      mockPrisma.storeSubscription.findUnique.mockResolvedValue(null);
      await expect(service.upsertPayment('t-1', '2026-02', { paid: true })).rejects.toThrow(NotFoundException);
    });

    it('upserts a paid payment and sets paidAt', async () => {
      mockPrisma.storeSubscription.findUnique.mockResolvedValue({ id: 'sub-1', tenantId: 't-1' });
      const upserted = { id: 'pay-1', subscriptionId: 'sub-1', paid: true };
      mockPrisma.subscriptionPayment.upsert.mockResolvedValue(upserted);

      const result = await service.upsertPayment('t-1', '2026-02', { paid: true, note: 'Bank transfer' });

      expect(mockPrisma.subscriptionPayment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { subscriptionId_month: expect.objectContaining({ subscriptionId: 'sub-1' }) },
          update: expect.objectContaining({ paid: true, note: 'Bank transfer' }),
          create: expect.objectContaining({ subscriptionId: 'sub-1', paid: true, note: 'Bank transfer' }),
        }),
      );
      expect(result).toEqual(upserted);
    });

    it('clears paidAt when marking a month unpaid', async () => {
      mockPrisma.storeSubscription.findUnique.mockResolvedValue({ id: 'sub-1', tenantId: 't-1' });
      mockPrisma.subscriptionPayment.upsert.mockResolvedValue({ id: 'pay-1', paid: false });

      await service.upsertPayment('t-1', '2026-02', { paid: false });

      expect(mockPrisma.subscriptionPayment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ paid: false, paidAt: null, note: null }),
        }),
      );
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- subscriptions/subscriptions.service.spec.ts`
Expected: FAIL — `service.getDetail is not a function` (and similarly for `setActivation`/`upsertPayment`).

- [ ] **Step 3: Write minimal implementation**

Add to `kioskly-api/src/subscriptions/subscriptions.service.ts`:

At the top, add imports:

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { buildSubscriptionMonths } from './subscription-months.util';
import { UpsertPaymentDto } from './dto/upsert-payment.dto';
```

(replace the existing `import { Injectable } from '@nestjs/common';` line with the combined one above)

Add these methods inside the `SubscriptionsService` class, after `getList`:

```ts
  async getDetail(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        company: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
        subscription: { select: { activatedAt: true, payments: true } },
      },
    });
    if (!tenant) throw new NotFoundException(`Store ${tenantId} not found`);

    const activatedAt = tenant.subscription?.activatedAt ?? null;
    const months = activatedAt
      ? buildSubscriptionMonths(activatedAt, new Date(), tenant.subscription!.payments)
      : [];

    return {
      tenantId: tenant.id,
      storeName: tenant.name,
      storeSlug: tenant.slug,
      company: tenant.company,
      brand: tenant.brand,
      activatedAt,
      months,
    };
  }

  async setActivation(tenantId: string, activatedAt: string | null) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Store ${tenantId} not found`);

    const parsed = activatedAt ? new Date(activatedAt) : null;
    return this.prisma.storeSubscription.upsert({
      where: { tenantId },
      update: { activatedAt: parsed },
      create: { tenantId, activatedAt: parsed },
    });
  }

  async upsertPayment(tenantId: string, month: string, dto: UpsertPaymentDto) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new BadRequestException('month must be in YYYY-MM format');
    }

    const subscription = await this.prisma.storeSubscription.findUnique({ where: { tenantId } });
    if (!subscription) {
      throw new NotFoundException(`Store ${tenantId} has no subscription yet — set an activation date first`);
    }

    const [year, monthNum] = month.split('-').map(Number);
    // The 15th is always safely inside the target month regardless of DST/offset —
    // getZonedMonthBounds then derives the exact store-local month-start instant.
    const monthStart = getZonedMonthBounds(new Date(Date.UTC(year, monthNum - 1, 15))).start;

    return this.prisma.subscriptionPayment.upsert({
      where: { subscriptionId_month: { subscriptionId: subscription.id, month: monthStart } },
      update: {
        paid: dto.paid,
        paidAt: dto.paid ? new Date() : null,
        note: dto.note ?? null,
      },
      create: {
        subscriptionId: subscription.id,
        month: monthStart,
        paid: dto.paid,
        paidAt: dto.paid ? new Date() : null,
        note: dto.note ?? null,
      },
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- subscriptions/subscriptions.service.spec.ts`
Expected: PASS, all tests across all four describe blocks.

- [ ] **Step 5: Commit**

```bash
git add kioskly-api/src/subscriptions/subscriptions.service.ts kioskly-api/src/subscriptions/subscriptions.service.spec.ts
git commit -m "feat(api): add subscription detail, activation, and payment upsert"
```

---

### Task 7: `SubscriptionsController`, `SubscriptionsModule`, and app wiring

**Files:**
- Create: `kioskly-api/src/subscriptions/subscriptions.controller.ts`
- Create: `kioskly-api/src/subscriptions/subscriptions.module.ts`
- Modify: `kioskly-api/src/app.module.ts`

**Interfaces:**
- Consumes: `SubscriptionsService` (Task 5/6), `SetActivationDto`/`UpsertPaymentDto` (Task 4), `JwtAuthGuard`/`RolesGuard`/`Roles` (existing, same as `PlatformController`).
- Produces: routes under `/platform/subscriptions` (see spec's API table). Task 9's frontend `api.ts` calls these exact paths.

- [ ] **Step 1: Create the controller**

Create `kioskly-api/src/subscriptions/subscriptions.controller.ts`:

```ts
import { Body, Controller, Get, Param, Patch, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SetActivationDto } from './dto/set-activation.dto';
import { UpsertPaymentDto } from './dto/upsert-payment.dto';

@ApiTags('subscriptions')
@Controller('platform/subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PLATFORM_ADMIN')
@ApiBearerAuth()
export class SubscriptionsController {
  constructor(private subscriptionsService: SubscriptionsService) {}

  @Get()
  @ApiOperation({ summary: 'Paginated list of stores with subscription/payment status' })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'brandId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['activated', 'pending'] })
  @ApiQuery({ name: 'paid', required: false, enum: ['paid', 'overdue'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getList(
    @Query('companyId') companyId?: string,
    @Query('brandId') brandId?: string,
    @Query('status') status?: 'activated' | 'pending',
    @Query('paid') paid?: 'paid' | 'overdue',
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.subscriptionsService.getList({ companyId, brandId, status, paid, page, limit });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Platform-wide subscription overview counts' })
  getStats() {
    return this.subscriptionsService.getStats();
  }

  @Get(':tenantId')
  @ApiOperation({ summary: "A store's subscription detail and rolling payment checklist" })
  getDetail(@Param('tenantId') tenantId: string) {
    return this.subscriptionsService.getDetail(tenantId);
  }

  @Patch(':tenantId/activation')
  @ApiOperation({ summary: "Set or clear a store's subscription activation date" })
  setActivation(@Param('tenantId') tenantId: string, @Body() dto: SetActivationDto) {
    return this.subscriptionsService.setActivation(tenantId, dto.activatedAt ?? null);
  }

  @Put(':tenantId/payments/:month')
  @ApiOperation({ summary: 'Upsert paid/unpaid status (+ optional note) for a given YYYY-MM month' })
  upsertPayment(
    @Param('tenantId') tenantId: string,
    @Param('month') month: string,
    @Body() dto: UpsertPaymentDto,
  ) {
    return this.subscriptionsService.upsertPayment(tenantId, month, dto);
  }
}
```

Note the declaration order: `getList` (no extra path), then `getStats` (`stats`), then `getDetail` (`:tenantId`) — `stats` must be registered before `:tenantId` or Nest would match `GET /platform/subscriptions/stats` to `getDetail` with `tenantId: 'stats'` instead.

- [ ] **Step 2: Create the module**

Create `kioskly-api/src/subscriptions/subscriptions.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
})
export class SubscriptionsModule {}
```

- [ ] **Step 3: Register the module in `app.module.ts`**

In `kioskly-api/src/app.module.ts`, add the import next to the other feature module imports:

```ts
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
```

And add `SubscriptionsModule` to the `imports` array, next to `PlatformModule`:

```ts
    PlatformModule,
    SubscriptionsModule,
```

- [ ] **Step 4: Verify the app builds and existing tests still pass**

Run: `npm run build --workspace=kioskly-api`
Expected: build succeeds.

Run: `npm run test --workspace=kioskly-api`
Expected: all existing suites plus the three new subscription spec files pass.

- [ ] **Step 5: Commit**

```bash
git add kioskly-api/src/subscriptions/subscriptions.controller.ts kioskly-api/src/subscriptions/subscriptions.module.ts kioskly-api/src/app.module.ts
git commit -m "feat(api): wire up subscriptions module and controller"
```

---

### Task 8: Frontend types and API client methods

**Files:**
- Modify: `kioscify-platform/types/index.ts`
- Modify: `kioscify-platform/lib/api.ts`

**Interfaces:**
- Produces: `SubscriptionMonthEntry`, `SubscriptionListItem`, `SubscriptionDetail`, `SubscriptionStats` types; `api.getSubscriptionStats()`, `api.getSubscriptions(filters)`, `api.getSubscriptionDetail(tenantId)`, `api.setStoreActivation(tenantId, activatedAt)`, `api.upsertSubscriptionPayment(tenantId, month, payload)`. Tasks 9 and 10 (the two pages) consume all of these.

- [ ] **Step 1: Add types**

Add to `kioscify-platform/types/index.ts`, after the existing `PlatformStats` interface:

```ts
export interface SubscriptionMonthEntry {
  month: string; // 'YYYY-MM'
  paid: boolean;
  paidAt: string | null;
  note: string | null;
}

export interface SubscriptionListItem {
  tenantId: string;
  storeName: string;
  storeSlug: string;
  company: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  activatedAt: string | null;
  paidThisMonth: boolean | null;
}

export interface SubscriptionDetail {
  tenantId: string;
  storeName: string;
  storeSlug: string;
  company: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  activatedAt: string | null;
  months: SubscriptionMonthEntry[];
}

export interface SubscriptionStats {
  totalStores: number;
  activated: number;
  pendingActivation: number;
  paidThisMonth: number;
  overdue: number;
}
```

- [ ] **Step 2: Add API client methods**

In `kioscify-platform/lib/api.ts`, add `SubscriptionMonthEntry, SubscriptionListItem, SubscriptionDetail, SubscriptionStats` to the `import type { ... } from '@/types'` block at the top of the file.

Then add this new section right after the `// ─── Platform stats ───...` block (after `updateMaintenanceStatus`, before `// ─── Companies ───...`):

```ts
  // ─── Subscriptions ────────────────────────────────────────────────────────

  async getSubscriptionStats(): Promise<SubscriptionStats> {
    const { data } = await this.client.get<SubscriptionStats>('/platform/subscriptions/stats');
    return data;
  }

  async getSubscriptions(filters: {
    companyId?: string;
    brandId?: string;
    status?: 'activated' | 'pending';
    paid?: 'paid' | 'overdue';
    page?: number;
    limit?: number;
  } = {}): Promise<{
    data: SubscriptionListItem[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const { data } = await this.client.get('/platform/subscriptions', { params: filters });
    return data;
  }

  async getSubscriptionDetail(tenantId: string): Promise<SubscriptionDetail> {
    const { data } = await this.client.get<SubscriptionDetail>(`/platform/subscriptions/${tenantId}`);
    return data;
  }

  async setStoreActivation(tenantId: string, activatedAt: string | null): Promise<{ activatedAt: string | null }> {
    const { data } = await this.client.patch(`/platform/subscriptions/${tenantId}/activation`, { activatedAt });
    return data;
  }

  async upsertSubscriptionPayment(
    tenantId: string,
    month: string,
    payload: { paid: boolean; note?: string },
  ): Promise<SubscriptionMonthEntry> {
    const { data } = await this.client.put(`/platform/subscriptions/${tenantId}/payments/${month}`, payload);
    return data;
  }
```

- [ ] **Step 3: Verify the frontend type-checks**

Run: `npm run build --workspace=kioscify-platform`
Expected: build succeeds (no pages reference these yet, but the file must compile standalone).

- [ ] **Step 4: Commit**

```bash
git add kioscify-platform/types/index.ts kioscify-platform/lib/api.ts
git commit -m "feat(platform): add subscription types and API client methods"
```

---

### Task 9: Subscriptions list page + nav item

**Files:**
- Modify: `kioscify-platform/app/(main)/layout.tsx`
- Create: `kioscify-platform/app/(main)/subscriptions/page.tsx`

**Interfaces:**
- Consumes: `api.getSubscriptionStats`, `api.getSubscriptions`, `api.getCompanies` (existing), types from Task 8.
- Produces: route `/subscriptions`, linking each row to `/subscriptions/[tenantId]` (Task 10).

- [ ] **Step 1: Add the nav item**

In `kioscify-platform/app/(main)/layout.tsx`, add `CreditCard` to the lucide-react import list:

```ts
import {
  LayoutDashboard,
  Building2,
  Settings,
  LogOut,
  Menu,
  X,
  Users,
  Smartphone,
  CreditCard,
} from 'lucide-react';
```

And add the nav entry between `Companies` and `Users`:

```ts
const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { href: '/users', label: 'Users', icon: Users },
  { href: '/app-releases', label: 'Kiosk App', icon: Smartphone },
  { href: '/settings', label: 'Settings', icon: Settings },
];
```

- [ ] **Step 2: Create the list page**

Create `kioscify-platform/app/(main)/subscriptions/page.tsx`:

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { SubscriptionListItem, SubscriptionStats, Company } from '@/types';
import { CreditCard, CheckCircle2, XCircle, Clock, LucideIcon } from 'lucide-react';

type StatusFilter = '' | 'activated' | 'pending';
type PaidFilter = '' | 'paid' | 'overdue';

export default function SubscriptionsPage() {
  const [stats, setStats] = useState<SubscriptionStats | null>(null);
  const [rows, setRows] = useState<SubscriptionListItem[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [paid, setPaid] = useState<PaidFilter>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getSubscriptions({
        companyId: companyId || undefined,
        status: status || undefined,
        paid: paid || undefined,
        page,
        limit: 20,
      });
      setRows(result.data);
      setTotalPages(result.pagination.totalPages);
    } finally {
      setLoading(false);
    }
  }, [companyId, status, paid, page]);

  useEffect(() => {
    api.getSubscriptionStats().then(setStats);
    api.getCompanies().then(setCompanies);
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Subscriptions</h1>
        <p className="text-sm text-gray-500">Track store activation and monthly payment status</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Total Stores" value={stats.totalStores} icon={CreditCard} tone="indigo" />
          <StatCard label="Activated" value={stats.activated} icon={CheckCircle2} tone="green" />
          <StatCard label="Pending Activation" value={stats.pendingActivation} icon={Clock} tone="gray" />
          <StatCard label="Paid This Month" value={stats.paidThisMonth} icon={CheckCircle2} tone="green" />
          <StatCard label="Overdue" value={stats.overdue} icon={XCircle} tone="red" />
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <select
          value={companyId}
          onChange={e => { setCompanyId(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">All Companies</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={status}
          onChange={e => { setStatus(e.target.value as StatusFilter); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">All Statuses</option>
          <option value="activated">Activated</option>
          <option value="pending">Pending Activation</option>
        </select>
        <select
          value={paid}
          onChange={e => { setPaid(e.target.value as PaidFilter); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">All Payment Status</option>
          <option value="paid">Paid This Month</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

      <div className="bg-white rounded-lg border divide-y">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">No stores match these filters</div>
        ) : (
          rows.map(row => (
            <Link
              key={row.tenantId}
              href={`/subscriptions/${row.tenantId}`}
              className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{row.storeName}</p>
                <p className="text-xs text-gray-400">{row.company?.name} · {row.brand?.name}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-gray-500">
                  {row.activatedAt ? `Activated ${new Date(row.activatedAt).toLocaleDateString()}` : 'Pending Activation'}
                </span>
                {row.activatedAt && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    row.paidThisMonth ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                  }`}>
                    {row.paidThisMonth ? 'Paid' : 'Overdue'}
                  </span>
                )}
              </div>
            </Link>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-3 py-1.5 text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: 'indigo' | 'green' | 'gray' | 'red';
}) {
  const toneClasses: Record<string, string> = {
    indigo: 'text-indigo-600 bg-indigo-50',
    green: 'text-green-600 bg-green-50',
    gray: 'text-gray-500 bg-gray-100',
    red: 'text-red-600 bg-red-50',
  };
  return (
    <div className="bg-white rounded-lg border p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${toneClasses[tone]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
```

- [ ] **Step 3: Manual verification (no frontend test suite exists in this repo)**

Start the API and platform admin dev servers:

```bash
npm run api:dev
npm run platform:dev
```

In a browser, log in to the Platform Admin portal, confirm a "Subscriptions" nav item appears between Companies and Users, click it, and verify: the overview cards render (all zeros/expected counts for existing seed data), the store list renders with "Pending Activation" for every store (since no `StoreSubscription` rows exist yet), and the company/status/payment filters narrow the list without errors.

- [ ] **Step 4: Commit**

```bash
git add "kioscify-platform/app/(main)/layout.tsx" "kioscify-platform/app/(main)/subscriptions/page.tsx"
git commit -m "feat(platform): add Subscriptions list page and nav item"
```

---

### Task 10: Subscription detail page

**Files:**
- Create: `kioscify-platform/app/(main)/subscriptions/[tenantId]/page.tsx`

**Interfaces:**
- Consumes: `api.getSubscriptionDetail`, `api.setStoreActivation`, `api.upsertSubscriptionPayment` (Task 8).

- [ ] **Step 1: Create the detail page**

Create `kioscify-platform/app/(main)/subscriptions/[tenantId]/page.tsx`:

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { SubscriptionDetail } from '@/types';
import { ChevronLeft, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function SubscriptionDetailPage() {
  const params = useParams();
  const tenantId = params.tenantId as string;

  const [detail, setDetail] = useState<SubscriptionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activationInput, setActivationInput] = useState('');
  const [savingActivation, setSavingActivation] = useState(false);
  const [savingMonth, setSavingMonth] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getSubscriptionDetail(tenantId);
      setDetail(result);
      setActivationInput(result.activatedAt ? result.activatedAt.slice(0, 10) : '');
      setNoteDrafts(Object.fromEntries(result.months.map(m => [m.month, m.note ?? ''])));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const handleSaveActivation = async (nextValue: string) => {
    setSavingActivation(true);
    try {
      await api.setStoreActivation(tenantId, nextValue || null);
      toast.success(nextValue ? 'Activation date updated' : 'Activation cleared');
      await load();
    } catch {
      toast.error('Failed to update activation date');
    } finally {
      setSavingActivation(false);
    }
  };

  const handleTogglePaid = async (month: string, currentlyPaid: boolean) => {
    setSavingMonth(month);
    try {
      await api.upsertSubscriptionPayment(tenantId, month, {
        paid: !currentlyPaid,
        note: noteDrafts[month] || undefined,
      });
      await load();
    } catch {
      toast.error('Failed to update payment status');
    } finally {
      setSavingMonth(null);
    }
  };

  const handleSaveNote = async (month: string, paid: boolean) => {
    setSavingMonth(month);
    try {
      await api.upsertSubscriptionPayment(tenantId, month, { paid, note: noteDrafts[month] || undefined });
      toast.success('Note saved');
      await load();
    } catch {
      toast.error('Failed to save note');
    } finally {
      setSavingMonth(null);
    }
  };

  if (loading || !detail) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/subscriptions" className="text-gray-400 hover:text-gray-600">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{detail.storeName}</h1>
          <p className="text-sm text-gray-500">{detail.company?.name} · {detail.brand?.name}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border p-5 flex items-end gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Subscription Activation Date</label>
          <input
            type="date"
            value={activationInput}
            onChange={e => setActivationInput(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
        <button
          onClick={() => handleSaveActivation(activationInput)}
          disabled={savingActivation || !activationInput}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {savingActivation ? 'Saving...' : detail.activatedAt ? 'Update' : 'Activate'}
        </button>
        {detail.activatedAt && (
          <button
            onClick={() => { setActivationInput(''); handleSaveActivation(''); }}
            disabled={savingActivation}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Clear
          </button>
        )}
      </div>

      {!detail.activatedAt ? (
        <div className="bg-white rounded-lg border py-16 text-center text-gray-400 text-sm">
          Set an activation date above to start the monthly payment checklist.
        </div>
      ) : (
        <div className="bg-white rounded-lg border divide-y">
          {detail.months.slice().reverse().map(m => (
            <div key={m.month} className="px-5 py-4 flex items-center gap-4">
              <button
                onClick={() => handleTogglePaid(m.month, m.paid)}
                disabled={savingMonth === m.month}
                className={`w-6 h-6 rounded flex items-center justify-center shrink-0 border transition-colors ${
                  m.paid ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300 text-transparent'
                }`}
              >
                <Check className="w-4 h-4" />
              </button>
              <div className="w-28 shrink-0">
                <p className="text-sm font-medium text-gray-900">{m.month}</p>
                {m.paid && m.paidAt && (
                  <p className="text-xs text-gray-400">Paid {new Date(m.paidAt).toLocaleDateString()}</p>
                )}
              </div>
              <input
                type="text"
                placeholder="Note (optional)"
                value={noteDrafts[m.month] ?? ''}
                onChange={e => setNoteDrafts(prev => ({ ...prev, [m.month]: e.target.value }))}
                onBlur={() => handleSaveNote(m.month, m.paid)}
                className="flex-1 px-3 py-1.5 border border-gray-200 rounded-md text-sm"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Manual verification (no frontend test suite exists in this repo)**

With `npm run api:dev` and `npm run platform:dev` still running: from the Subscriptions list page, click into any store. Verify:
1. With no activation date set: the empty-state message shows, and no checklist renders.
2. Enter a date a few months in the past and click "Activate": the checklist appears with one row per month up to the current month, all unpaid.
3. Click the checkbox on a row: it turns green/checked, a "Paid <date>" timestamp appears, and reloading the page preserves the state.
4. Type a note into a row, click elsewhere to blur: reload the page and confirm the note persisted.
5. Go back to the list page: confirm the store's activation date and current-month paid/overdue badge now reflect the change.
6. Click "Clear" on the detail page: confirm the store reverts to "Pending Activation" and the checklist disappears again.

- [ ] **Step 3: Commit**

```bash
git add "kioscify-platform/app/(main)/subscriptions/[tenantId]/page.tsx"
git commit -m "feat(platform): add subscription detail page with activation and payment checklist"
```

---

## Post-Implementation

After all tasks are complete and manually verified end-to-end, run the full backend test suite once more from the repo root to confirm nothing else regressed:

```bash
npm run test --workspace=kioskly-api
npm run build --workspace=kioskly-api
npm run build --workspace=kioscify-platform
```
