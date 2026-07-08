import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTransactionDto } from './create-transaction.dto';

const baseItem = {
  productId: 'prod-1',
  quantity: 1,
  subtotal: 100,
};

const basePayload = {
  transactionId: 'TXN-1',
  subtotal: 100,
  total: 100,
  items: [baseItem],
};

describe('CreateTransactionDto — split payment validation', () => {
  it('accepts a non-split transaction with no payments array', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      ...basePayload,
      paymentMethod: 'CASH',
      cashReceived: 100,
      change: 0,
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts a valid SPLIT transaction whose legs sum to the total', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      ...basePayload,
      paymentMethod: 'SPLIT',
      payments: [
        { method: 'CASH', amount: 60, cashReceived: 60 },
        { method: 'GCASH', amount: 40, referenceNumber: 'REF-1' },
      ],
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects SPLIT when the legs do not sum to the total', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      ...basePayload,
      paymentMethod: 'SPLIT',
      payments: [
        { method: 'CASH', amount: 60, cashReceived: 60 },
        { method: 'GCASH', amount: 30, referenceNumber: 'REF-1' },
      ],
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.constraints?.validPaymentSplits)).toBe(true);
  });

  it('rejects SPLIT with only one leg', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      ...basePayload,
      paymentMethod: 'SPLIT',
      payments: [{ method: 'CASH', amount: 100, cashReceived: 100 }],
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.constraints?.validPaymentSplits)).toBe(true);
  });

  it('rejects a CASH leg with insufficient cashReceived', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      ...basePayload,
      paymentMethod: 'SPLIT',
      payments: [
        { method: 'CASH', amount: 60, cashReceived: 50 },
        { method: 'GCASH', amount: 40, referenceNumber: 'REF-1' },
      ],
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.constraints?.validPaymentSplits)).toBe(true);
  });

  it('rejects a non-cash leg missing a referenceNumber', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      ...basePayload,
      paymentMethod: 'SPLIT',
      payments: [
        { method: 'CASH', amount: 60, cashReceived: 60 },
        { method: 'GCASH', amount: 40 },
      ],
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.constraints?.validPaymentSplits)).toBe(true);
  });

  it('rejects a non-SPLIT paymentMethod that still carries a payments array', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      ...basePayload,
      paymentMethod: 'CASH',
      cashReceived: 100,
      payments: [
        { method: 'CASH', amount: 60, cashReceived: 60 },
        { method: 'GCASH', amount: 40, referenceNumber: 'REF-1' },
      ],
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.constraints?.validPaymentSplits)).toBe(true);
  });
});
