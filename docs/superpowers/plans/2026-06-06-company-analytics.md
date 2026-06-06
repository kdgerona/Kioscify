# Company Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Company Portal Analytics page (`/analytics`) showing franchise-level KPIs, top brands, top products per brand, top stores, and network growth — all aggregated at the company level with no individual store-level financial details exposed.

**Architecture:** Five per-widget API endpoints under `GET /analytics/company/*` in a new NestJS module, each scoped to the JWT `companyId`. Frontend has one orchestrator page that owns the date range state and passes `startDate`/`endDate` props to six independent client components that each manage their own fetch + loading/error state.

**Tech Stack:** NestJS 10, Prisma 6.19 (MongoDB), class-validator, Next.js 15 (client components), Tailwind CSS, lucide-react, recharts 2.15, date-fns 4.1

---

## File Map

**Create (API):**
- `kioskly-api/src/analytics/dto/analytics-query.dto.ts`
- `kioskly-api/src/analytics/analytics.service.ts`
- `kioskly-api/src/analytics/analytics.controller.ts`
- `kioskly-api/src/analytics/analytics.module.ts`

**Modify (API):**
- `kioskly-api/src/app.module.ts` — import `AnalyticsModule`

**Modify (Frontend):**
- `kioscify-company/types/index.ts` — add analytics interfaces
- `kioscify-company/lib/api.ts` — add 5 analytics methods

**Create (Frontend):**
- `kioscify-company/app/(main)/analytics/components/DateRangePicker.tsx`
- `kioscify-company/app/(main)/analytics/components/OverviewCards.tsx`
- `kioscify-company/app/(main)/analytics/components/TopBrandsWidget.tsx`
- `kioscify-company/app/(main)/analytics/components/TopProductsWidget.tsx`
- `kioscify-company/app/(main)/analytics/components/TopStoresWidget.tsx`
- `kioscify-company/app/(main)/analytics/components/NetworkGrowthChart.tsx`

**Replace (Frontend):**
- `kioscify-company/app/(main)/analytics/page.tsx` — replace placeholder

---

## Task 1: Analytics DTO + Module Skeleton

**Files:**
- Create: `kioskly-api/src/analytics/dto/analytics-query.dto.ts`
- Create: `kioskly-api/src/analytics/analytics.module.ts`

- [ ] **Step 1: Create the DTO file**

```typescript
// kioskly-api/src/analytics/dto/analytics-query.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class AnalyticsQueryDto {
  @ApiProperty({ example: '2026-06-01T00:00:00.000Z' })
  @IsISO8601()
  startDate: string;

  @ApiProperty({ example: '2026-06-30T23:59:59.999Z' })
  @IsISO8601()
  endDate: string;
}

export class TopProductsQueryDto extends AnalyticsQueryDto {
  @ApiProperty({ description: 'Brand ID to filter products by' })
  @IsString()
  brandId: string;
}
```

- [ ] **Step 2: Create the module skeleton**

```typescript
// kioskly-api/src/analytics/analytics.module.ts
import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
```

- [ ] **Step 3: Commit**

```bash
git add kioskly-api/src/analytics/dto/analytics-query.dto.ts kioskly-api/src/analytics/analytics.module.ts
git commit -m "feat(analytics): add analytics DTO and module skeleton"
```

---

## Task 2: Analytics Service

**Files:**
- Create: `kioskly-api/src/analytics/analytics.service.ts`

- [ ] **Step 1: Create the service**

```typescript
// kioskly-api/src/analytics/analytics.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getOverview(companyId: string, startDate: Date, endDate: Date) {
    const [totalBrands, allStores] = await Promise.all([
      this.prisma.brand.count({ where: { companyId, tombstone: { not: 1 } } }),
      this.prisma.tenant.findMany({
        where: { companyId, tombstone: { not: 1 } },
        select: { id: true },
      }),
    ]);
    const storeIds = allStores.map(s => s.id);

    const activeGroups = await this.prisma.transaction.groupBy({
      by: ['tenantId'],
      where: {
        tenantId: { in: storeIds },
        voidStatus: { not: 'APPROVED' },
        timestamp: { gte: startDate, lte: endDate },
      },
    });

    return {
      totalBrands,
      totalStores: storeIds.length,
      activeStores: activeGroups.length,
    };
  }

  async getTopBrands(companyId: string, startDate: Date, endDate: Date) {
    const brands = await this.prisma.brand.findMany({
      where: { companyId, tombstone: { not: 1 } },
      select: {
        id: true,
        name: true,
        stores: {
          where: { tombstone: { not: 1 } },
          select: { id: true },
        },
      },
    });

    const results = await Promise.all(
      brands.map(async brand => {
        const storeIds = brand.stores.map(s => s.id);
        if (storeIds.length === 0) {
          return {
            brandId: brand.id,
            brandName: brand.name,
            totalRevenue: 0,
            storeCount: 0,
            transactionCount: 0,
          };
        }
        const filter = {
          tenantId: { in: storeIds },
          voidStatus: { not: 'APPROVED' as const },
          timestamp: { gte: startDate, lte: endDate },
        };
        const [agg, transactionCount] = await Promise.all([
          this.prisma.transaction.aggregate({ where: filter, _sum: { total: true } }),
          this.prisma.transaction.count({ where: filter }),
        ]);
        return {
          brandId: brand.id,
          brandName: brand.name,
          totalRevenue: agg._sum.total ?? 0,
          storeCount: storeIds.length,
          transactionCount,
        };
      }),
    );

    return results.sort((a, b) => b.totalRevenue - a.totalRevenue);
  }

  async getTopProducts(
    companyId: string,
    brandId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const stores = await this.prisma.tenant.findMany({
      where: { companyId, brandId, tombstone: { not: 1 } },
      select: { id: true },
    });
    const storeIds = stores.map(s => s.id);
    if (storeIds.length === 0) return [];

    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenantId: { in: storeIds },
        voidStatus: { not: 'APPROVED' },
        timestamp: { gte: startDate, lte: endDate },
      },
      select: { id: true },
    });
    const txIds = transactions.map(t => t.id);
    if (txIds.length === 0) return [];

    const grouped = await this.prisma.transactionItem.groupBy({
      by: ['productId'],
      where: { transactionId: { in: txIds } },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    });

    const products = await this.prisma.product.findMany({
      where: { id: { in: grouped.map(g => g.productId) } },
      select: { id: true, name: true },
    });
    const productMap = new Map(products.map(p => [p.id, p.name]));

    return grouped.map(g => ({
      productId: g.productId,
      productName: productMap.get(g.productId) ?? 'Unknown',
      unitsSold: g._sum.quantity ?? 0,
      totalRevenue: g._sum.subtotal ?? 0,
    }));
  }

  async getTopStores(companyId: string, startDate: Date, endDate: Date) {
    const stores = await this.prisma.tenant.findMany({
      where: { companyId, tombstone: { not: 1 } },
      select: {
        id: true,
        name: true,
        brand: { select: { name: true } },
      },
    });

    const results = await Promise.all(
      stores.map(async store => {
        const filter = {
          tenantId: store.id,
          voidStatus: { not: 'APPROVED' as const },
          timestamp: { gte: startDate, lte: endDate },
        };
        const [agg, transactionCount] = await Promise.all([
          this.prisma.transaction.aggregate({ where: filter, _sum: { total: true } }),
          this.prisma.transaction.count({ where: filter }),
        ]);
        return {
          storeId: store.id,
          storeName: store.name,
          brandName: store.brand?.name ?? '—',
          totalRevenue: agg._sum.total ?? 0,
          transactionCount,
        };
      }),
    );

    return results.sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 10);
  }

  async getNetworkGrowth(companyId: string, startDate: Date, endDate: Date) {
    const [allBrands, allStores] = await Promise.all([
      this.prisma.brand.findMany({
        where: { companyId, tombstone: { not: 1 } },
        select: { createdAt: true },
      }),
      this.prisma.tenant.findMany({
        where: { companyId, tombstone: { not: 1 } },
        select: { createdAt: true },
      }),
    ]);

    const diffDays = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    const bucketMs =
      diffDays <= 1
        ? 60 * 60 * 1000
        : diffDays <= 31
        ? 24 * 60 * 60 * 1000
        : diffDays <= 90
        ? 7 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;

    const buckets: { date: string; storeCount: number; brandCount: number }[] = [];
    let cursor = startDate.getTime();
    while (cursor <= endDate.getTime()) {
      const bucketEnd = new Date(cursor);
      buckets.push({
        date: bucketEnd.toISOString(),
        brandCount: allBrands.filter(b => b.createdAt <= bucketEnd).length,
        storeCount: allStores.filter(s => s.createdAt <= bucketEnd).length,
      });
      cursor += bucketMs;
    }
    return buckets;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add kioskly-api/src/analytics/analytics.service.ts
git commit -m "feat(analytics): implement analytics service with 5 query methods"
```

---

## Task 3: Analytics Controller

**Files:**
- Create: `kioskly-api/src/analytics/analytics.controller.ts`

- [ ] **Step 1: Create the controller**

```typescript
// kioskly-api/src/analytics/analytics.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto, TopProductsQueryDto } from './dto/analytics-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CompanyId } from '../common/decorators/tenant.decorator';

@ApiTags('analytics')
@Controller('analytics/company')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('COMPANY_ADMIN')
@ApiBearerAuth()
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'KPI overview: total brands, stores, active stores' })
  overview(@CompanyId() companyId: string, @Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getOverview(
      companyId,
      new Date(query.startDate),
      new Date(query.endDate),
    );
  }

  @Get('top-brands')
  @ApiOperation({ summary: 'Brands ranked by aggregate revenue in period' })
  topBrands(@CompanyId() companyId: string, @Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getTopBrands(
      companyId,
      new Date(query.startDate),
      new Date(query.endDate),
    );
  }

  @Get('top-products')
  @ApiOperation({ summary: 'Top 10 products by units sold within a brand' })
  topProducts(@CompanyId() companyId: string, @Query() query: TopProductsQueryDto) {
    return this.analyticsService.getTopProducts(
      companyId,
      query.brandId,
      new Date(query.startDate),
      new Date(query.endDate),
    );
  }

  @Get('top-stores')
  @ApiOperation({ summary: 'Stores ranked by aggregate revenue in period' })
  topStores(@CompanyId() companyId: string, @Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getTopStores(
      companyId,
      new Date(query.startDate),
      new Date(query.endDate),
    );
  }

  @Get('growth')
  @ApiOperation({ summary: 'Cumulative store and brand count time series' })
  growth(@CompanyId() companyId: string, @Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getNetworkGrowth(
      companyId,
      new Date(query.startDate),
      new Date(query.endDate),
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add kioskly-api/src/analytics/analytics.controller.ts
git commit -m "feat(analytics): add analytics controller"
```

---

## Task 4: Register AnalyticsModule in AppModule

**Files:**
- Modify: `kioskly-api/src/app.module.ts`

- [ ] **Step 1: Add import**

In `kioskly-api/src/app.module.ts`, add after the existing imports:

```typescript
import { AnalyticsModule } from './analytics/analytics.module';
```

In the `imports` array, add after `PlatformModule`:

```typescript
AnalyticsModule,
```

- [ ] **Step 2: Verify API starts**

```bash
npm run api:dev
```

Expected: server starts on port 3000, no TypeScript errors.
Visit `http://localhost:3000/api/v1/docs` — should show the `analytics` tag with 5 endpoints.

- [ ] **Step 3: Smoke test with curl** (replace `<TOKEN>` with a real COMPANY_ADMIN JWT from login)

```bash
curl -H "Authorization: Bearer <TOKEN>" \
  "http://localhost:3000/api/v1/analytics/company/overview?startDate=2026-06-01T00:00:00.000Z&endDate=2026-06-30T23:59:59.999Z"
```

Expected: `{"totalBrands":N,"totalStores":N,"activeStores":N}`

- [ ] **Step 4: Commit**

```bash
git add kioskly-api/src/app.module.ts
git commit -m "feat(analytics): register AnalyticsModule in AppModule"
```

---

## Task 5: Frontend Analytics Types

**Files:**
- Modify: `kioscify-company/types/index.ts`

- [ ] **Step 1: Append analytics interfaces at the end of the file**

```typescript
// Add at the end of kioscify-company/types/index.ts

export interface AnalyticsOverview {
  totalBrands: number;
  totalStores: number;
  activeStores: number;
}

export interface TopBrandItem {
  brandId: string;
  brandName: string;
  totalRevenue: number;
  storeCount: number;
  transactionCount: number;
}

export interface TopProductItem {
  productId: string;
  productName: string;
  unitsSold: number;
  totalRevenue: number;
}

export interface TopStoreItem {
  storeId: string;
  storeName: string;
  brandName: string;
  totalRevenue: number;
  transactionCount: number;
}

export interface GrowthDataPoint {
  date: string;
  storeCount: number;
  brandCount: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add kioscify-company/types/index.ts
git commit -m "feat(analytics): add analytics TypeScript interfaces"
```

---

## Task 6: Frontend API Client Methods

**Files:**
- Modify: `kioscify-company/lib/api.ts`

- [ ] **Step 1: Add import at the top of api.ts**

In the import block at the top of `kioscify-company/lib/api.ts`, add the new types:

```typescript
import type {
  AuthResponse,
  Company,
  Brand,
  Category,
  Product,
  Size,
  Addon,
  InventoryBrandTemplate,
  User,
  CompanyUserCreatePayload,
  AnalyticsOverview,
  TopBrandItem,
  TopProductItem,
  TopStoreItem,
  GrowthDataPoint,
} from '@/types';
```

- [ ] **Step 2: Add analytics methods to the ApiClient class**

Add these methods at the end of the class, before the closing `}`:

```typescript
  // ─── Analytics ────────────────────────────────────────────────────────────

  async getAnalyticsOverview(startDate: string, endDate: string): Promise<AnalyticsOverview> {
    const { data } = await this.client.get<AnalyticsOverview>(
      '/analytics/company/overview',
      { params: { startDate, endDate } },
    );
    return data;
  }

  async getTopBrands(startDate: string, endDate: string): Promise<TopBrandItem[]> {
    const { data } = await this.client.get<TopBrandItem[]>(
      '/analytics/company/top-brands',
      { params: { startDate, endDate } },
    );
    return data;
  }

  async getTopProducts(
    brandId: string,
    startDate: string,
    endDate: string,
  ): Promise<TopProductItem[]> {
    const { data } = await this.client.get<TopProductItem[]>(
      '/analytics/company/top-products',
      { params: { brandId, startDate, endDate } },
    );
    return data;
  }

  async getTopStores(startDate: string, endDate: string): Promise<TopStoreItem[]> {
    const { data } = await this.client.get<TopStoreItem[]>(
      '/analytics/company/top-stores',
      { params: { startDate, endDate } },
    );
    return data;
  }

  async getNetworkGrowth(startDate: string, endDate: string): Promise<GrowthDataPoint[]> {
    const { data } = await this.client.get<GrowthDataPoint[]>(
      '/analytics/company/growth',
      { params: { startDate, endDate } },
    );
    return data;
  }
```

- [ ] **Step 3: Commit**

```bash
git add kioscify-company/lib/api.ts
git commit -m "feat(analytics): add analytics API client methods"
```

---

## Task 7: DateRangePicker Component

**Files:**
- Create: `kioscify-company/app/(main)/analytics/components/DateRangePicker.tsx`

- [ ] **Step 1: Create the component**

```typescript
// kioscify-company/app/(main)/analytics/components/DateRangePicker.tsx
'use client';
import { useState } from 'react';
import {
  startOfDay, endOfDay, subDays,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, subMonths,
  startOfYear, endOfYear,
  parseISO, differenceInDays, format,
} from 'date-fns';
import { Calendar } from 'lucide-react';

export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'last_3_months'
  | 'this_year'
  | 'custom';

interface Props {
  initialPreset?: DatePreset;
  onChange: (startDate: string, endDate: string) => void;
}

function getPresetRange(preset: Exclude<DatePreset, 'custom'>): { start: Date; end: Date } {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'yesterday': {
      const y = subDays(now, 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    case 'this_week':
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }),
        end: endOfWeek(now, { weekStartsOn: 1 }),
      };
    case 'this_month':
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'last_3_months':
      return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) };
    case 'this_year':
      return { start: startOfYear(now), end: endOfYear(now) };
  }
}

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_3_months', label: 'Last 3 Months' },
  { value: 'this_year', label: 'This Year' },
  { value: 'custom', label: 'Custom Range' },
];

export function DateRangePicker({ initialPreset = 'this_month', onChange }: Props) {
  const [preset, setPreset] = useState<DatePreset>(initialPreset);
  const [customStart, setCustomStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [customError, setCustomError] = useState<string | null>(null);

  function handlePresetChange(value: DatePreset) {
    setPreset(value);
    if (value !== 'custom') {
      const { start, end } = getPresetRange(value);
      onChange(start.toISOString(), end.toISOString());
    }
  }

  function handleCustomApply() {
    const start = startOfDay(parseISO(customStart));
    const end = endOfDay(parseISO(customEnd));
    const diff = differenceInDays(end, start);
    if (diff < 0) {
      setCustomError('Start date must be before end date');
      return;
    }
    if (diff > 730) {
      setCustomError('Date range cannot exceed 2 years');
      return;
    }
    setCustomError(null);
    onChange(start.toISOString(), end.toISOString());
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-gray-500" />
        <select
          value={preset}
          onChange={e => handlePresetChange(e.target.value as DatePreset)}
          className="text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {PRESETS.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>
      {preset === 'custom' && (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={customStart}
            onChange={e => setCustomStart(e.target.value)}
            className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-gray-400 text-sm">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={e => setCustomEnd(e.target.value)}
            className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={handleCustomApply}
            className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700 transition-colors"
          >
            Apply
          </button>
          {customError && <span className="text-xs text-red-600">{customError}</span>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add kioscify-company/app/(main)/analytics/components/DateRangePicker.tsx
git commit -m "feat(analytics): add DateRangePicker component"
```

---

## Task 8: OverviewCards Widget

**Files:**
- Create: `kioscify-company/app/(main)/analytics/components/OverviewCards.tsx`

- [ ] **Step 1: Create the component**

```typescript
// kioscify-company/app/(main)/analytics/components/OverviewCards.tsx
'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { AnalyticsOverview } from '@/types';
import { BookOpen, Store, Activity } from 'lucide-react';

interface Props {
  startDate: string;
  endDate: string;
}

export function OverviewCards({ startDate, endDate }: Props) {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getAnalyticsOverview(startDate, endDate)
      .then(setData)
      .catch((err: { response?: { data?: { message?: string } } }) =>
        setError(err?.response?.data?.message || 'Failed to load overview'),
      )
      .finally(() => setLoading(false));
  }, [startDate, endDate]);

  const cards = [
    {
      label: 'Total Brands',
      value: data?.totalBrands ?? 0,
      icon: BookOpen,
      bgClass: 'bg-indigo-50',
      iconClass: 'text-indigo-600',
    },
    {
      label: 'Total Stores',
      value: data?.totalStores ?? 0,
      icon: Store,
      bgClass: 'bg-green-50',
      iconClass: 'text-green-600',
    },
    {
      label: 'Active Stores',
      value: data?.activeStores ?? 0,
      icon: Activity,
      bgClass: 'bg-blue-50',
      iconClass: 'text-blue-600',
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-white rounded-lg border p-5 h-28 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map(({ label, value, icon: Icon, bgClass, iconClass }) => (
        <div key={label} className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500">{label}</span>
            <div className={`p-2 ${bgClass} rounded-lg`}>
              <Icon className={`w-4 h-4 ${iconClass}`} />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add kioscify-company/app/(main)/analytics/components/OverviewCards.tsx
git commit -m "feat(analytics): add OverviewCards widget"
```

---

## Task 9: TopBrandsWidget

**Files:**
- Create: `kioscify-company/app/(main)/analytics/components/TopBrandsWidget.tsx`

- [ ] **Step 1: Create the component**

```typescript
// kioscify-company/app/(main)/analytics/components/TopBrandsWidget.tsx
'use client';
import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { api } from '@/lib/api';
import type { TopBrandItem } from '@/types';

interface Props {
  startDate: string;
  endDate: string;
}

function peso(n: number) {
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function TopBrandsWidget({ startDate, endDate }: Props) {
  const [data, setData] = useState<TopBrandItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getTopBrands(startDate, endDate)
      .then(setData)
      .catch((err: { response?: { data?: { message?: string } } }) =>
        setError(err?.response?.data?.message || 'Failed to load brands'),
      )
      .finally(() => setLoading(false));
  }, [startDate, endDate]);

  return (
    <div className="bg-white rounded-lg border p-6">
      <h2 className="font-semibold text-gray-900 mb-4">Top Brands by Revenue</h2>
      {loading ? (
        <div className="h-48 bg-gray-100 rounded animate-pulse" />
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No data for this period</p>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tickFormatter={v => `₱${(v as number).toLocaleString()}`}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="brandName"
                  width={90}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip formatter={(v: number) => peso(v)} />
                <Bar dataKey="totalRevenue" name="Revenue" fill="#4f46e5" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-2">#</th>
                  <th className="pb-2 pr-4">Brand</th>
                  <th className="pb-2 text-right pr-4">Revenue</th>
                  <th className="pb-2 text-right pr-2">Txns</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.map((brand, i) => (
                  <tr key={brand.brandId} className="hover:bg-gray-50">
                    <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                    <td className="py-2 pr-4 font-medium text-gray-900">{brand.brandName}</td>
                    <td className="py-2 pr-4 text-right text-gray-700">{peso(brand.totalRevenue)}</td>
                    <td className="py-2 pr-2 text-right text-gray-500">
                      {brand.transactionCount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add kioscify-company/app/(main)/analytics/components/TopBrandsWidget.tsx
git commit -m "feat(analytics): add TopBrandsWidget with bar chart"
```

---

## Task 10: TopProductsWidget

**Files:**
- Create: `kioscify-company/app/(main)/analytics/components/TopProductsWidget.tsx`

- [ ] **Step 1: Create the component**

```typescript
// kioscify-company/app/(main)/analytics/components/TopProductsWidget.tsx
'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { TopProductItem, Brand } from '@/types';

interface Props {
  startDate: string;
  endDate: string;
}

function peso(n: number) {
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function TopProductsWidget({ startDate, endDate }: Props) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [data, setData] = useState<TopProductItem[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getBrands()
      .then(b => {
        setBrands(b);
        if (b.length > 0) setSelectedBrandId(b[0].id);
      })
      .catch(() => {})
      .finally(() => setLoadingBrands(false));
  }, []);

  useEffect(() => {
    if (!selectedBrandId) return;
    setLoading(true);
    setError(null);
    api
      .getTopProducts(selectedBrandId, startDate, endDate)
      .then(setData)
      .catch((err: { response?: { data?: { message?: string } } }) =>
        setError(err?.response?.data?.message || 'Failed to load products'),
      )
      .finally(() => setLoading(false));
  }, [selectedBrandId, startDate, endDate]);

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Top Products</h2>
        {!loadingBrands && brands.length > 0 && (
          <select
            value={selectedBrandId}
            onChange={e => setSelectedBrandId(e.target.value)}
            className="text-sm border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {brands.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
      </div>
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No data for this period</p>
      ) : (
        <div>
          {data.map((product, i) => (
            <div
              key={product.productId}
              className="flex items-center justify-between py-2.5 border-b last:border-0"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-gray-400 w-5">{i + 1}</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">{product.productName}</p>
                  <p className="text-xs text-gray-400">{product.unitsSold} units sold</p>
                </div>
              </div>
              <span className="text-sm font-semibold text-gray-700">
                {peso(product.totalRevenue)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add kioscify-company/app/(main)/analytics/components/TopProductsWidget.tsx
git commit -m "feat(analytics): add TopProductsWidget with brand selector"
```

---

## Task 11: TopStoresWidget

**Files:**
- Create: `kioscify-company/app/(main)/analytics/components/TopStoresWidget.tsx`

- [ ] **Step 1: Create the component**

```typescript
// kioscify-company/app/(main)/analytics/components/TopStoresWidget.tsx
'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { TopStoreItem } from '@/types';

interface Props {
  startDate: string;
  endDate: string;
}

function peso(n: number) {
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function TopStoresWidget({ startDate, endDate }: Props) {
  const [data, setData] = useState<TopStoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getTopStores(startDate, endDate)
      .then(setData)
      .catch((err: { response?: { data?: { message?: string } } }) =>
        setError(err?.response?.data?.message || 'Failed to load stores'),
      )
      .finally(() => setLoading(false));
  }, [startDate, endDate]);

  return (
    <div className="bg-white rounded-lg border p-6">
      <h2 className="font-semibold text-gray-900 mb-4">Top Stores by Revenue</h2>
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No data for this period</p>
      ) : (
        <div>
          {data.map((store, i) => (
            <div
              key={store.storeId}
              className="flex items-center justify-between py-2.5 border-b last:border-0"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-gray-400 w-5">{i + 1}</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">{store.storeName}</p>
                  <p className="text-xs text-gray-400">{store.brandName}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-700">{peso(store.totalRevenue)}</p>
                <p className="text-xs text-gray-400">
                  {store.transactionCount.toLocaleString()} txns
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add kioscify-company/app/(main)/analytics/components/TopStoresWidget.tsx
git commit -m "feat(analytics): add TopStoresWidget"
```

---

## Task 12: NetworkGrowthChart

**Files:**
- Create: `kioscify-company/app/(main)/analytics/components/NetworkGrowthChart.tsx`

- [ ] **Step 1: Create the component**

```typescript
// kioscify-company/app/(main)/analytics/components/NetworkGrowthChart.tsx
'use client';
import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { format, parseISO, differenceInDays } from 'date-fns';
import { api } from '@/lib/api';
import type { GrowthDataPoint } from '@/types';

interface Props {
  startDate: string;
  endDate: string;
}

export function NetworkGrowthChart({ startDate, endDate }: Props) {
  const [data, setData] = useState<GrowthDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getNetworkGrowth(startDate, endDate)
      .then(setData)
      .catch((err: { response?: { data?: { message?: string } } }) =>
        setError(err?.response?.data?.message || 'Failed to load growth data'),
      )
      .finally(() => setLoading(false));
  }, [startDate, endDate]);

  const diffDays = differenceInDays(parseISO(endDate), parseISO(startDate));
  const dateFormat =
    diffDays <= 1 ? 'HH:mm' : diffDays <= 31 ? 'MMM d' : diffDays <= 90 ? 'MMM d' : 'MMM yyyy';

  const chartData = data.map(d => ({
    ...d,
    label: format(parseISO(d.date), dateFormat),
  }));

  return (
    <div className="bg-white rounded-lg border p-6">
      <h2 className="font-semibold text-gray-900 mb-4">Network Growth</h2>
      {loading ? (
        <div className="h-52 bg-gray-100 rounded animate-pulse" />
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No data for this period</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="storeCount"
              name="Stores"
              stroke="#4f46e5"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="brandCount"
              name="Brands"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add kioscify-company/app/(main)/analytics/components/NetworkGrowthChart.tsx
git commit -m "feat(analytics): add NetworkGrowthChart"
```

---

## Task 13: Wire Up Analytics Page

**Files:**
- Replace: `kioscify-company/app/(main)/analytics/page.tsx`

- [ ] **Step 1: Replace the placeholder page**

```typescript
// kioscify-company/app/(main)/analytics/page.tsx
'use client';
import { useState } from 'react';
import { startOfMonth, endOfDay } from 'date-fns';
import { DateRangePicker } from './components/DateRangePicker';
import { OverviewCards } from './components/OverviewCards';
import { TopBrandsWidget } from './components/TopBrandsWidget';
import { TopProductsWidget } from './components/TopProductsWidget';
import { TopStoresWidget } from './components/TopStoresWidget';
import { NetworkGrowthChart } from './components/NetworkGrowthChart';

export default function AnalyticsPage() {
  const [startDate, setStartDate] = useState(startOfMonth(new Date()).toISOString());
  const [endDate, setEndDate] = useState(endOfDay(new Date()).toISOString());

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">Cross-brand performance overview</p>
        </div>
        <DateRangePicker
          initialPreset="this_month"
          onChange={(start, end) => {
            setStartDate(start);
            setEndDate(end);
          }}
        />
      </div>

      <OverviewCards startDate={startDate} endDate={endDate} />

      <TopBrandsWidget startDate={startDate} endDate={endDate} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopProductsWidget startDate={startDate} endDate={endDate} />
        <TopStoresWidget startDate={startDate} endDate={endDate} />
      </div>

      <NetworkGrowthChart startDate={startDate} endDate={endDate} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add kioscify-company/app/(main)/analytics/page.tsx
git commit -m "feat(analytics): wire up analytics page orchestrator"
```

---

## Task 14: End-to-End Verification

- [ ] **Step 1: Start both services**

```bash
npm run api:dev      # terminal 1
npm run company:dev  # terminal 2
```

- [ ] **Step 2: Log in and navigate**

Open `http://marajoy.kioscify.localhost:3001` in a browser. Log in as COMPANY_ADMIN. Navigate to `/analytics`.

Expected:
- Page renders with header, date range dropdown, and all 5 widgets
- Default range is "This Month"
- KPI cards show brand/store counts (should match what you see in dashboard)
- TopBrands shows brands ranked by revenue (bar chart + table)
- TopProducts shows a brand selector and products for the selected brand
- TopStores shows stores ranked by revenue
- NetworkGrowth shows a line chart

- [ ] **Step 3: Test date range switching**

Change the dropdown to each preset (Today, Yesterday, This Week, This Year). Verify all widgets update and show loading spinners during fetch.

- [ ] **Step 4: Test custom range**

Select "Custom Range". Enter a start date and end date within 2 years. Click Apply. Verify widgets update.

Try entering an end date before start date — should show "Start date must be before end date".

Try a range > 2 years — should show "Date range cannot exceed 2 years".

- [ ] **Step 5: Test TopProducts brand selector**

If you have multiple brands, switch the brand dropdown in TopProducts. Verify the product list updates and only shows products for the selected brand.

- [ ] **Step 6: Verify 403 for wrong role**

```bash
# Use a STORE_ADMIN token (from store portal login)
curl -H "Authorization: Bearer <STORE_ADMIN_TOKEN>" \
  "http://localhost:3000/api/v1/analytics/company/overview?startDate=2026-06-01T00:00:00.000Z&endDate=2026-06-30T23:59:59.999Z"
```

Expected: `{"statusCode":403,"message":"Forbidden resource"}`
