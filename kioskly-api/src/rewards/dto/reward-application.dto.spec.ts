import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RewardApplicationDto } from './reward-application.dto';
import { CreateTransactionDto } from '../../transactions/dto/create-transaction.dto';

const programId = '665f1c2e9a1b2c3d4e5f6a7b';

const errorsFor = async (payload: object) =>
  validate(plainToInstance(RewardApplicationDto, payload));

describe('RewardApplicationDto', () => {
  it.each([
    ['CARD_ISSUED', { programId, type: 'CARD_ISSUED' }],
    [
      'item stamp',
      { programId, type: 'STAMP_ADDED', slotKey: 'p1', itemIndex: 0 },
    ],
    [
      'total stamp without itemIndex',
      { programId, type: 'STAMP_ADDED', slotKey: 'p98' },
    ],
    [
      'redemption',
      {
        programId,
        type: 'REWARD_REDEEMED',
        slotKey: 'm1',
        itemIndex: 1,
        discountAmount: 39.5,
      },
    ],
    [
      'zero-value redemption',
      {
        programId,
        type: 'REWARD_REDEEMED',
        slotKey: 'm1',
        itemIndex: 0,
        discountAmount: 0,
      },
    ],
  ])('accepts %s', async (_name, payload) => {
    expect(await errorsFor(payload)).toHaveLength(0);
  });

  it.each([
    [
      'CARD_ISSUED with a slotKey',
      { programId, type: 'CARD_ISSUED', slotKey: 'p1' },
    ],
    [
      'CARD_ISSUED with a discount',
      { programId, type: 'CARD_ISSUED', discountAmount: 5 },
    ],
    [
      'STAMP_ADDED without slotKey',
      { programId, type: 'STAMP_ADDED', itemIndex: 0 },
    ],
    [
      'STAMP_ADDED with a discount',
      {
        programId,
        type: 'STAMP_ADDED',
        slotKey: 'p1',
        itemIndex: 0,
        discountAmount: 1,
      },
    ],
    [
      'REWARD_REDEEMED without itemIndex',
      { programId, type: 'REWARD_REDEEMED', slotKey: 'm1', discountAmount: 5 },
    ],
    [
      'REWARD_REDEEMED without discountAmount',
      { programId, type: 'REWARD_REDEEMED', slotKey: 'm1', itemIndex: 0 },
    ],
  ])('rejects %s (shape constraint)', async (_name, payload) => {
    const errors = await errorsFor(payload);
    expect(errors.some((e) => e.constraints?.rewardApplicationShape)).toBe(
      true,
    );
  });

  it.each([
    [
      'non-ObjectId programId',
      { programId: 'abc', type: 'CARD_ISSUED' },
      'programId',
    ],
    ['unknown type', { programId, type: 'BOGO' }, 'type'],
    [
      'negative itemIndex',
      { programId, type: 'STAMP_ADDED', slotKey: 'p1', itemIndex: -1 },
      'itemIndex',
    ],
    [
      'fractional itemIndex',
      { programId, type: 'STAMP_ADDED', slotKey: 'p1', itemIndex: 0.5 },
      'itemIndex',
    ],
    [
      'negative discount',
      {
        programId,
        type: 'REWARD_REDEEMED',
        slotKey: 'm1',
        itemIndex: 0,
        discountAmount: -1,
      },
      'discountAmount',
    ],
    [
      'empty slotKey',
      { programId, type: 'STAMP_ADDED', slotKey: '' },
      'slotKey',
    ],
  ])('rejects %s', async (_name, payload, property) => {
    const errors = await errorsFor(payload);
    expect(errors.some((e) => e.property === property)).toBe(true);
  });

  it('is validated as a nested array on CreateTransactionDto', async () => {
    const base = {
      transactionId: 'TXN-1',
      subtotal: 100,
      total: 100,
      paymentMethod: 'CASH',
      items: [{ productId: 'p', quantity: 1, subtotal: 100 }],
    };
    const ok = await validate(
      plainToInstance(CreateTransactionDto, {
        ...base,
        rewards: [{ programId, type: 'CARD_ISSUED' }],
      }),
    );
    expect(ok).toHaveLength(0);
    const bad = await validate(
      plainToInstance(CreateTransactionDto, {
        ...base,
        rewards: [{ programId, type: 'STAMP_ADDED' }],
      }),
    );
    expect(bad.some((e) => e.property === 'rewards')).toBe(true);
    const none = await validate(plainToInstance(CreateTransactionDto, base));
    expect(none).toHaveLength(0);
  });
});
