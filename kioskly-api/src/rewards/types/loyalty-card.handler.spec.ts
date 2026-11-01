import { BadRequestException } from '@nestjs/common';
import {
  LoyaltyCardHandler,
  computeMaxRedemption,
} from './loyalty-card.handler';
import type {
  RewardItemContext,
  RewardTransactionContext,
} from './reward-type-handler.interface';

const handler = new LoyaltyCardHandler();

// Blue Bear Cloud Club card, condensed
const blueBearConfig = {
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
      key: 'p2',
      kind: 'STAMP',
      label: '₱49+',
      row: 0,
      position: 1,
      condition: { type: 'ITEM_MIN_PRICE', minPrice: 49 },
    },
    {
      key: 'p3',
      kind: 'STAMP',
      label: '₱49+ drink',
      row: 0,
      position: 2,
      condition: {
        type: 'ITEM_MIN_PRICE',
        minPrice: 49,
        categoryNames: ['Drinks'],
      },
    },
    {
      key: 'bb',
      kind: 'STAMP',
      label: 'Blue Bear',
      row: 1,
      position: 0,
      condition: {
        type: 'ITEM_PRODUCT_NAMES',
        names: ['Blue Bear Cloud Latte'],
      },
    },
    {
      key: 'cat',
      kind: 'STAMP',
      label: 'Any frappe',
      row: 1,
      position: 1,
      condition: { type: 'ITEM_CATEGORY_NAMES', names: ['Frappes'] },
    },
    {
      key: 'p98',
      kind: 'STAMP',
      label: '₱98+ purchase',
      row: 2,
      position: 0,
      condition: { type: 'TRANSACTION_MIN_TOTAL', minTotal: 98 },
    },
    {
      key: 'm1',
      kind: 'MILESTONE',
      label: 'Cloud Break',
      row: 3,
      position: 0,
      reward: { type: 'PERCENT_OFF_ITEM', percent: 50 },
    },
    {
      key: 'm2',
      kind: 'MILESTONE',
      label: 'Cloud Nine',
      row: 3,
      position: 1,
      reward: { type: 'FREE_ITEM', sizeNames: ['Regular'] },
    },
    {
      key: 'm3',
      kind: 'MILESTONE',
      label: 'Above the Clouds',
      row: 3,
      position: 2,
      reward: {
        type: 'AMOUNT_OFF_ITEM',
        amount: 30,
        categoryNames: ['drinks'],
      },
    },
  ],
};

const program = {
  id: 'prog-1',
  name: 'Blue Bear',
  type: 'LOYALTY_CARD' as const,
  config: blueBearConfig,
};

const item = (over: Partial<RewardItemContext> = {}): RewardItemContext => ({
  index: 0,
  productId: 'p-1',
  productName: 'Blue Bear Cloud Latte',
  categoryName: 'Drinks',
  sizeName: 'Regular',
  quantity: 1,
  unitPrice: 79,
  basePrice: 69,
  discountAmount: 0,
  ...over,
});

const txOf = (
  items: RewardItemContext[],
  total = 100,
): RewardTransactionContext => ({
  subtotal: total,
  total,
  items: items.map((it, index) => ({ ...it, index })),
});

const expectBadRequest = (fn: () => unknown, fragment: string) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(BadRequestException);
    const msg = JSON.stringify((e as BadRequestException).getResponse());
    expect(msg).toContain(fragment);
    return;
  }
  throw new Error('expected BadRequestException');
};

describe('LoyaltyCardHandler', () => {
  describe('validateConfig', () => {
    it('accepts the Blue Bear card and normalizes (trims names/keys, drops unknown keys)', () => {
      const out: any = handler.validateConfig({
        slots: [
          {
            key: ' a ',
            kind: 'STAMP',
            label: ' First ',
            row: 0,
            position: 0,
            extra: 1,
            condition: {
              type: 'ITEM_PRODUCT_NAMES',
              names: [' Latte ', 'Latte'],
            },
          },
          {
            key: 'm',
            kind: 'MILESTONE',
            label: 'Treat',
            row: 1,
            position: 0,
            reward: { type: 'PERCENT_OFF_ITEM', percent: 50, qty: 1 },
          },
        ],
      });
      expect(out.slots[0]).toEqual({
        key: 'a',
        kind: 'STAMP',
        label: 'First',
        row: 0,
        position: 0,
        condition: { type: 'ITEM_PRODUCT_NAMES', names: ['Latte'] },
      });
      expect(out.slots[1].reward).toEqual({
        type: 'PERCENT_OFF_ITEM',
        percent: 50,
      });
      expect(() => handler.validateConfig(blueBearConfig)).not.toThrow();
    });

    it.each([
      ['missing slots', {}, 'config.slots must be an array'],
      ['empty slots', { slots: [] }, 'at least one slot'],
      [
        'duplicate keys',
        {
          slots: [
            blueBearConfig.slots[0],
            { ...blueBearConfig.slots[1], key: 'p1' },
          ],
        },
        'duplicated',
      ],
      [
        'duplicate cell',
        {
          slots: [
            blueBearConfig.slots[0],
            { ...blueBearConfig.slots[1], position: 0 },
          ],
        },
        'reuses row 0, position 0',
      ],
      [
        'bad kind',
        { slots: [{ ...blueBearConfig.slots[0], kind: 'CIRCLE' }] },
        'kind must be STAMP or MILESTONE',
      ],
      [
        'stamp without condition',
        {
          slots: [{ key: 'a', kind: 'STAMP', label: 'A', row: 0, position: 0 }],
        },
        'condition is required',
      ],
      [
        'stamp with reward',
        {
          slots: [
            { ...blueBearConfig.slots[0], reward: { type: 'FREE_ITEM' } },
          ],
        },
        'reward is only allowed',
      ],
      [
        'milestone without reward',
        {
          slots: [
            { key: 'm', kind: 'MILESTONE', label: 'M', row: 0, position: 0 },
          ],
        },
        'reward is required',
      ],
      [
        'unknown condition',
        {
          slots: [{ ...blueBearConfig.slots[0], condition: { type: 'BOGO' } }],
        },
        'condition.type must be one of',
      ],
      [
        'negative minPrice',
        {
          slots: [
            {
              ...blueBearConfig.slots[0],
              condition: { type: 'ITEM_MIN_PRICE', minPrice: -1 },
            },
          ],
        },
        'minPrice',
      ],
      [
        'empty product names',
        {
          slots: [
            {
              ...blueBearConfig.slots[3],
              condition: { type: 'ITEM_PRODUCT_NAMES', names: [] },
            },
          ],
        },
        'non-empty array',
      ],
      [
        'percent > 100',
        {
          slots: [
            {
              ...blueBearConfig.slots[6],
              reward: { type: 'PERCENT_OFF_ITEM', percent: 101 },
            },
          ],
        },
        'between 1 and 100',
      ],
      [
        'percent 0',
        {
          slots: [
            {
              ...blueBearConfig.slots[6],
              reward: { type: 'PERCENT_OFF_ITEM', percent: 0 },
            },
          ],
        },
        'between 1 and 100',
      ],
      [
        'amount 0',
        {
          slots: [
            {
              ...blueBearConfig.slots[6],
              reward: { type: 'AMOUNT_OFF_ITEM', amount: 0 },
            },
          ],
        },
        'amount must be',
      ],
      [
        'negative row',
        { slots: [{ ...blueBearConfig.slots[0], row: -1 }] },
        'row must be',
      ],
      [
        'blank label',
        { slots: [{ ...blueBearConfig.slots[0], label: '  ' }] },
        'label must be',
      ],
    ])('rejects %s', (_name, config, fragment) => {
      expectBadRequest(() => handler.validateConfig(config), fragment);
    });
  });

  const P = 'prog-1';
  const stamp = (slotKey: string, itemIndex?: number) => ({
    programId: P,
    type: 'STAMP_ADDED' as const,
    slotKey,
    ...(itemIndex !== undefined && { itemIndex }),
  });
  const redeem = (slotKey: string, discountAmount: number, itemIndex = 0) => ({
    programId: P,
    type: 'REWARD_REDEEMED' as const,
    slotKey,
    itemIndex,
    discountAmount,
  });
  const run = (apps: any[], tx: RewardTransactionContext) =>
    handler.validateApplications(program, apps, tx);
  const warningsOf = (apps: any[], tx: RewardTransactionContext) =>
    run(apps, tx).map((v) => v.warnings);

  describe('SOFT checks: stamps (recorded with warnings, never rejected)', () => {
    it('ITEM_MIN_PRICE uses the base effective price, not the unit price with size/add-ons', () => {
      const [cheap] = run(
        [stamp('p1', 0)],
        txOf([item({ basePrice: 39, unitPrice: 59 })]),
      );
      expect(cheap.warnings).toEqual([
        expect.stringContaining(
          'does not meet the current condition of slot "p1"',
        ),
      ]);
      const [ok] = run([stamp('p1', 0)], txOf([item({ basePrice: 49 })]));
      expect(ok).toMatchObject({
        type: 'STAMP_ADDED',
        slotKey: 'p1',
        slotLabel: '₱49+',
        itemIndex: 0,
        productName: 'Blue Bear Cloud Latte',
        warnings: [],
      });
    });

    it('ITEM_MIN_PRICE with categoryNames also checks the category (case-insensitive)', () => {
      expect(
        warningsOf(
          [stamp('p3', 0)],
          txOf([item({ categoryName: ' drinks ' })]),
        ),
      ).toEqual([[]]);
      expect(
        warningsOf([stamp('p3', 0)], txOf([item({ categoryName: 'Food' })]))[0],
      ).toHaveLength(1);
    });

    it('ITEM_MIN_PRICE warns when the product is unknown (no base price)', () => {
      expect(
        warningsOf(
          [stamp('p1', 0)],
          txOf([item({ basePrice: null, productName: null })]),
        )[0],
      ).toHaveLength(1);
    });

    it('ITEM_PRODUCT_NAMES matches by trimmed, case-insensitive name; a renamed product only warns', () => {
      expect(
        warningsOf(
          [stamp('bb', 0)],
          txOf([item({ productName: '  blue bear CLOUD latte ' })]),
        ),
      ).toEqual([[]]);
      expect(
        warningsOf(
          [stamp('bb', 0)],
          txOf([item({ productName: 'Choco Latte' })]),
        )[0],
      ).toHaveLength(1);
    });

    it('ITEM_CATEGORY_NAMES matches the product category', () => {
      expect(
        warningsOf(
          [stamp('cat', 0)],
          txOf([item({ categoryName: 'FRAPPES' })]),
        ),
      ).toEqual([[]]);
      expect(warningsOf([stamp('cat', 0)], txOf([item()]))[0]).toHaveLength(1);
    });

    it('TRANSACTION_MIN_TOTAL compares against the final total and needs no itemIndex', () => {
      const [ok] = run([stamp('p98')], { subtotal: 120, total: 98, items: [] });
      expect(ok).toMatchObject({
        slotKey: 'p98',
        itemIndex: null,
        productName: null,
        warnings: [],
      });
      const [low] = run([stamp('p98')], {
        subtotal: 120,
        total: 97.5,
        items: [],
      });
      expect(low.warnings).toEqual([
        expect.stringContaining('below the slot minimum of 98'),
      ]);
    });

    it('an item condition with no itemIndex is kept with a warning', () => {
      expect(warningsOf([stamp('p1')], txOf([item()]))[0]).toEqual([
        expect.stringContaining('no itemIndex was sent'),
      ]);
    });

    it('a slot removed from the config is kept, labelled by its key, condition skipped', () => {
      const [v] = run([stamp('gone', 0)], txOf([item()]));
      expect(v).toMatchObject({
        slotKey: 'gone',
        slotLabel: 'gone',
        itemIndex: 0,
      });
      expect(v.warnings).toEqual([
        'slot "gone" is no longer in the program config',
      ]);
    });

    it('stamping a slot that is now a milestone only warns', () => {
      expect(warningsOf([stamp('m1', 0)], txOf([item()]))[0]).toEqual([
        'slot "m1" is no longer a STAMP slot',
      ]);
    });

    it('allows several stamps in any order', () => {
      const tx = txOf(
        [
          item({ quantity: 2 }),
          item({ productName: 'Mocha Frappe', categoryName: 'Frappes' }),
        ],
        150,
      );
      const ok = run(
        [stamp('p98'), stamp('cat', 1), stamp('p2', 0), stamp('p1', 0)],
        tx,
      );
      expect(ok.map((v) => v.slotKey)).toEqual(['p98', 'cat', 'p2', 'p1']);
      expect(ok.every((v) => v.warnings.length === 0)).toBe(true);
    });
  });

  describe('ONE_PER_VISIT stamp mode', () => {
    const opv = {
      ...program,
      config: {
        stampMode: 'ONE_PER_VISIT',
        slots: [
          { key: 'a', kind: 'STAMP', label: '1', row: 0, position: 0 },
          { key: 'b', kind: 'STAMP', label: '2', row: 0, position: 1 },
          {
            key: 'm',
            kind: 'MILESTONE',
            label: 'M',
            row: 0,
            position: 2,
            reward: { type: 'FREE_ITEM' },
          },
        ],
      },
    };
    const runOpv = (apps: any[]) =>
      handler.validateApplications(opv, apps, txOf([item()]));

    it('validateConfig accepts condition-less stamps, drops stray conditions, keeps stampMode', () => {
      const out: any = handler.validateConfig({
        ...opv.config,
        slots: [
          {
            ...opv.config.slots[0],
            condition: { type: 'ITEM_MIN_PRICE', minPrice: 5 },
          },
          opv.config.slots[1],
          opv.config.slots[2],
        ],
      });
      expect(out.stampMode).toBe('ONE_PER_VISIT');
      expect(out.slots[0]).not.toHaveProperty('condition');
    });

    it('rejects an unknown stampMode and still requires conditions by default', () => {
      expectBadRequest(
        () => handler.validateConfig({ ...opv.config, stampMode: 'NOPE' }),
        'stampMode must be one of',
      );
      expectBadRequest(
        () => handler.validateConfig({ slots: opv.config.slots.slice(0, 1) }),
        'condition is required',
      );
      expect(handler.validateConfig(blueBearConfig as any)).not.toHaveProperty(
        'stampMode',
      );
    });

    it('a single stamp without itemIndex is clean', () => {
      expect(runOpv([stamp('a')]).map((v) => v.warnings)).toEqual([[]]);
    });

    it('a second stamp in the same transaction is a soft warning', () => {
      const out = runOpv([stamp('a'), stamp('b')]);
      expect(out[0].warnings).toEqual([]);
      expect(out[1].warnings).toEqual([
        expect.stringContaining('only one stamp per transaction'),
      ]);
    });

    it('a stamp with an itemIndex is kept with a warning and ignores the item', () => {
      const [v] = runOpv([stamp('a', 0)]);
      expect(v.warnings).toEqual([
        expect.stringContaining('itemIndex was ignored'),
      ]);
    });

    it('a MATCH_CONDITIONS program with a condition-less stamp is soft', () => {
      const switched = {
        ...opv,
        config: { ...opv.config, stampMode: undefined },
      };
      const [v] = handler.validateApplications(
        switched,
        [stamp('a', 0)],
        txOf([item()]),
      );
      expect(v.warnings).toEqual([
        expect.stringContaining('has no condition under the current config'),
      ]);
    });
  });

  describe('SOFT checks: redemptions', () => {
    it('PERCENT_OFF_ITEM: within percent of one unit (+0.01) is clean; above only warns', () => {
      const tx = txOf([item({ unitPrice: 79, quantity: 2 })]);
      expect(run([redeem('m1', 39.5)], tx)[0]).toMatchObject({
        discountAmount: 39.5,
        slotLabel: 'Cloud Break',
        warnings: [],
      });
      expect(run([redeem('m1', 39.51)], tx)[0].warnings).toEqual([]);
      const [over] = run([redeem('m1', 39.52)], tx);
      expect(over.discountAmount).toBe(39.52);
      expect(over.warnings).toEqual([
        expect.stringContaining('exceeds the computed maximum 39.5'),
      ]);
    });

    it('FREE_ITEM: caps at one unit price and honours sizeNames (as warnings)', () => {
      expect(run([redeem('m2', 79)], txOf([item()]))[0].warnings).toEqual([]);
      expect(run([redeem('m2', 80)], txOf([item()]))[0].warnings).toEqual([
        expect.stringContaining('exceeds'),
      ]);
      expect(
        run([redeem('m2', 50)], txOf([item({ sizeName: 'Large' })]))[0]
          .warnings,
      ).toEqual([expect.stringContaining('not eligible')]);
    });

    it('AMOUNT_OFF_ITEM: min(amount, unit price) and categoryNames (as warnings)', () => {
      expect(run([redeem('m3', 30)], txOf([item()]))[0].warnings).toEqual([]);
      expect(run([redeem('m3', 31)], txOf([item()]))[0].warnings).toHaveLength(
        1,
      );
      expect(
        run([redeem('m3', 10)], txOf([item({ categoryName: 'Pastries' })]))[0]
          .warnings,
      ).toHaveLength(1);
    });

    it('redeeming a slot that is now a stamp, or was removed, only warns', () => {
      expect(run([redeem('p1', 1)], txOf([item()]))[0].warnings).toEqual([
        'slot "p1" is no longer a MILESTONE slot',
      ]);
      const [gone] = run([redeem('old', 5)], txOf([item()]));
      expect(gone).toMatchObject({ slotLabel: 'old', discountAmount: 5 });
      expect(gone.warnings).toHaveLength(1);
    });
  });

  describe('HARD checks (400)', () => {
    it('itemIndex out of range', () => {
      expectBadRequest(
        () => run([stamp('p1', 3)], txOf([item()])),
        'out of range',
      );
      expectBadRequest(
        () => run([redeem('m1', 1, 5)], txOf([item()])),
        'out of range',
      );
    });

    it('the same slot twice in one program', () => {
      expectBadRequest(
        () => run([stamp('p1', 0), stamp('p1', 1)], txOf([item(), item()])),
        'only once per transaction',
      );
      // even when the slot is no longer in the config
      expectBadRequest(
        () => run([stamp('gone'), stamp('gone')], txOf([])),
        'only once per transaction',
      );
    });

    it('CARD_ISSUED more than once', () => {
      const one = run([{ programId: P, type: 'CARD_ISSUED' }], txOf([]));
      expect(one).toEqual([
        {
          type: 'CARD_ISSUED',
          slotKey: null,
          slotLabel: null,
          itemIndex: null,
          productName: null,
          discountAmount: null,
          warnings: [],
        },
      ]);
      expectBadRequest(
        () =>
          run(
            [
              { programId: P, type: 'CARD_ISSUED' },
              { programId: P, type: 'CARD_ISSUED' },
            ],
            txOf([]),
          ),
        'only once',
      );
    });

    it('more than one REWARD_REDEEMED in one program', () => {
      expectBadRequest(
        () =>
          run(
            [redeem('m1', 10, 0), redeem('m2', 10, 1)],
            txOf([item(), item()]),
          ),
        'only one REWARD_REDEEMED',
      );
    });

    it('more item stamps on an item than its quantity (one stamp per unit)', () => {
      expectBadRequest(
        () =>
          run([stamp('p1', 0), stamp('bb', 0)], txOf([item({ quantity: 1 })])),
        'cannot earn 2 item stamps',
      );
      expect(
        run([stamp('p1', 0), stamp('bb', 0)], txOf([item({ quantity: 2 })])),
      ).toHaveLength(2);
    });

    it('missing slotKey / itemIndex where required (defence in depth behind the DTO)', () => {
      expectBadRequest(
        () => run([{ programId: P, type: 'STAMP_ADDED' }], txOf([])),
        'requires slotKey',
      );
      expectBadRequest(
        () =>
          run(
            [
              {
                programId: P,
                type: 'REWARD_REDEEMED',
                slotKey: 'm1',
                discountAmount: 1,
              },
            ],
            txOf([item()]),
          ),
        'requires itemIndex',
      );
    });
  });

  it('computeMaxRedemption handles each reward type', () => {
    expect(
      computeMaxRedemption({ type: 'PERCENT_OFF_ITEM', percent: 50 }, 79),
    ).toBe(39.5);
    expect(computeMaxRedemption({ type: 'FREE_ITEM' }, 79)).toBe(79);
    expect(
      computeMaxRedemption({ type: 'AMOUNT_OFF_ITEM', amount: 100 }, 79),
    ).toBe(79);
    expect(
      computeMaxRedemption({ type: 'AMOUNT_OFF_ITEM', amount: 20 }, 79),
    ).toBe(20);
  });

  it('toEvents merges program-level warnings ahead of each event warning', () => {
    const base = {
      programId: P,
      programType: 'LOYALTY_CARD' as const,
      programName: 'Blue Bear',
      tenantId: 't',
      companyId: 'c',
      brandId: 'b',
      userId: 'u',
      occurredAt: new Date(0),
      validationWarnings: ['store is not enrolled in this program'],
    };
    const events = handler.toEvents(
      [
        {
          type: 'STAMP_ADDED',
          slotKey: 'gone',
          slotLabel: 'gone',
          itemIndex: null,
          productName: null,
          discountAmount: null,
          warnings: ['slot "gone" is no longer in the program config'],
        },
      ],
      base,
    );
    expect(events).toEqual([
      {
        ...base,
        type: 'STAMP_ADDED',
        slotKey: 'gone',
        slotLabel: 'gone',
        itemIndex: null,
        productName: null,
        discountAmount: null,
        validationWarnings: [
          'store is not enrolled in this program',
          'slot "gone" is no longer in the program config',
        ],
      },
    ]);
  });

  it('describe summarizes slot counts', () => {
    expect(handler.describe(blueBearConfig)).toBe('6 stamps, 3 milestones');
  });
});
