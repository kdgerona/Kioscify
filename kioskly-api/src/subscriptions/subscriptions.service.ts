import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getZonedMonthBounds } from '../common/utils/timezone';
import { buildSubscriptionMonths } from './subscription-months.util';
import { UpsertPaymentDto } from './dto/upsert-payment.dto';

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
}
