import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RewardsService, RewardsCaller } from './rewards.service';
import { RewardTypeRegistry } from './reward-type.registry';
import { PrismaService } from '../prisma/prisma.service';
import { PriceTiersService } from '../price-tiers/price-tiers.service';

const mockPrisma: any = {
  rewardProgram: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  rewardProgramStore: {
    deleteMany: jest.fn(),
    findMany: jest.fn(),
    createMany: jest.fn(),
  },
  rewardEvent: {
    findMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    updateMany: jest.fn(),
  },
  brand: { findFirst: jest.fn() },
  tenant: { findUnique: jest.fn(), findMany: jest.fn() },
  product: { findMany: jest.fn() },
  size: { findMany: jest.fn() },
  productPriceTier: { findMany: jest.fn() },
  user: { findMany: jest.fn() },
  $transaction: jest.fn((cb: any) => cb(mockPrisma)),
};

const mockPriceTiers = { resolveStoreTierId: jest.fn() };

const COMPANY = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const BRAND = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const OTHER_BRAND = 'cccccccccccccccccccccccc';
const STORE = 'dddddddddddddddddddddddd';
const PROGRAM = 'eeeeeeeeeeeeeeeeeeeeeeee';

const companyAdmin: RewardsCaller = {
  id: 'u-co',
  role: 'COMPANY_ADMIN',
  companyId: COMPANY,
};
const storeAdmin: RewardsCaller = {
  id: 'u-st',
  role: 'STORE_ADMIN',
  tenantId: STORE,
  companyId: COMPANY,
};
const legacyAdmin: RewardsCaller = { ...storeAdmin, role: 'ADMIN' };

const config = {
  slots: [
    {
      key: 'p1',
      kind: 'STAMP',
      label: '₱49+',
      row: 0,
      position: 0,
      condition: { type: 'ITEM_MIN_PRICE', minPrice: 49 },
    },
    {
      key: 'p98',
      kind: 'STAMP',
      label: '₱98+',
      row: 0,
      position: 1,
      condition: { type: 'TRANSACTION_MIN_TOTAL', minTotal: 98 },
    },
    {
      key: 'm1',
      kind: 'MILESTONE',
      label: 'Cloud Break',
      row: 1,
      position: 0,
      reward: { type: 'PERCENT_OFF_ITEM', percent: 50 },
    },
  ],
};

const program = (over: any = {}) => ({
  id: PROGRAM,
  companyId: COMPANY,
  brandId: BRAND,
  tenantId: null,
  scope: 'COMPANY',
  type: 'LOYALTY_CARD',
  name: 'Blue Bear Cloud Club',
  description: null,
  status: 'ACTIVE',
  startsAt: null,
  endsAt: null,
  config,
  createdById: 'u-co',
  tombstone: 0,
  createdAt: new Date('2026-10-01'),
  updatedAt: new Date('2026-10-01'),
  stores: [{ tenantId: STORE }],
  ...over,
});

describe('RewardsService', () => {
  let service: RewardsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPriceTiers.resolveStoreTierId.mockResolvedValue(null);
    mockPrisma.size.findMany.mockResolvedValue([]);
    mockPrisma.productPriceTier.findMany.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RewardsService,
        RewardTypeRegistry,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PriceTiersService, useValue: mockPriceTiers },
      ],
    }).compile();
    service = module.get(RewardsService);
  });

  describe('createProgram', () => {
    const dto: any = {
      name: ' Blue Bear ',
      type: 'LOYALTY_CARD',
      config,
      brandId: BRAND,
    };

    it('company admin: creates a COMPANY program for a brand it owns, DRAFT by default', async () => {
      mockPrisma.brand.findFirst.mockResolvedValue({ id: BRAND });
      mockPrisma.rewardProgram.create.mockImplementation(({ data }: any) => ({
        ...program(),
        ...data,
        stores: [],
      }));

      const result = await service.createProgram(dto, companyAdmin);

      expect(mockPrisma.brand.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: BRAND, companyId: COMPANY }),
        }),
      );
      const data = mockPrisma.rewardProgram.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        companyId: COMPANY,
        brandId: BRAND,
        tenantId: null,
        scope: 'COMPANY',
        status: 'DRAFT',
        name: 'Blue Bear',
        createdById: 'u-co',
      });
      expect(result).toMatchObject({
        editable: true,
        storeIds: [],
        storeCount: 0,
        summary: '2 stamps, 1 milestone',
      });
    });

    it('company admin: 404 for a brand of another company, 400 without brandId', async () => {
      mockPrisma.brand.findFirst.mockResolvedValue(null);
      await expect(service.createProgram(dto, companyAdmin)).rejects.toThrow(
        NotFoundException,
      );
      await expect(
        service.createProgram({ ...dto, brandId: undefined }, companyAdmin),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.rewardProgram.create).not.toHaveBeenCalled();
    });

    it('rejects an invalid config through the type handler', async () => {
      mockPrisma.brand.findFirst.mockResolvedValue({ id: BRAND });
      await expect(
        service.createProgram({ ...dto, config: { slots: [] } }, companyAdmin),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects startsAt >= endsAt', async () => {
      mockPrisma.brand.findFirst.mockResolvedValue({ id: BRAND });
      await expect(
        service.createProgram(
          {
            ...dto,
            startsAt: '2026-12-01T00:00:00Z',
            endsAt: '2026-11-01T00:00:00Z',
          },
          companyAdmin,
        ),
      ).rejects.toThrow('startsAt must be before endsAt');
    });

    it('store admin (incl. legacy ADMIN): STORE program copying company/brand from the tenant, ignoring body brandId', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: STORE,
        brandId: BRAND,
        companyId: COMPANY,
      });
      mockPrisma.rewardProgram.create.mockImplementation(({ data }: any) => ({
        ...program(),
        ...data,
        stores: [],
      }));

      const result = await service.createProgram(
        { ...dto, brandId: OTHER_BRAND },
        legacyAdmin,
      );

      const data = mockPrisma.rewardProgram.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        scope: 'STORE',
        tenantId: STORE,
        brandId: BRAND,
        companyId: COMPANY,
      });
      expect(result.editable).toBe(true);
      expect(result.storeIds).toBeUndefined();
    });

    it('store admin: 400 when the store has no brand', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: STORE,
        brandId: null,
        companyId: COMPANY,
      });
      await expect(service.createProgram(dto, storeAdmin)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('listPrograms / getProgram scoping', () => {
    it('store admin sees own programs plus enrolled company programs of its brand; company ones read-only', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: STORE,
        brandId: BRAND,
        companyId: COMPANY,
      });
      mockPrisma.rewardProgram.findMany.mockResolvedValue([
        program(),
        program({ id: 'own', scope: 'STORE', tenantId: STORE, stores: [] }),
      ]);

      const result = await service.listPrograms(storeAdmin);

      const where = mockPrisma.rewardProgram.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { scope: 'STORE', tenantId: STORE },
        {
          scope: 'COMPANY',
          brandId: BRAND,
          stores: { some: { tenantId: STORE } },
        },
      ]);
      expect(result.map((p) => [p.id, p.editable])).toEqual([
        [PROGRAM, false],
        ['own', true],
      ]);
      expect(result[0].storeIds).toBeUndefined(); // other stores' enrolment is not leaked
    });

    it('company admin lists its COMPANY programs by default, filtered by brand', async () => {
      mockPrisma.rewardProgram.findMany.mockResolvedValue([program()]);
      const result = await service.listPrograms(companyAdmin, {
        brandId: BRAND,
      });
      expect(
        mockPrisma.rewardProgram.findMany.mock.calls[0][0].where,
      ).toMatchObject({ companyId: COMPANY, scope: 'COMPANY', brandId: BRAND });
      expect(result[0].storeIds).toEqual([STORE]);
    });

    it('platform admin must pass companyId', async () => {
      await expect(
        service.listPrograms({ id: 'p', role: 'PLATFORM_ADMIN' }),
      ).rejects.toThrow(BadRequestException);
      mockPrisma.rewardProgram.findMany.mockResolvedValue([]);
      await service.listPrograms(
        { id: 'p', role: 'PLATFORM_ADMIN' },
        { companyId: COMPANY },
      );
      expect(
        mockPrisma.rewardProgram.findMany.mock.calls[0][0].where.companyId,
      ).toBe(COMPANY);
    });

    it('getProgram 404s for a malformed id or a program outside the caller scope', async () => {
      await expect(
        service.getProgram('not-an-id', companyAdmin),
      ).rejects.toThrow(NotFoundException);
      mockPrisma.rewardProgram.findFirst.mockResolvedValue(null);
      await expect(service.getProgram(PROGRAM, companyAdmin)).rejects.toThrow(
        NotFoundException,
      );
      expect(
        mockPrisma.rewardProgram.findFirst.mock.calls[0][0].where.AND,
      ).toContainEqual(expect.objectContaining({ companyId: COMPANY }));
    });
  });

  describe('updateProgram / deleteProgram', () => {
    it('store admin gets 403 when editing an enrolled company program', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: STORE,
        brandId: BRAND,
        companyId: COMPANY,
      });
      mockPrisma.rewardProgram.findFirst.mockResolvedValue(program());
      await expect(
        service.updateProgram(PROGRAM, { name: 'x' }, storeAdmin),
      ).rejects.toThrow(ForbiddenException);
      await expect(service.deleteProgram(PROGRAM, storeAdmin)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.rewardProgram.update).not.toHaveBeenCalled();
    });

    it('cannot move an activated program back to DRAFT', async () => {
      mockPrisma.rewardProgram.findFirst.mockResolvedValue(
        program({ status: 'PAUSED' }),
      );
      await expect(
        service.updateProgram(
          PROGRAM,
          { status: 'DRAFT' } as any,
          companyAdmin,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('validates a replacement config and clears dates with null', async () => {
      mockPrisma.rewardProgram.findFirst.mockResolvedValue(
        program({ startsAt: new Date('2026-01-01') }),
      );
      mockPrisma.rewardProgram.update.mockImplementation(({ data }: any) => ({
        ...program(),
        ...data,
      }));
      await service.updateProgram(
        PROGRAM,
        { startsAt: null, config } as any,
        companyAdmin,
      );
      const data = mockPrisma.rewardProgram.update.mock.calls[0][0].data;
      expect(data.startsAt).toBeNull();
      expect(data.config.slots).toHaveLength(3);
      await expect(
        service.updateProgram(
          PROGRAM,
          { config: { slots: 'x' } } as any,
          companyAdmin,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('delete is a soft delete', async () => {
      mockPrisma.rewardProgram.findFirst.mockResolvedValue(program());
      await expect(
        service.deleteProgram(PROGRAM, companyAdmin),
      ).resolves.toEqual({ id: PROGRAM, deleted: true });
      expect(mockPrisma.rewardProgram.update).toHaveBeenCalledWith({
        where: { id: PROGRAM },
        data: { tombstone: 1, status: 'ARCHIVED' },
      });
    });
  });

  describe('setStores', () => {
    it('rejects stores outside the program company + brand', async () => {
      mockPrisma.rewardProgram.findFirst.mockResolvedValue(program());
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: STORE }]);
      const foreign = 'ffffffffffffffffffffffff';
      await expect(
        service.setStores(PROGRAM, [STORE, foreign], companyAdmin),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.tenant.findMany.mock.calls[0][0].where).toMatchObject({
        companyId: COMPANY,
        brandId: BRAND,
      });
      expect(mockPrisma.rewardProgramStore.createMany).not.toHaveBeenCalled();
    });

    it('replaces the enrolled set (removes missing, adds new)', async () => {
      const newStore = '111111111111111111111111';
      mockPrisma.rewardProgram.findFirst.mockResolvedValue(program());
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: STORE },
        { id: newStore },
      ]);
      mockPrisma.rewardProgramStore.findMany.mockResolvedValue([
        { tenantId: STORE },
      ]);

      await service.setStores(PROGRAM, [STORE, newStore], companyAdmin);

      expect(mockPrisma.rewardProgramStore.deleteMany).toHaveBeenCalledWith({
        where: { programId: PROGRAM, tenantId: { notIn: [STORE, newStore] } },
      });
      expect(mockPrisma.rewardProgramStore.createMany).toHaveBeenCalledWith({
        data: [{ programId: PROGRAM, tenantId: newStore }],
      });
    });

    it('is company-admin only', async () => {
      await expect(service.setStores(PROGRAM, [], storeAdmin)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getActiveForTenant', () => {
    it('returns ACTIVE programs for the store within their dates', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: STORE,
        brandId: BRAND,
      });
      mockPrisma.rewardProgram.findMany.mockResolvedValue([
        program(),
        program({ id: 'future', startsAt: new Date('2027-01-01') }),
        program({ id: 'ended', endsAt: new Date('2026-01-01') }),
      ]);

      const result = await service.getActiveForTenant(
        STORE,
        new Date('2026-10-31'),
      );

      expect(
        mockPrisma.rewardProgram.findMany.mock.calls[0][0].where,
      ).toMatchObject({ status: 'ACTIVE' });
      expect(result.map((p) => p.id)).toEqual([PROGRAM]);
      expect(result[0]).toMatchObject({
        config,
        scope: 'COMPANY',
        type: 'LOYALTY_CARD',
      });
    });
  });

  describe('prepareTransactionRewards', () => {
    const tx = (rewards: any[], over: any = {}) => ({
      subtotal: 158,
      total: 118.5,
      timestamp: '2026-10-30T03:00:00.000Z',
      items: [
        {
          productId: 'prod-latte',
          quantity: 2,
          sizeId: 'size-reg',
          subtotal: 158,
          discountAmount: 39.5,
        },
      ],
      rewards,
      ...over,
    });

    beforeEach(() => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: STORE,
        brandId: BRAND,
        companyId: COMPANY,
      });
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'prod-latte',
          name: 'Blue Bear Cloud Latte',
          price: 45,
          category: { name: 'Drinks' },
        },
      ]);
      mockPrisma.size.findMany.mockResolvedValue([
        { id: 'size-reg', name: 'Regular' },
      ]);
    });

    it('returns snapshot event drafts for issue + stamps + redemption, using the tier base price', async () => {
      mockPrisma.rewardProgram.findMany.mockResolvedValue([program()]);
      mockPriceTiers.resolveStoreTierId.mockResolvedValue('tier-1');
      mockPrisma.productPriceTier.findMany.mockResolvedValue([
        { productId: 'prod-latte', price: 49 },
      ]);

      const drafts = await service.prepareTransactionRewards(
        STORE,
        'cashier-1',
        tx([
          { programId: PROGRAM, type: 'CARD_ISSUED' },
          {
            programId: PROGRAM,
            type: 'STAMP_ADDED',
            slotKey: 'p1',
            itemIndex: 0,
          },
          { programId: PROGRAM, type: 'STAMP_ADDED', slotKey: 'p98' },
          {
            programId: PROGRAM,
            type: 'REWARD_REDEEMED',
            slotKey: 'm1',
            itemIndex: 0,
            discountAmount: 39.5,
          },
        ]),
      );

      expect(drafts).toHaveLength(4);
      expect(drafts[1]).toMatchObject({
        programId: PROGRAM,
        programType: 'LOYALTY_CARD',
        programName: 'Blue Bear Cloud Club',
        tenantId: STORE,
        companyId: COMPANY,
        brandId: BRAND,
        userId: 'cashier-1',
        type: 'STAMP_ADDED',
        slotKey: 'p1',
        slotLabel: '₱49+',
        productName: 'Blue Bear Cloud Latte',
        occurredAt: new Date('2026-10-30T03:00:00.000Z'),
      });
      expect(drafts[3]).toMatchObject({
        type: 'REWARD_REDEEMED',
        discountAmount: 39.5,
        slotLabel: 'Cloud Break',
      });
    });

    it('returns [] without any lookups when there are no rewards', async () => {
      await expect(
        service.prepareTransactionRewards(STORE, 'c', tx([])),
      ).resolves.toEqual([]);
      expect(mockPrisma.rewardProgram.findMany).not.toHaveBeenCalled();
    });

    const cardOnly = () => tx([{ programId: PROGRAM, type: 'CARD_ISSUED' }]);

    it.each([
      ['an unknown program', []],
      [
        "another company's program",
        [program({ companyId: 'ffffffffffffffffffffffff' })],
      ],
    ])(
      'HARD: rejects %s with 400 (same "not found" message)',
      async (_name, programs) => {
        mockPrisma.rewardProgram.findMany.mockResolvedValue(programs);
        const err = await service
          .prepareTransactionRewards(STORE, 'c', cardOnly())
          .catch((e) => e);
        expect(err).toBeInstanceOf(BadRequestException);
        expect(JSON.stringify(err.getResponse())).toContain(
          `program ${PROGRAM} not found`,
        );
      },
    );

    it('HARD: rejects when the store has no company', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: STORE,
        brandId: BRAND,
        companyId: null,
      });
      mockPrisma.rewardProgram.findMany.mockResolvedValue([program()]);
      await expect(
        service.prepareTransactionRewards(STORE, 'c', cardOnly()),
      ).rejects.toThrow(BadRequestException);
    });

    it.each([
      [
        'unenrolled company program',
        program({ stores: [] }),
        'store is not enrolled in this program',
      ],
      [
        'company program of another brand',
        program({ brandId: OTHER_BRAND }),
        "program brand does not match the store's brand",
      ],
      [
        "another store's own program",
        program({
          scope: 'STORE',
          tenantId: 'zzzzzzzzzzzzzzzzzzzzzzzz',
          stores: [],
        }),
        'program is not owned by this store',
      ],
      ['DRAFT program', program({ status: 'DRAFT' }), 'program is in DRAFT'],
      [
        'deleted program',
        program({ tombstone: 1 }),
        'program has been deleted',
      ],
      [
        'program that ended before the sale',
        program({ endsAt: new Date('2026-10-29') }),
        'program was not running at 2026-10-30T03:00:00.000Z',
      ],
    ])(
      'SOFT: records a %s with a warning instead of rejecting',
      async (_name, p, warning) => {
        mockPrisma.rewardProgram.findMany.mockResolvedValue([p]);
        const drafts = await service.prepareTransactionRewards(
          STORE,
          'c',
          cardOnly(),
        );
        expect(drafts).toHaveLength(1);
        expect(drafts[0].validationWarnings).toEqual([warning]);
      },
    );

    it('looks programs up including tombstoned ones', async () => {
      mockPrisma.rewardProgram.findMany.mockResolvedValue([program()]);
      await service.prepareTransactionRewards(STORE, 'c', cardOnly());
      expect(mockPrisma.rewardProgram.findMany.mock.calls[0][0].where).toEqual({
        id: { in: [PROGRAM] },
      });
    });

    it('offline tolerance: a sale made before the program was archived is clean', async () => {
      mockPrisma.rewardProgram.findMany.mockResolvedValue([
        program({
          status: 'ARCHIVED',
          endsAt: new Date('2026-10-30T12:00:00Z'),
        }),
      ]);
      const drafts = await service.prepareTransactionRewards(
        STORE,
        'c',
        cardOnly(),
      );
      expect(drafts[0].validationWarnings).toEqual([]);
    });

    it('SOFT: a stamp whose condition no longer matches (price tier changed) is saved flagged', async () => {
      mockPrisma.rewardProgram.findMany.mockResolvedValue([program()]);
      const drafts = await service.prepareTransactionRewards(
        STORE,
        'c',
        tx([
          {
            programId: PROGRAM,
            type: 'STAMP_ADDED',
            slotKey: 'p1',
            itemIndex: 0,
          },
        ]),
      );
      expect(drafts[0].validationWarnings).toEqual([
        expect.stringContaining('does not meet the current condition'),
      ]);
    });

    it("rejects a redemption not reflected in the item's discountAmount", async () => {
      mockPrisma.rewardProgram.findMany.mockResolvedValue([program()]);
      const sale = tx([
        {
          programId: PROGRAM,
          type: 'REWARD_REDEEMED',
          slotKey: 'm1',
          itemIndex: 0,
          discountAmount: 39.5,
        },
      ]);
      sale.items[0].discountAmount = 0;
      const err = await service
        .prepareTransactionRewards(STORE, 'c', sale)
        .catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(JSON.stringify(err.getResponse())).toContain(
        'discountAmount is only 0',
      );
    });
  });

  describe('events and summary', () => {
    it('store users are pinned to their own store (storeId ignored); voided excluded by default; paged envelope', async () => {
      mockPrisma.rewardEvent.findMany.mockResolvedValue([
        {
          id: 'ev',
          tenantId: STORE,
          userId: 'u1',
          type: 'CARD_ISSUED',
          isVoided: false,
          transaction: { transactionId: 'TXN-9' },
        },
      ]);
      mockPrisma.rewardEvent.count.mockResolvedValue(1);
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: STORE, name: 'SM North' },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'u1', firstName: 'Ana', lastName: 'Cruz', username: 'ana' },
      ]);

      const result = await service.listEvents(storeAdmin, {
        storeId: 'ffffffffffffffffffffffff',
      } as any);

      const args = mockPrisma.rewardEvent.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ tenantId: STORE, isVoided: false });
      expect(mockPrisma.rewardEvent.count).toHaveBeenCalledWith({
        where: args.where,
      });
      expect(args.skip).toBe(0);
      expect(args.take).toBe(50);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 50,
        total: 1,
        totalPages: 1,
      });
      expect(result.data[0]).toMatchObject({
        storeName: 'SM North',
        cashierName: 'Ana Cruz',
        transactionCode: 'TXN-9',
      });
    });

    it('company filters: storeId, programId, type, dates, includeVoided', async () => {
      mockPrisma.rewardEvent.findMany.mockResolvedValue([]);
      mockPrisma.rewardEvent.count.mockResolvedValue(0);
      mockPrisma.user.findMany.mockResolvedValue([]);

      await service.listEvents(companyAdmin, {
        storeId: STORE,
        programId: PROGRAM,
        type: 'STAMP_ADDED',
        startDate: '2026-10-01T00:00:00Z',
        endDate: '2026-10-31T23:59:59Z',
        includeVoided: true,
        page: 2,
        limit: 10,
      } as any);

      const args = mockPrisma.rewardEvent.findMany.mock.calls[0][0];
      expect(args.where).toEqual({
        companyId: COMPANY,
        tenantId: STORE,
        programId: PROGRAM,
        type: 'STAMP_ADDED',
        occurredAt: {
          gte: new Date('2026-10-01T00:00:00Z'),
          lte: new Date('2026-10-31T23:59:59Z'),
        },
      });
      expect(args.skip).toBe(10);
    });

    it('summary aggregates totals, discount, per-slot and per-store', async () => {
      mockPrisma.rewardEvent.groupBy.mockResolvedValue([
        {
          tenantId: STORE,
          programId: PROGRAM,
          type: 'CARD_ISSUED',
          slotKey: null,
          _count: { _all: 3 },
          _sum: { discountAmount: null },
        },
        {
          tenantId: STORE,
          programId: PROGRAM,
          type: 'STAMP_ADDED',
          slotKey: 'p1',
          _count: { _all: 5 },
          _sum: { discountAmount: null },
        },
        {
          tenantId: 'other',
          programId: PROGRAM,
          type: 'STAMP_ADDED',
          slotKey: 'p1',
          _count: { _all: 2 },
          _sum: { discountAmount: null },
        },
        {
          tenantId: STORE,
          programId: PROGRAM,
          type: 'REWARD_REDEEMED',
          slotKey: 'm1',
          _count: { _all: 2 },
          _sum: { discountAmount: 79.004 },
        },
      ]);
      mockPrisma.rewardProgram.findMany.mockResolvedValue([
        { id: PROGRAM, name: 'Blue Bear Cloud Club', config },
      ]);
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: STORE, name: 'SM North' },
        { id: 'other', name: 'Ayala' },
      ]);

      mockPrisma.rewardEvent.count.mockResolvedValue(4);

      const s = await service.summary(companyAdmin, {} as any);

      expect(mockPrisma.rewardEvent.groupBy.mock.calls[0][0].where).toEqual({
        companyId: COMPANY,
        isVoided: false,
      });
      expect(s.totals).toEqual({
        CARD_ISSUED: 3,
        STAMP_ADDED: 7,
        REWARD_REDEEMED: 2,
        flaggedEvents: 4,
      });
      expect(mockPrisma.rewardEvent.count).toHaveBeenCalledWith({
        where: {
          AND: [
            { companyId: COMPANY, isVoided: false },
            { validationWarnings: { isEmpty: false } },
          ],
        },
      });
      expect(s.totalEvents).toBe(12);
      expect(s.totalRewardDiscount).toBe(79);
      expect(s.bySlot[0]).toMatchObject({
        slotKey: 'p1',
        slotLabel: '₱49+',
        count: 7,
        programName: 'Blue Bear Cloud Club',
      });
      expect(s.bySlot.find((x: any) => x.slotKey === 'm1')).toMatchObject({
        count: 2,
        discountTotal: 79,
        slotLabel: 'Cloud Break',
      });
      expect(s.byStore).toEqual([
        {
          tenantId: 'other',
          storeName: 'Ayala',
          CARD_ISSUED: 0,
          STAMP_ADDED: 2,
          REWARD_REDEEMED: 0,
          totalRewardDiscount: 0,
        },
        {
          tenantId: STORE,
          storeName: 'SM North',
          CARD_ISSUED: 3,
          STAMP_ADDED: 5,
          REWARD_REDEEMED: 2,
          totalRewardDiscount: 79,
        },
      ]);
    });

    it('onlyFlagged restricts events and summary to events with warnings; rows expose validationWarnings', async () => {
      mockPrisma.rewardEvent.findMany.mockResolvedValue([
        {
          id: 'ev',
          tenantId: STORE,
          userId: 'u1',
          type: 'STAMP_ADDED',
          isVoided: false,
          validationWarnings: ['store is not enrolled in this program'],
        },
      ]);
      mockPrisma.rewardEvent.count.mockResolvedValue(1);
      mockPrisma.tenant.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await service.listEvents(storeAdmin, {
        onlyFlagged: true,
      } as any);

      expect(mockPrisma.rewardEvent.findMany.mock.calls[0][0].where).toEqual({
        tenantId: STORE,
        isVoided: false,
        validationWarnings: { isEmpty: false },
      });
      expect(result.data[0].validationWarnings).toEqual([
        'store is not enrolled in this program',
      ]);

      mockPrisma.rewardEvent.groupBy.mockResolvedValue([]);
      await service.summary(storeAdmin, { onlyFlagged: true } as any);
      expect(
        mockPrisma.rewardEvent.groupBy.mock.calls[0][0].where
          .validationWarnings,
      ).toEqual({ isEmpty: false });
    });

    it('markTransactionVoided flags all of the transaction events, on the given client', async () => {
      const tx = { rewardEvent: { updateMany: jest.fn() } };
      await service.markTransactionVoided('txn-1', tx as any);
      expect(tx.rewardEvent.updateMany).toHaveBeenCalledWith({
        where: { transactionId: 'txn-1' },
        data: { isVoided: true },
      });
    });
  });
});
