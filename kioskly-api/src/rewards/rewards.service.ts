import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  RewardEventType,
  RewardProgram,
  RewardProgramScope,
  RewardProgramStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PriceTiersService } from '../price-tiers/price-tiers.service';
import { RewardTypeRegistry } from './reward-type.registry';
import { RewardApplicationDto } from './dto/reward-application.dto';
import {
  CreateRewardProgramDto,
  ListRewardProgramsQueryDto,
  UpdateRewardProgramDto,
} from './dto/reward-program.dto';
import { RewardEventsQueryDto } from './dto/reward-events-query.dto';
import type {
  RewardEventDraft,
  RewardItemContext,
} from './types/reward-type-handler.interface';
import { MONEY_EPSILON } from './types/loyalty-card.handler';
import {
  Paginated,
  pageArgs,
  toPaginated,
  toPagination,
} from '../common/utils/pagination';

/** The authenticated user, as the controller passes it in. */
export interface RewardsCaller {
  id: string;
  role: string;
  tenantId?: string | null;
  companyId?: string | null;
}

/** Minimal transaction shape the reward engine reads. */
export interface RewardTransactionInput {
  subtotal: number;
  total: number;
  timestamp?: string;
  items: Array<{
    productId: string;
    quantity: number;
    sizeId?: string;
    subtotal: number;
    discountAmount?: number;
  }>;
  rewards?: RewardApplicationDto[];
}

type ProgramWithStores = RewardProgram & { stores?: { tenantId: string }[] };

const NOT_DELETED = { not: 1 };
const OBJECT_ID = /^[a-f\d]{24}$/i;
const EVENT_TYPES = Object.values(RewardEventType);
const round2 = (n: number) => Math.round(n * 100) / 100;

const effectiveRole = (role: string) =>
  role === 'ADMIN' ? 'STORE_ADMIN' : role;

function withinDates(
  program: Pick<RewardProgram, 'startsAt' | 'endsAt'>,
  at: Date,
): boolean {
  if (program.startsAt && at < program.startsAt) return false;
  if (program.endsAt && at > program.endsAt) return false;
  return true;
}

@Injectable()
export class RewardsService {
  constructor(
    private prisma: PrismaService,
    private registry: RewardTypeRegistry,
    private priceTiers: PriceTiersService,
  ) {}

  // ─── Programs ─────────────────────────────────────────────────────────────

  async listPrograms(
    caller: RewardsCaller,
    query: ListRewardProgramsQueryDto = {},
  ) {
    const role = effectiveRole(caller.role);
    let where: Prisma.RewardProgramWhereInput;

    if (role === 'STORE_ADMIN') {
      where = {
        ...(await this.storeVisibilityWhere(caller)),
        ...(query.status && { status: query.status }),
      };
    } else {
      const companyId = this.resolveCompanyId(caller, query.companyId);
      where = {
        companyId,
        tombstone: NOT_DELETED,
        scope: query.scope ?? RewardProgramScope.COMPANY,
        ...(query.brandId && { brandId: query.brandId }),
        ...(query.status && { status: query.status }),
      };
    }

    const programs = await this.prisma.rewardProgram.findMany({
      where,
      include: { stores: { select: { tenantId: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return programs.map((p) => this.formatProgram(p, caller));
  }

  async getProgram(id: string, caller: RewardsCaller, companyIdQuery?: string) {
    const program = await this.findVisible(id, caller, companyIdQuery);
    return this.formatProgram(program, caller);
  }

  async createProgram(dto: CreateRewardProgramDto, caller: RewardsCaller) {
    const role = effectiveRole(caller.role);
    const handler = this.registry.get(dto.type);
    const config = handler.validateConfig(dto.config);
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    this.assertDateRange(startsAt, endsAt);

    let owner: {
      companyId: string;
      brandId: string;
      tenantId: string | null;
      scope: RewardProgramScope;
    };

    if (role === 'COMPANY_ADMIN') {
      if (!caller.companyId)
        throw new ForbiddenException('No company in session');
      if (!dto.brandId) throw new BadRequestException('brandId is required');
      const brand = await this.prisma.brand.findFirst({
        where: {
          id: dto.brandId,
          companyId: caller.companyId,
          tombstone: NOT_DELETED,
        },
        select: { id: true },
      });
      if (!brand) throw new NotFoundException(`Brand ${dto.brandId} not found`);
      owner = {
        companyId: caller.companyId,
        brandId: brand.id,
        tenantId: null,
        scope: RewardProgramScope.COMPANY,
      };
    } else if (role === 'STORE_ADMIN') {
      const tenant = await this.getCallerTenant(caller);
      if (!tenant.brandId || !tenant.companyId) {
        throw new BadRequestException(
          'This store is not assigned to a brand yet; reward programs need one',
        );
      }
      owner = {
        companyId: tenant.companyId,
        brandId: tenant.brandId,
        tenantId: tenant.id,
        scope: RewardProgramScope.STORE,
      };
    } else {
      throw new ForbiddenException(
        'Only company or store admins can create reward programs',
      );
    }

    const program = await this.prisma.rewardProgram.create({
      data: {
        ...owner,
        type: dto.type,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        status: dto.status ?? RewardProgramStatus.DRAFT,
        startsAt,
        endsAt,
        config: config as Prisma.InputJsonValue,
        createdById: caller.id,
      },
      include: { stores: { select: { tenantId: true } } },
    });
    return this.formatProgram(program, caller);
  }

  async updateProgram(
    id: string,
    dto: UpdateRewardProgramDto,
    caller: RewardsCaller,
  ) {
    const existing = await this.findEditable(id, caller);

    if (
      dto.status === RewardProgramStatus.DRAFT &&
      existing.status !== RewardProgramStatus.DRAFT
    ) {
      // Once live, sales may already reference the program (possibly still
      // queued offline). DRAFT programs reject sales, so going back would drop them.
      throw new BadRequestException(
        'A program cannot go back to DRAFT once it has been activated',
      );
    }

    const startsAt =
      dto.startsAt === undefined
        ? existing.startsAt
        : dto.startsAt
          ? new Date(dto.startsAt)
          : null;
    const endsAt =
      dto.endsAt === undefined
        ? existing.endsAt
        : dto.endsAt
          ? new Date(dto.endsAt)
          : null;
    this.assertDateRange(startsAt, endsAt);

    const data: Prisma.RewardProgramUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined)
      data.description = dto.description?.trim() || null;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.startsAt !== undefined) data.startsAt = startsAt;
    if (dto.endsAt !== undefined) data.endsAt = endsAt;
    if (dto.config !== undefined) {
      data.config = this.registry
        .get(existing.type)
        .validateConfig(dto.config) as Prisma.InputJsonValue;
    }

    const program = await this.prisma.rewardProgram.update({
      where: { id: existing.id },
      data,
      include: { stores: { select: { tenantId: true } } },
    });
    return this.formatProgram(program, caller);
  }

  async deleteProgram(id: string, caller: RewardsCaller) {
    const existing = await this.findEditable(id, caller);
    // Soft delete: events keep referencing the program for history.
    await this.prisma.rewardProgram.update({
      where: { id: existing.id },
      data: { tombstone: 1, status: RewardProgramStatus.ARCHIVED },
    });
    return { id: existing.id, deleted: true };
  }

  async setStores(id: string, tenantIds: string[], caller: RewardsCaller) {
    if (effectiveRole(caller.role) !== 'COMPANY_ADMIN' || !caller.companyId) {
      throw new ForbiddenException('Only company admins can enroll stores');
    }
    if (!OBJECT_ID.test(id))
      throw new NotFoundException(`Reward program ${id} not found`);
    const program = await this.prisma.rewardProgram.findFirst({
      where: {
        id,
        companyId: caller.companyId,
        scope: RewardProgramScope.COMPANY,
        tombstone: NOT_DELETED,
      },
    });
    if (!program) throw new NotFoundException(`Reward program ${id} not found`);

    const wanted = Array.from(new Set(tenantIds));
    const valid = wanted.length
      ? await this.prisma.tenant.findMany({
          where: {
            id: { in: wanted },
            companyId: program.companyId,
            brandId: program.brandId,
            tombstone: NOT_DELETED,
          },
          select: { id: true },
        })
      : [];
    const validIds = new Set(valid.map((t) => t.id));
    const invalid = wanted.filter((t) => !validIds.has(t));
    if (invalid.length) {
      throw new BadRequestException(
        `These stores do not belong to the program's company and brand: ${invalid.join(', ')}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.rewardProgramStore.deleteMany({
        where: { programId: program.id, tenantId: { notIn: wanted } },
      });
      const current = await tx.rewardProgramStore.findMany({
        where: { programId: program.id },
        select: { tenantId: true },
      });
      const have = new Set(current.map((c) => c.tenantId));
      const toAdd = wanted.filter((t) => !have.has(t));
      if (toAdd.length) {
        await tx.rewardProgramStore.createMany({
          data: toAdd.map((tenantId) => ({ programId: program.id, tenantId })),
        });
      }
    });

    return this.getProgram(program.id, caller);
  }

  /** Programs live right now for a store (kiosk). */
  async getActiveForTenant(tenantId: string, at: Date = new Date()) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, brandId: true },
    });
    if (!tenant) return [];

    const programs = await this.prisma.rewardProgram.findMany({
      where: {
        tombstone: NOT_DELETED,
        status: RewardProgramStatus.ACTIVE,
        OR: this.tenantProgramsOr(tenant.id, tenant.brandId),
      },
      orderBy: { createdAt: 'asc' },
    });

    return programs
      .filter((p) => withinDates(p, at))
      .map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description ?? null,
        type: p.type,
        scope: p.scope,
        status: p.status,
        brandId: p.brandId,
        tenantId: p.tenantId ?? null,
        startsAt: p.startsAt ?? null,
        endsAt: p.endsAt ?? null,
        config: p.config,
        updatedAt: p.updatedAt,
      }));
  }

  // ─── Transaction integration ──────────────────────────────────────────────

  /**
   * Validates a transaction's reward applications and returns event drafts
   * (everything except transactionId).
   *
   * HARD (400, sale rejected): malformed or tampered input — unknown program or
   * one of another company, itemIndex out of range, duplicate slot / card issue
   * / redemption in one program, more item stamps than the item's quantity,
   * redemptions above the item's discountAmount.
   *
   * SOFT (sale and event saved, event.validationWarnings set): anything that
   * can change between an offline sale and its sync — program deleted, DRAFT,
   * unenrolled / not owned, brand mismatch, outside its dates, slot removed,
   * condition no longer met, discount above the computed maximum. The kiosk
   * sync engine permanently fails a sale after repeated 4xx, so these must
   * never reject it.
   */
  async prepareTransactionRewards(
    tenantId: string,
    userId: string,
    tx: RewardTransactionInput,
  ): Promise<RewardEventDraft[]> {
    const applications = tx.rewards ?? [];
    if (applications.length === 0) return [];

    const occurredAt = tx.timestamp ? new Date(tx.timestamp) : new Date();
    const programIds = Array.from(
      new Set(applications.map((a) => a.programId)),
    );

    const [tenant, programs] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, brandId: true, companyId: true },
      }),
      // Tombstoned programs are included on purpose: a sale made before the
      // program was deleted is still recorded (with a warning).
      this.prisma.rewardProgram.findMany({
        where: { id: { in: programIds } },
        include: {
          stores: { where: { tenantId }, select: { tenantId: true } },
        },
      }),
    ]);
    if (!tenant) throw new BadRequestException('Unknown store');

    // HARD: the program must exist and belong to this store's company.
    // SOFT: everything that can change between an offline sale and its sync.
    const byId = new Map(programs.map((p) => [p.id, p]));
    const errors: string[] = [];
    const programWarnings = new Map<string, string[]>();
    for (const id of programIds) {
      const p = byId.get(id);
      if (!p || !tenant.companyId || p.companyId !== tenant.companyId) {
        // Same message for both, so ids of other companies are not confirmed.
        errors.push(`rewards: program ${id} not found`);
        continue;
      }
      const warnings: string[] = [];
      if (p.tombstone === 1) warnings.push('program has been deleted');
      if (p.status === RewardProgramStatus.DRAFT)
        warnings.push('program is in DRAFT');
      if (p.scope === RewardProgramScope.STORE) {
        if (p.tenantId !== tenant.id)
          warnings.push('program is not owned by this store');
      } else {
        if ((p.stores?.length ?? 0) === 0)
          warnings.push('store is not enrolled in this program');
        if (p.brandId !== tenant.brandId)
          warnings.push("program brand does not match the store's brand");
      }
      if (!withinDates(p, occurredAt))
        warnings.push(`program was not running at ${occurredAt.toISOString()}`);
      programWarnings.set(id, warnings);
    }
    if (errors.length) throw new BadRequestException(errors);

    const needsItems = applications.some(
      (a) => a.itemIndex !== undefined && a.itemIndex !== null,
    );
    const items = needsItems
      ? await this.buildItemContext(tenantId, tx.items)
      : [];
    const context = { subtotal: tx.subtotal, total: tx.total, items };

    const drafts: RewardEventDraft[] = [];
    for (const id of programIds) {
      const program = byId.get(id)!;
      const handler = this.registry.get(program.type);
      const apps = applications.filter((a) => a.programId === id);
      const validated = handler.validateApplications(program, apps, context);
      drafts.push(
        ...handler.toEvents(validated, {
          programId: program.id,
          programType: program.type,
          programName: program.name,
          tenantId: tenant.id,
          companyId: program.companyId,
          brandId: program.brandId,
          userId,
          occurredAt,
          validationWarnings: programWarnings.get(id) ?? [],
        }),
      );
    }

    // Reward discounts must already be reflected in the line's discountAmount
    // (the kiosk adds them there), across all programs.
    const rewardPerItem = new Map<number, number>();
    for (const d of drafts) {
      if (d.type === RewardEventType.REWARD_REDEEMED && d.itemIndex != null) {
        rewardPerItem.set(
          d.itemIndex,
          (rewardPerItem.get(d.itemIndex) ?? 0) + (d.discountAmount ?? 0),
        );
      }
    }
    for (const [index, reward] of rewardPerItem) {
      const lineDiscount = items[index]?.discountAmount ?? 0;
      if (reward > lineDiscount + MONEY_EPSILON) {
        errors.push(
          `rewards: item ${index} carries reward discounts of ${round2(reward)} but its discountAmount is only ${lineDiscount}`,
        );
      }
    }
    if (errors.length) throw new BadRequestException(errors);

    return drafts;
  }

  /** Marks every reward event of a transaction as voided. */
  markTransactionVoided(
    transactionId: string,
    client: Pick<Prisma.TransactionClient, 'rewardEvent'> = this.prisma,
  ) {
    return client.rewardEvent.updateMany({
      where: { transactionId },
      data: { isVoided: true },
    });
  }

  // ─── Events & summary ─────────────────────────────────────────────────────

  async listEvents(
    caller: RewardsCaller,
    query: RewardEventsQueryDto,
  ): Promise<Paginated<any>> {
    const where = this.eventWhere(caller, query);
    const pagination = toPagination(query.page ?? 1, query.limit)!;

    const [events, total] = await Promise.all([
      this.prisma.rewardEvent.findMany({
        where,
        include: { transaction: { select: { transactionId: true } } },
        orderBy: { occurredAt: 'desc' },
        ...pageArgs(pagination),
      }),
      this.prisma.rewardEvent.count({ where }),
    ]);

    const [stores, users] = await Promise.all([
      this.storeNames(events.map((e) => e.tenantId)),
      this.prisma.user.findMany({
        where: { id: { in: Array.from(new Set(events.map((e) => e.userId))) } },
        select: { id: true, firstName: true, lastName: true, username: true },
      }),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));

    const data = events.map((e) => {
      const u = userById.get(e.userId);
      return {
        id: e.id,
        programId: e.programId,
        programType: e.programType,
        programName: e.programName,
        tenantId: e.tenantId,
        storeName: stores.get(e.tenantId) ?? null,
        companyId: e.companyId,
        brandId: e.brandId,
        transactionId: e.transactionId,
        transactionCode: (e as any).transaction?.transactionId ?? null,
        userId: e.userId,
        cashierName: u
          ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.username
          : null,
        type: e.type,
        slotKey: e.slotKey ?? null,
        slotLabel: e.slotLabel ?? null,
        itemIndex: e.itemIndex ?? null,
        productName: e.productName ?? null,
        discountAmount: e.discountAmount ?? null,
        isVoided: e.isVoided,
        validationWarnings: e.validationWarnings ?? [],
        occurredAt: e.occurredAt,
        createdAt: e.createdAt,
      };
    });

    return toPaginated(data, total, pagination);
  }

  async summary(caller: RewardsCaller, query: RewardEventsQueryDto) {
    const where = this.eventWhere(caller, query);
    const [groups, flaggedEvents] = await Promise.all([
      this.prisma.rewardEvent.groupBy({
        by: ['tenantId', 'programId', 'type', 'slotKey'],
        where,
        _count: { _all: true },
        _sum: { discountAmount: true },
        orderBy: [{ tenantId: 'asc' }],
      } as any),
      // Arrays cannot be grouped on, so flagged events are counted separately.
      this.prisma.rewardEvent.count({
        where: { AND: [where, { validationWarnings: { isEmpty: false } }] },
      }),
    ]);

    const zeroTotals = () =>
      Object.fromEntries(EVENT_TYPES.map((t) => [t, 0])) as Record<
        RewardEventType,
        number
      >;
    const totals = zeroTotals();
    let totalRewardDiscount = 0;
    const bySlot = new Map<string, any>();
    const byStore = new Map<string, any>();

    for (const g of groups as any[]) {
      const count: number = g._count?._all ?? 0;
      const discount: number = g._sum?.discountAmount ?? 0;
      totals[g.type as RewardEventType] += count;
      totalRewardDiscount += discount;

      const slotKey = `${g.programId}|${g.type}|${g.slotKey ?? ''}`;
      const slot = bySlot.get(slotKey) ?? {
        programId: g.programId,
        programName: null as string | null,
        type: g.type,
        slotKey: g.slotKey ?? null,
        slotLabel: null as string | null,
        count: 0,
        discountTotal: 0,
      };
      slot.count += count;
      slot.discountTotal = round2(slot.discountTotal + discount);
      bySlot.set(slotKey, slot);

      const store = byStore.get(g.tenantId) ?? {
        tenantId: g.tenantId,
        storeName: null as string | null,
        ...zeroTotals(),
        totalRewardDiscount: 0,
      };
      store[g.type] += count;
      store.totalRewardDiscount = round2(store.totalRewardDiscount + discount);
      byStore.set(g.tenantId, store);
    }

    // Names come from the latest snapshot (programs/slots may be renamed).
    const programIds = Array.from(
      new Set(Array.from(bySlot.values()).map((s) => s.programId)),
    );
    const [programs, stores] = await Promise.all([
      programIds.length
        ? this.prisma.rewardProgram.findMany({
            where: { id: { in: programIds } },
            select: { id: true, name: true, config: true },
          })
        : Promise.resolve(
            [] as { id: string; name: string; config: unknown }[],
          ),
      this.storeNames(Array.from(byStore.keys())),
    ]);
    const programById = new Map(programs.map((p) => [p.id, p]));
    for (const slot of bySlot.values()) {
      const program = programById.get(slot.programId);
      slot.programName = program?.name ?? null;
      const slots: any[] = (program?.config as any)?.slots ?? [];
      slot.slotLabel = slot.slotKey
        ? (slots.find((s) => s.key === slot.slotKey)?.label ?? slot.slotKey)
        : null;
    }
    for (const store of byStore.values())
      store.storeName = stores.get(store.tenantId) ?? null;

    return {
      totals: { ...totals, flaggedEvents },
      totalEvents: EVENT_TYPES.reduce((sum, t) => sum + totals[t], 0),
      totalRewardDiscount: round2(totalRewardDiscount),
      bySlot: Array.from(bySlot.values()).sort((a, b) => b.count - a.count),
      byStore: Array.from(byStore.values()).sort((a, b) =>
        (a.storeName ?? '').localeCompare(b.storeName ?? ''),
      ),
    };
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private formatProgram(p: ProgramWithStores, caller: RewardsCaller) {
    const role = effectiveRole(caller.role);
    const isStore = role === 'STORE_ADMIN';
    const editable = isStore
      ? p.scope === RewardProgramScope.STORE && p.tenantId === caller.tenantId
      : role === 'COMPANY_ADMIN' && p.scope === RewardProgramScope.COMPANY;
    const storeIds = (p.stores ?? []).map((s) => s.tenantId);
    let summary = '';
    try {
      summary = this.registry.get(p.type).describe(p.config);
    } catch {
      /* unknown type: leave empty */
    }
    return {
      id: p.id,
      companyId: p.companyId,
      brandId: p.brandId,
      tenantId: p.tenantId ?? null,
      scope: p.scope,
      type: p.type,
      name: p.name,
      description: p.description ?? null,
      status: p.status,
      startsAt: p.startsAt ?? null,
      endsAt: p.endsAt ?? null,
      config: p.config,
      summary,
      createdById: p.createdById,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      // Store users must not learn which other stores are enrolled.
      storeIds: isStore ? undefined : storeIds,
      storeCount: storeIds.length,
      editable,
    };
  }

  private tenantProgramsOr(
    tenantId: string,
    brandId: string | null,
  ): Prisma.RewardProgramWhereInput[] {
    return [
      { scope: RewardProgramScope.STORE, tenantId },
      {
        scope: RewardProgramScope.COMPANY,
        ...(brandId && { brandId }),
        stores: { some: { tenantId } },
      },
    ];
  }

  private async storeVisibilityWhere(
    caller: RewardsCaller,
  ): Promise<Prisma.RewardProgramWhereInput> {
    const tenant = await this.getCallerTenant(caller);
    return {
      tombstone: NOT_DELETED,
      OR: this.tenantProgramsOr(tenant.id, tenant.brandId),
    };
  }

  private async findVisible(
    id: string,
    caller: RewardsCaller,
    companyIdQuery?: string,
  ) {
    if (!OBJECT_ID.test(id))
      throw new NotFoundException(`Reward program ${id} not found`);
    const role = effectiveRole(caller.role);
    const scopeWhere: Prisma.RewardProgramWhereInput =
      role === 'STORE_ADMIN'
        ? await this.storeVisibilityWhere(caller)
        : {
            companyId: this.resolveCompanyId(caller, companyIdQuery),
            tombstone: NOT_DELETED,
          };
    const program = await this.prisma.rewardProgram.findFirst({
      where: { AND: [{ id }, scopeWhere] },
      include: { stores: { select: { tenantId: true } } },
    });
    if (!program) throw new NotFoundException(`Reward program ${id} not found`);
    return program;
  }

  private async findEditable(id: string, caller: RewardsCaller) {
    const role = effectiveRole(caller.role);
    if (role !== 'STORE_ADMIN' && role !== 'COMPANY_ADMIN') {
      throw new ForbiddenException(
        'Only company or store admins can change reward programs',
      );
    }
    const program = await this.findVisible(id, caller);
    const editable =
      role === 'STORE_ADMIN'
        ? program.scope === RewardProgramScope.STORE &&
          program.tenantId === caller.tenantId
        : program.scope === RewardProgramScope.COMPANY;
    if (!editable) {
      throw new ForbiddenException(
        role === 'STORE_ADMIN'
          ? 'Company reward programs are read-only for stores'
          : 'Store reward programs are managed by the store',
      );
    }
    return program;
  }

  private async getCallerTenant(caller: RewardsCaller) {
    if (!caller.tenantId) throw new ForbiddenException('No store in session');
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: caller.tenantId },
      select: { id: true, brandId: true, companyId: true },
    });
    if (!tenant) throw new NotFoundException('Store not found');
    return tenant;
  }

  private resolveCompanyId(
    caller: RewardsCaller,
    companyIdQuery?: string,
  ): string {
    const role = effectiveRole(caller.role);
    if (role === 'PLATFORM_ADMIN') {
      if (!companyIdQuery)
        throw new BadRequestException('companyId query parameter is required');
      return companyIdQuery;
    }
    if (role === 'COMPANY_ADMIN' && caller.companyId) return caller.companyId;
    throw new ForbiddenException('No company in session');
  }

  private eventWhere(
    caller: RewardsCaller,
    q: RewardEventsQueryDto,
  ): Prisma.RewardEventWhereInput {
    const role = effectiveRole(caller.role);
    const where: Prisma.RewardEventWhereInput = {};
    if (role === 'STORE_ADMIN') {
      if (!caller.tenantId) throw new ForbiddenException('No store in session');
      where.tenantId = caller.tenantId; // never trust a client-supplied store for store users
    } else {
      where.companyId = this.resolveCompanyId(caller, q.companyId);
      if (q.storeId) where.tenantId = q.storeId;
    }
    if (q.programId) where.programId = q.programId;
    if (q.type) where.type = q.type;
    if (q.startDate || q.endDate) {
      where.occurredAt = {
        ...(q.startDate && { gte: new Date(q.startDate) }),
        ...(q.endDate && { lte: new Date(q.endDate) }),
      };
    }
    if (!q.includeVoided) where.isVoided = false;
    if (q.onlyFlagged) where.validationWarnings = { isEmpty: false };
    return where;
  }

  private async storeNames(tenantIds: string[]): Promise<Map<string, string>> {
    const ids = Array.from(new Set(tenantIds));
    if (!ids.length) return new Map();
    const stores = await this.prisma.tenant.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(stores.map((s) => [s.id, s.name]));
  }

  private assertDateRange(startsAt: Date | null, endsAt: Date | null) {
    if (startsAt && endsAt && startsAt >= endsAt) {
      throw new BadRequestException('startsAt must be before endsAt');
    }
  }

  /** Builds the engine's view of each cart line (names, effective base price). */
  private async buildItemContext(
    tenantId: string,
    items: RewardTransactionInput['items'],
  ): Promise<RewardItemContext[]> {
    const productIds = Array.from(new Set(items.map((i) => i.productId)));
    const sizeIds = Array.from(
      new Set(items.map((i) => i.sizeId).filter((s): s is string => !!s)),
    );

    const [products, sizes, tierId] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          name: true,
          price: true,
          category: { select: { name: true } },
        },
      }),
      sizeIds.length
        ? this.prisma.size.findMany({
            where: { id: { in: sizeIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as { id: string; name: string }[]),
      this.priceTiers.resolveStoreTierId(tenantId),
    ]);
    const tierPrices = tierId
      ? await this.prisma.productPriceTier.findMany({
          where: { tierId, productId: { in: productIds } },
          select: { productId: true, price: true },
        })
      : [];

    const productById = new Map(products.map((p) => [p.id, p]));
    const sizeById = new Map(sizes.map((s) => [s.id, s]));
    const tierPriceByProduct = new Map(
      tierPrices.map((t) => [t.productId, t.price]),
    );

    return items.map((item, index) => {
      const product = productById.get(item.productId);
      const quantity = item.quantity > 0 ? item.quantity : 1;
      return {
        index,
        productId: item.productId,
        productName: product?.name ?? null,
        categoryName: product?.category?.name ?? null,
        sizeName: item.sizeId
          ? (sizeById.get(item.sizeId)?.name ?? null)
          : null,
        quantity: item.quantity,
        unitPrice: item.subtotal / quantity,
        basePrice: product
          ? (tierPriceByProduct.get(product.id) ?? product.price)
          : null,
        discountAmount: item.discountAmount ?? 0,
      };
    });
  }
}
